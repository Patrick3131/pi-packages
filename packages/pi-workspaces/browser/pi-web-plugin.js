const panelTagName = "pi-web-melon-workspaces-panel";
const HTMLElementBase = globalThis.HTMLElement ?? class {};

const plugin = {
  apiVersion: 2,
  name: "Melon Workspaces",
  activate: ({ runtimePluginId, html }) => {
    definePanelElement();
    return {
      contributions: {
        actions: [
          {
            id: "workspace.open-workflow",
            title: "Open Melon Workspace Workflow",
            description: "Create, pull, sync, commit, push, review, merge, or open an agent in a task worktree.",
            group: "Workspace",
            enabled: ({ state }) => state.selectedWorkspace !== undefined,
            run: ({ selectWorkspaceTool }) => {
              selectWorkspaceTool(`${runtimePluginId}:workspace.melon-workflow`);
            },
          },
          {
            id: "workspace.start-pi",
            title: "Start Pi in Current Workspace",
            description: "Start a new Pi chat in the selected worktree.",
            group: "Workspace",
            enabled: ({ state }) => state.selectedWorkspace !== undefined,
            run: ({ startSession }) => startSession(),
          },
        ],
        workspacePanels: [
          {
            id: "workspace.melon-workflow",
            title: "Workflow",
            order: 35,
            visible: ({ workspace }) => isGitWorkspace(workspace),
            render: (context) => html`<pi-web-melon-workspaces-panel .context=${context}></pi-web-melon-workspaces-panel>`,
          },
        ],
        workspaceLabels: [
          {
            id: "workspace.owner",
            order: 25,
            visible: ({ workspace }) => branchOwner(workspaceBranch(workspace)) !== undefined,
            items: ({ workspace }) => {
              const owner = branchOwner(workspaceBranch(workspace));
              return owner === undefined ? [] : [{ type: "text", text: owner === "pi" ? "Pi" : "Codex", title: `Owned by ${owner}` }];
            },
          },
        ],
      },
    };
  },
};

export default plugin;

export function branchOwner(branch) {
  if (typeof branch !== "string") return undefined;
  if (branch.startsWith("pi/")) return "pi";
  if (branch.startsWith("codex/")) return "codex";
  return undefined;
}

export function workspaceBranch(workspace) {
  const branch = workspace?.provider?.metadata?.branch;
  return typeof branch === "string" ? branch : undefined;
}

export function isGitWorkspace(workspace) {
  return workspace?.provider?.metadata?.isGitRepo === true;
}

export function previewSource(state) {
  if (state?.status === "stopped") return undefined;
  return {
    status: typeof state?.status === "string" ? state.status : "unknown",
    workspace: typeof state?.workspace === "string" ? state.workspace : "Unknown workspace",
    branch: typeof state?.branch === "string" ? state.branch : "Unknown branch",
    apps: Array.isArray(state?.apps) ? state.apps.filter((app) => typeof app === "string") : [],
    url: typeof state?.url === "string" ? state.url : "https://preview.melonlabs.ai",
  };
}

export function validTaskName(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value);
}

export function validCommitMessage(value) {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 200
    && !/[\r\n]/u.test(value);
}

