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
            description: "Create, sync, push, review, merge, or open an agent in a task worktree.",
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

export function validTaskName(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value);
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
  }

  render() {
    const context = this.contextValue;
    if (context === undefined) {
      this.root.innerHTML = `${styles()}<section class="empty">Select a workspace.</section>`;
      return;
    }

    const branch = workspaceBranch(context.workspace);
    const owner = branchOwner(branch);
    const taskActions = owner === undefined ? "" : this.renderTaskActions(branch);
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
        ${taskActions}
        <p class="hint">Pi Web discovers created worktrees automatically. Use <strong>Start Pi in Current Workspace</strong> from the action palette for a new Pi chat. Native workspace deletion remains in the workspace menu.</p>
      </section>
    `;

    this.root.querySelector("[data-open-terminal]")?.addEventListener("click", () => context.terminal.open());
    this.root.querySelector("[data-create]")?.addEventListener("click", () => void this.createWorkspace(context));
    this.root.querySelector("[data-sync]")?.addEventListener("click", () => void this.runAndWait(context, "Update from staging", "melon-worktree sync staging"));
    this.root.querySelector("[data-push]")?.addEventListener("click", () => void this.runAndWait(context, "Push task branch", "melon-worktree push"));
    this.root.querySelector("[data-pr]")?.addEventListener("click", () => void this.runAndWait(context, "Create or open pull request", "melon-worktree pr staging"));
    this.root.querySelector("[data-merge]")?.addEventListener("click", () => {
      if (window.confirm(`Squash-merge ${branch} into staging through its GitHub pull request?`)) {
        void this.runAndWait(context, "Merge pull request into staging", "melon-worktree merge staging", true);
      }
    });
    this.root.querySelector("[data-codex]")?.addEventListener("click", () => void this.openCodex(context));
  }

  renderTaskActions(branch) {
    const owner = branchOwner(branch);
    return `
      <article class="card">
        <div class="card-heading"><strong>${escapeHtml(branch)}</strong><span>${owner === "codex" ? "Codex-owned task workspace" : "Pi-owned task workspace"}</span></div>
        <div class="actions">
          ${owner === "codex" ? `<button data-codex ${this.busy ? "disabled" : ""}>Open Codex</button>` : ""}
          <button data-sync ${this.busy ? "disabled" : ""}>Update from staging</button>
          <button data-push ${this.busy ? "disabled" : ""}>Push</button>
          <button data-pr ${this.busy ? "disabled" : ""}>Create / Open PR</button>
          <button class="danger" data-merge ${this.busy ? "disabled" : ""}>Merge into staging</button>
        </div>
      </article>
    `;
  }

  renderStatus() {
    if (this.status === undefined) return "";
    return `<div class="status ${escapeAttr(this.status.kind)}">${escapeHtml(this.status.message)}</div>`;
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
