import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import {
  finishedDirExists,
  openDirExists,
  resolveWorkConfig,
  workStructureExists,
} from "./config.js";
import { discoverWorkPackages, packageCompleteness, resolvePackageFromPath } from "./discover.js";
import {
  formatPackageDetail,
  formatPackageLabel,
  formatPackageListHeader,
  formatSelectItems,
  isGroupHeaderLabel,
} from "./format.js";
import {
  buildImplementPrompt,
  buildInjectPathsPrompt,
  buildPlanAndImplementPrompt,
  buildPlanPrompt,
  buildReadPrompt,
  buildSkillHandoffMessage,
} from "./prompts.js";
import { assessReadiness } from "./readiness.js";
import { initWorkScaffold } from "./scaffold.js";
import type { LifecycleFilter, WorkPackage } from "./types.js";

export type { WorkConfig, WorkPackage, WorkFile, WorkFrontmatter, DiscoverOptions } from "./types.js";
export { resolveWorkConfig, workStructureExists, openDirExists, finishedDirExists } from "./config.js";
export { discoverWorkPackages, packageCompleteness, resolvePackageFromPath } from "./discover.js";
export { initWorkScaffold, getScaffoldSourceDir } from "./scaffold.js";
export {
  formatPackageDetail,
  formatPackageLabel,
  formatPackageListHeader,
  formatSelectItems,
  isGroupHeaderLabel,
} from "./format.js";
export {
  buildImplementPrompt,
  buildInjectPathsPrompt,
  buildPlanAndImplementPrompt,
  buildPlanPrompt,
  buildReadPrompt,
  buildSkillHandoffMessage,
  buildImplementUserArgs,
  buildPlanUserArgs,
  buildPlanAndImplementUserArgs,
} from "./prompts.js";
export {
  parseMarkdown,
  parseFrontmatter,
  classifyBasename,
  extractDateFromBaseName,
  inferTypeFromBaseName,
} from "./parse.js";
export {
  assessReadiness,
  hasBlockingOpenQuestions,
  readinessMarker,
  isExecutableType,
} from "./readiness.js";
export {
  formatSkillBlock,
  loadAllPackageSkills,
  loadPackageSkill,
  loadSkillFromFile,
  packageRootFromModuleUrl,
  PACKAGE_SKILL_NAMES,
  siblingSkillExists,
  skillFilePath,
  skillsDir,
  stripFrontmatter,
} from "./skills.js";

type ActionId =
  | "read-primary"
  | "read-package"
  | "inject"
  | "implement"
  | "cancel";

const ACTION_LABELS: Record<ActionId, string> = {
  "read-primary": "Read primary (send to agent)",
  "read-package": "Read full package (send to agent)",
  inject: "Inject paths into chat",
  implement: "Implement (TDD runner)",
  cancel: "Cancel",
};

/** Exported for tests. */
export function parseWorkArgs(args: string): { sub?: string; query?: string } {
  const trimmed = args.trim();
  if (!trimmed) return {};

  const [first, ...rest] = trimmed.split(/\s+/);
  const subcommands = new Set([
    "open",
    "finished",
    "all",
    "init",
    "new",
    "plan",
    "plan-implement",
    "help",
  ]);
  if (subcommands.has(first)) {
    return { sub: first, query: rest.join(" ").trim() || undefined };
  }
  return { query: trimmed };
}

function requireInteractive(ctx: ExtensionCommandContext, feature: string): boolean {
  if (!ctx.hasUI) {
    ctx.ui.notify(`${feature} requires interactive UI (TUI/RPC).`, "error");
    return false;
  }
  return true;
}

function sendWhenIdle(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string): void {
  if (!ctx.isIdle()) {
    ctx.ui.notify("Agent is busy. Queuing as follow-up.", "warning");
    pi.sendUserMessage(message, { deliverAs: "followUp" });
    return;
  }
  pi.sendUserMessage(message);
}