export function validBranchName(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/u.test(value)
    && !value.includes("..")
    && !value.includes("//")
    && !value.endsWith("/");
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function definePanelElement() {
  if (typeof customElements === "undefined" || customElements.get(panelTagName)) return;
  customElements.define(panelTagName, MelonWorkspacesPanel);
}

class MelonWorkspacesPanel extends HTMLElementBase {
  contextValue;
  busy = false;
  status;
  previewState;
  previewStatusError;
  previewLoading = false;
  root;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
  }

  set context(value) {
    const previous = this.contextValue?.workspace?.id;
    this.contextValue = value;
    if (previous !== value?.workspace?.id) this.status = undefined;
    this.render();
  }

  connectedCallback() {
    this.render();
    void this.refreshPreviewState();
  }

  render() {
    const context = this.contextValue;
    if (context === undefined) {
      this.root.innerHTML = `${styles()}<section class="empty">Select a workspace.</section>`;
      return;
    }

    const branch = workspaceBranch(context.workspace);
    const workspaceActions = this.renderWorkspaceActions(branch);
    const branchActions = branch === "staging" || branch === "production" ? this.renderBranchActions(branch) : "";
    const releaseActions = branch === "staging" ? this.renderReleaseActions() : "";
    this.root.innerHTML = `
      ${styles()}
      <section class="toolbar">
        <div><strong>Melon Workspace Workflow</strong><span>${escapeHtml(branch ?? context.workspace.label)}</span></div>
        <button class="secondary" data-open-terminal>Terminal</button>
      </section>
      ${this.renderStatus()}
      <section class="viewer">
        <article class="card">
          <div class="card-heading"><strong>Create task workspace</strong><span>Creates an isolated branch from staging and shares the project environment.</span></div>
          <div class="create-grid">
            <label>Owner<select data-owner><option value="pi">Pi</option><option value="codex">Codex</option></select></label>
            <label>Task name<input data-task placeholder="fix-auth" autocomplete="off"></label>
            <label>Base branch<input data-base value="staging" autocomplete="off"></label>
            <button data-create ${this.busy ? "disabled" : ""}>Create</button>
          </div>
        </article>
        ${workspaceActions}
        ${this.renderPreviewActions()}
        ${branchActions}
        ${releaseActions}
        <p class="hint">Pi Web discovers created worktrees automatically. Use <strong>Start Pi in Current Workspace</strong> from the action palette for a new Pi chat. Native workspace deletion remains in the workspace menu.</p>
      </section>
    `;

    this.root.querySelector("[data-open-terminal]")?.addEventListener("click", () => context.terminal.open());
    this.root.querySelector("[data-create]")?.addEventListener("click", () => void this.createWorkspace(context));
    this.root.querySelector("[data-commit]")?.addEventListener("click", () => void this.commitChanges(context, branch));
    this.root.querySelector("[data-sync]")?.addEventListener("click", () => void this.runAndWait(context, "Update from staging", "melon-worktree sync staging"));
    this.root.querySelector("[data-sync-production]")?.addEventListener("click", () => void this.runAndWait(context, "Update from production", "melon-worktree sync production"));
    this.root.querySelector("[data-push]")?.addEventListener("click", () => void this.runAndWait(context, "Push task branch", "melon-worktree push"));
    this.root.querySelector("[data-pr]")?.addEventListener("click", () => void this.runAndWait(context, "Create or open pull request", "melon-worktree pr staging"));
    this.root.querySelector("[data-merge]")?.addEventListener("click", () => {
      if (window.confirm(`Squash-merge ${branch} into staging through its GitHub pull request?`)) {
        void this.runAndWait(context, "Merge pull request into staging", "melon-worktree merge staging", true);
      }
    });
    this.root.querySelector("[data-promote]")?.addEventListener("click", () => void this.runAndWait(context, "Create or open production PR", "melon-worktree promote staging production"));
    this.root.querySelector("[data-promote-merge]")?.addEventListener("click", () => {
      if (window.confirm("Merge the staging promotion pull request into production? This may trigger the production deployment.")) {
        void this.runAndWait(context, "Merge staging into production", "melon-worktree promote-merge staging production", true);
      }
    });
    this.root.querySelector("[data-pull-production-into-staging]")?.addEventListener("click", () => void this.runAndWait(context, "Pull production into staging", "melon-worktree sync-branch production staging", true));
    this.root.querySelector("[data-push-staging]")?.addEventListener("click", () => void this.runAndWait(context, "Push staging", "melon-worktree push-current staging"));
    this.root.querySelector("[data-push-staging-to-production]")?.addEventListener("click", () => {
      if (window.confirm("Push staging directly to production? This requires production to be fast-forwardable and may trigger deployment.")) {
        void this.runAndWait(context, "Push staging to production", "melon-worktree push-branch staging production", true);
      }
    });
    this.root.querySelector("[data-pull-staging-into-production]")?.addEventListener("click", () => {
      if (window.confirm("Pull staging into production and push production? This may trigger the production deployment.")) {
        void this.runAndWait(context, "Pull staging into production", "melon-worktree sync-branch staging production", true);
      }
    });
    this.root.querySelector("[data-push-production]")?.addEventListener("click", () => {
      if (window.confirm("Push the current production branch? This may trigger deployment.")) {
        void this.runAndWait(context, "Push production", "melon-worktree push-current production");
      }
    });
    this.root.querySelector("[data-codex]")?.addEventListener("click", () => void this.openCodex(context));
    this.root.querySelector("[data-preview-start]")?.addEventListener("click", () => {
      void this.runAndWait(context, "Start workspace preview", "melon-preview start .")
        .then(() => this.refreshPreviewState());
    });
    this.root.querySelector("[data-preview-open]")?.addEventListener("click", () => {
      window.open("https://preview.melonlabs.ai", "_blank", "noopener,noreferrer");
    });
    this.root.querySelector("[data-preview-logs]")?.addEventListener("click", () => {
      void context.terminal.runCommand({
        title: "Live preview logs — Ctrl-C to close",
        command: "melon-preview logs --follow",
        open: true,
        metadata: { workflow: "melon-workspaces", preview: "logs" },
      });
    });
    this.root.querySelector("[data-preview-refresh]")?.addEventListener("click", () => {
      void this.refreshPreviewState();
    });
    this.root.querySelector("[data-preview-stop]")?.addEventListener("click", () => {
      if (window.confirm("Stop the currently active workspace preview?")) {
        void this.runAndWait(context, "Stop workspace preview", "melon-preview stop")
          .then(() => this.refreshPreviewState());
      }
    });
  }

  renderWorkspaceActions(branch) {
    const owner = branchOwner(branch);
    return `
      <article class="card">
        <div class="card-heading"><strong>${escapeHtml(branch ?? "Git workspace")}</strong><span>${owner === undefined ? "Git workspace operations" : `${owner === "codex" ? "Codex" : "Pi"}-owned task workspace`}</span></div>
        <div class="actions">
          ${owner === "codex" ? `<button data-codex ${this.busy ? "disabled" : ""}>Open Codex</button>` : ""}
          <button data-sync ${this.busy ? "disabled" : ""}>Pull staging</button>
          <button data-sync-production ${this.busy ? "disabled" : ""}>Pull production</button>
          <button data-commit ${this.busy ? "disabled" : ""}>Commit changes</button>
          <button data-push ${this.busy ? "disabled" : ""}>Push</button>
          <button data-pr ${this.busy ? "disabled" : ""}>Create / Open PR</button>
          <button class="danger" data-merge ${this.busy ? "disabled" : ""}>Merge into staging</button>
        </div>
      </article>
    `;
  }

  renderPreviewActions() {
    const source = previewSource(this.previewState);
    const details = source === undefined
      ? `<div class="preview-empty">${this.previewLoading ? "Loading active preview…" : "No preview is currently running."}</div>`
      : `<dl class="preview-details">
          <div><dt>Status</dt><dd class="preview-${escapeAttr(source.status)}">${escapeHtml(source.status)}</dd></div>
          <div><dt>Branch</dt><dd>${escapeHtml(source.branch)}</dd></div>
          <div><dt>Workspace</dt><dd title="${escapeAttr(source.workspace)}">${escapeHtml(source.workspace)}</dd></div>
          <div><dt>Apps</dt><dd>${escapeHtml(source.apps.join(", ") || "None")}</dd></div>
          <div><dt>URL</dt><dd>${escapeHtml(source.url)}</dd></div>
        </dl>`;
    return `
      <article class="card">
        <div class="card-heading"><strong>Workspace preview</strong><span>Run this Git workspace at preview.melonlabs.ai with hot reload and the protected staging environment.</span></div>
        ${details}
        ${this.previewStatusError === undefined ? "" : `<div class="status error">${escapeHtml(this.previewStatusError)}</div>`}
        <div class="actions">
          <button data-preview-start ${this.busy ? "disabled" : ""}>Start / Switch Preview</button>
          <button data-preview-open ${this.busy ? "disabled" : ""}>Open Preview</button>
          <button class="secondary" data-preview-refresh ${this.previewLoading ? "disabled" : ""}>Refresh Status</button>
          <button class="secondary" data-preview-logs ${this.busy ? "disabled" : ""}>Live Logs</button>
          <button class="danger" data-preview-stop ${this.busy ? "disabled" : ""}>Stop Preview</button>
        </div>
      </article>
    `;
  }

  async refreshPreviewState() {
    if (this.previewLoading) return;
    this.previewLoading = true;
    this.previewStatusError = undefined;
    this.render();
    try {
      const response = await fetch("https://preview.melonlabs.ai/__preview/status", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Preview status returned HTTP ${response.status}.`);
      this.previewState = await response.json();
    } catch (error) {
      this.previewStatusError = error instanceof Error ? error.message : String(error);
    } finally {
      this.previewLoading = false;
      this.render();
    }
  }

  renderBranchActions(branch) {
    if (branch === "staging") {
      return `
        <article class="card">
          <div class="card-heading"><strong>Staging synchronization</strong><span>Pull production into staging, push staging, or fast-forward production from this checkout.</span></div>
          <div class="actions">
            <button data-pull-production-into-staging ${this.busy ? "disabled" : ""}>Pull production into staging</button>
            <button data-push-staging ${this.busy ? "disabled" : ""}>Push staging</button>
            <button class="danger" data-push-staging-to-production ${this.busy ? "disabled" : ""}>Push staging to production</button>
          </div>
        </article>
      `;
    }
    return `
      <article class="card">
        <div class="card-heading"><strong>Production synchronization</strong><span>Pull staging into production or push the checked-out production branch.</span></div>
        <div class="actions">
          <button class="danger" data-pull-staging-into-production ${this.busy ? "disabled" : ""}>Pull staging into production</button>
          <button class="danger" data-push-production ${this.busy ? "disabled" : ""}>Push production</button>
        </div>
      </article>
    `;
  }

  renderReleaseActions() {
    return `
      <article class="card">
        <div class="card-heading"><strong>Release staging</strong><span>Promote the current staging branch to production through a reviewed GitHub pull request.</span></div>
        <div class="actions">
          <button data-promote ${this.busy ? "disabled" : ""}>Create / Open Production PR</button>
          <button class="danger" data-promote-merge ${this.busy ? "disabled" : ""}>Merge into production</button>
        </div>
      </article>
    `;
  }

  renderStatus() {
    if (this.status === undefined) return "";
    return `<div class="status ${escapeAttr(this.status.kind)}">${escapeHtml(this.status.message)}</div>`;
  }

  async commitChanges(context, branch) {
    if (this.busy) return;
    const message = window.prompt("Commit all current changes in this workspace. Enter a commit message:", `Update ${branch ?? "workspace"}`);
    if (message === null) return;
    if (!validCommitMessage(message)) {
      this.status = { kind: "error", message: "Enter a non-empty one-line commit message (maximum 200 characters)." };
      this.render();
      return;
    }
    await this.runAndWait(context, "Commit changes", `melon-worktree commit ${shellQuote(message.trim())}`);
  }

  async createWorkspace(context) {
    const owner = this.root.querySelector("[data-owner]")?.value ?? "";
    const task = this.root.querySelector("[data-task]")?.value.trim() ?? "";
    const base = this.root.querySelector("[data-base]")?.value.trim() ?? "";
    if ((owner !== "pi" && owner !== "codex") || !validTaskName(task) || !validBranchName(base)) {
      this.status = { kind: "error", message: "Use a valid owner, simple task name, and Git branch name." };
      this.render();
      return;
    }
    const command = `melon-worktree create ${shellQuote(owner)} ${shellQuote(task)} ${shellQuote(base)}`;
    await this.runAndWait(context, `Create ${owner}/${task}`, command, true);
  }

  async runAndWait(context, title, command, reload = false) {
    if (this.busy) return;
    this.busy = true;
    this.status = { kind: "info", message: `${title} started in a workspace terminal.` };
    this.render();
    try {
      const handle = await context.terminal.runCommand({ title, command, open: true, metadata: { workflow: "melon-workspaces" } });
      const completed = await handle.completed;
      this.busy = false;
      if (completed.status !== "succeeded") throw new Error(`${title} failed with exit code ${String(completed.exitCode ?? "unknown")}.`);
      this.status = { kind: "success", message: `${title} completed.` };
      this.render();
      if (reload) window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      this.busy = false;
      this.status = { kind: "error", message: error instanceof Error ? error.message : String(error) };
      this.render();
    }
  }

  async openCodex(context) {
    if (this.busy) return;
    this.status = { kind: "info", message: "Opening Codex in a persistent workstation session…" };
    this.render();
    try {
      await context.terminal.runCommand({
        title: `Codex: ${workspaceBranch(context.workspace) ?? context.workspace.label}`,
        command: "melon-codex open .",
        open: true,
        metadata: { workflow: "melon-workspaces", agent: "codex" },
      });
    } catch (error) {
      this.status = { kind: "error", message: error instanceof Error ? error.message : String(error) };
      this.render();
    }
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function styles() {
  return `
    <style>
      :host { display: contents; }
      .toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--pi-border-muted); }
      .toolbar div, .card-heading { display: grid; gap: 3px; }
      .toolbar span, .card-heading span, .hint { color: var(--pi-muted); }
      .viewer { box-sizing: border-box; display: grid; align-content: start; gap: 12px; min-height: 0; overflow: auto; padding: 12px; }
      .card { display: grid; gap: 12px; border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); padding: 12px; }
      .preview-details { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin: 0; }
      .preview-details div { min-width: 0; border: 1px solid var(--pi-border-muted); border-radius: 7px; padding: 8px; }
      .preview-details dt { color: var(--pi-muted); font-size: 11px; text-transform: uppercase; }
      .preview-details dd { margin: 3px 0 0; overflow: hidden; color: var(--pi-text-secondary); font-family: var(--pi-control-monospace-font-family); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
      .preview-details .preview-running { color: var(--pi-success); }
      .preview-details .preview-error { color: var(--pi-danger); }
      .preview-empty { color: var(--pi-muted); font-size: 13px; }
      .create-grid { display: grid; grid-template-columns: minmax(90px, .7fr) minmax(160px, 1.4fr) minmax(130px, 1fr) auto; gap: 10px; align-items: end; }
      label { display: grid; gap: 5px; color: var(--pi-text-secondary); font-size: 12px; }
      input, select { box-sizing: border-box; width: 100%; border: 1px solid var(--pi-border); border-radius: 7px; background: var(--pi-bg); color: var(--pi-text); padding: 7px 8px; font: inherit; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      button { border: 1px solid var(--pi-accent-border); border-radius: 7px; background: var(--pi-accent); color: var(--pi-bg); cursor: pointer; padding: 7px 10px; font: inherit; }
      button.secondary { border-color: var(--pi-border); background: var(--pi-surface); color: var(--pi-text); }
      button.danger { border-color: var(--pi-danger, #d84a4a); background: transparent; color: var(--pi-danger, #d84a4a); }
      button:disabled { cursor: wait; opacity: .6; }
      .status { margin: 10px 12px 0; border: 1px solid var(--pi-border); border-radius: 8px; padding: 9px 10px; }
      .status.info { color: var(--pi-text-secondary); }
      .status.success { color: var(--pi-success, #4caf76); }
      .status.error { color: var(--pi-danger, #d84a4a); }
      .hint { margin: 0; font-size: 12px; line-height: 1.5; }
      .empty { padding: 16px; color: var(--pi-muted); }
      @media (max-width: 720px) { .create-grid { grid-template-columns: 1fr; } .create-grid button { width: 100%; } }
    </style>
  `;
}