async function ensureStructure(
  ctx: ExtensionCommandContext,
  config: ReturnType<typeof resolveWorkConfig>
): Promise<boolean> {
  if (workStructureExists(config) && openDirExists(config)) {
    return true;
  }

  if (!requireInteractive(ctx, "/work")) return false;

  const create = await ctx.ui.confirm(
    "Work docs not found",
    `No work structure at ${config.root}.\nCreate the standard scaffold now?`
  );
  if (!create) {
    ctx.ui.notify("Cancelled. Run /work init to scaffold later.", "info");
    return false;
  }

  try {
    const result = initWorkScaffold(config);
    ctx.ui.notify(
      `Scaffolded ${config.root} (${result.created.length} created, ${result.skipped.length} skipped)`,
      "info"
    );
    return true;
  } catch (error) {
    ctx.ui.notify(
      `Failed to scaffold: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
    return false;
  }
}

async function showDetailAndAct(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  pkg: WorkPackage
): Promise<void> {
  const detail = formatPackageDetail(pkg);
  ctx.ui.notify(detail.split("\n").slice(0, 16).join("\n"), "info");

  const c = packageCompleteness(pkg);
  const readiness = assessReadiness(pkg);
  const actions: ActionId[] = ["read-primary", "read-package", "inject"];
  if (pkg.lifecycle === "open") actions.push("implement");
  actions.push("cancel");

  const labels = actions.map((id) => {
    if (id === "implement") {
      if (!readiness.ready) {
        return `${ACTION_LABELS[id]} (${readiness.level})`;
      }
      if (!c.complete) {
        return `${ACTION_LABELS[id]} (incomplete package)`;
      }
    }
    return ACTION_LABELS[id];
  });

  const selected = await ctx.ui.select(`${pkg.title}`, labels);
  if (!selected || selected === ACTION_LABELS.cancel) return;

  if (selected.startsWith(ACTION_LABELS["read-primary"])) {
    sendWhenIdle(pi, ctx, buildReadPrompt(pkg, "primary"));
    return;
  }
  if (selected.startsWith(ACTION_LABELS["read-package"])) {
    sendWhenIdle(pi, ctx, buildReadPrompt(pkg, "package"));
    return;
  }
  if (selected.startsWith(ACTION_LABELS.inject)) {
    sendWhenIdle(pi, ctx, buildInjectPathsPrompt(pkg));
    return;
  }
  if (selected.startsWith(ACTION_LABELS.implement)) {
    if (!readiness.ready) {
      const proceed = await ctx.ui.confirm(
        "Not implementation-ready",
        `${readiness.reasons.join("\n")}\n\nSend implement handoff anyway?`
      );
      if (!proceed) return;
    } else if (!c.complete) {
      const proceed = await ctx.ui.confirm(
        "Incomplete package",
        `Missing: ${c.missing.join(", ")}.\nSend implement handoff anyway?`
      );
      if (!proceed) return;
    }
    // Full skill body + user args (P0: extension messages skip /skill: expansion)
    sendWhenIdle(pi, ctx, buildImplementPrompt(pkg));
  }
}

async function browse(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  lifecycle: LifecycleFilter,
  query?: string
): Promise<void> {
  const config = resolveWorkConfig({ cwd: ctx.cwd });

  if (lifecycle !== "finished") {
    const ok = await ensureStructure(ctx, config);
    if (!ok) return;
  } else if (!workStructureExists(config) || !finishedDirExists(config)) {
    ctx.ui.notify(`No finished work directory at ${config.finishedAbs}`, "warning");
    return;
  }

  const packages = discoverWorkPackages(config, { lifecycle, query });
  if (packages.length === 0) {
    ctx.ui.notify(
      `${formatPackageListHeader(0, lifecycle, query)}. Use /work new to create one, or /work init if structure is missing.`,
      "info"
    );
    return;
  }

  if (!requireInteractive(ctx, "/work")) {
    const lines = packages.slice(0, 20).map((p) => `${formatPackageLabel(p)} — ${p.baseName}`);
    ctx.ui.notify(lines.join("\n"), "info");
    return;
  }

  const { labels, byLabel } = formatSelectItems(packages, { groupByType: true });
  const header = formatPackageListHeader(packages.length, lifecycle, query);

  // Re-prompt if user accidentally selects a type header
  let selectedLabel = await ctx.ui.select(header, labels);
  while (selectedLabel && isGroupHeaderLabel(selectedLabel)) {
    ctx.ui.notify("That is a type group header — pick a work package.", "info");
    selectedLabel = await ctx.ui.select(header, labels);
  }
  if (!selectedLabel) return;

  const pkg = byLabel.get(selectedLabel);
  if (!pkg) {
    ctx.ui.notify("Selection not found.", "error");
    return;
  }

  await showDetailAndAct(pi, ctx, pkg);
}

function printHelp(ctx: ExtensionCommandContext): void {
  ctx.ui.notify(
    [
      "/work — browse open work packages (grouped by type in the view)",
      "/work open [query] — open work only",
      "/work finished [query] — finished archive",
      "/work all [query] — open + finished",
      "/work init — scaffold docs/work structure",
      "/work new [topic] — create work item (task-and-plan-routing)",
      "/work plan [topic] — alias of /work new",
      "/work plan-implement [topic] — plan then implement to completion",
      "/work help — this help",
      "",
      "Folders stay flat (open vs finished). Type is metadata for UI grouping only.",
      "Env: PI_WORK_ROOT, PI_WORK_OPEN_DIR, PI_WORK_FINISHED_DIR",
    ].join("\n"),
    "info"
  );
}

async function runInit(ctx: ExtensionCommandContext): Promise<void> {
  const config = resolveWorkConfig({ cwd: ctx.cwd });
  try {
    const result = initWorkScaffold(config);
    ctx.ui.notify(
      `Initialized ${result.rootAbs}\ncreated: ${result.created.length}\nskipped: ${result.skipped.length}`,
      "info"
    );
  } catch (error) {
    ctx.ui.notify(
      `Init failed: ${error instanceof Error ? error.message : String(error)}`,
      "error"
    );
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("work", {
    description: "Browse docs/work packages and hand off plan/implement workflows",
    getArgumentCompletions: (prefix) => {
      const options = [
        "open",
        "finished",
        "all",
        "init",
        "new",
        "plan",
        "plan-implement",
        "help",
      ];
      const filtered = options.filter((o) => o.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const { sub, query } = parseWorkArgs(args);

      switch (sub) {
        case "help":
          printHelp(ctx);
          return;
        case "init":
          await runInit(ctx);
          return;
        case "new":
        case "plan":
          // Full skill body embedded (P0)
          sendWhenIdle(pi, ctx, buildPlanPrompt(query));
          return;
        case "plan-implement":
          sendWhenIdle(pi, ctx, buildPlanAndImplementPrompt(query));
          return;
        case "finished":
          await browse(pi, ctx, "finished", query);
          return;
        case "all":
          await browse(pi, ctx, "all", query);
          return;
        case "open":
          await browse(pi, ctx, "open", query);
          return;
        default:
          await browse(pi, ctx, "open", query);
      }
    },
  });
}

// silence unused import if tree-shaken differently
void buildSkillHandoffMessage;
void resolvePackageFromPath;
