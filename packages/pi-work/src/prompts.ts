import type { WorkPackage } from "./types.js";
import { packageCompleteness } from "./discover.js";
import { formatPackageDetail } from "./format.js";
import { assessReadiness } from "./readiness.js";
import {
  formatSkillBlock,
  loadPackageSkill,
  type PackageSkillName,
  packageRootFromModuleUrl,
} from "./skills.js";

function pathsBlock(pkg: WorkPackage): string {
  const lines: string[] = [];
  if (pkg.primary) lines.push(`Primary work-item doc: ${pkg.primary.path}`);
  if (pkg.todo) lines.push(`Companion to-do list: ${pkg.todo.path}`);
  if (pkg.test) lines.push(`Companion test plan: ${pkg.test.path}`);
  return lines.join("\n");
}

function readinessBlock(pkg: WorkPackage): string {
  const a = assessReadiness(pkg);
  const lines = [
    `Implementation readiness: ${a.ready ? "READY" : a.level.toUpperCase()}`,
  ];
  if (a.reasons.length) {
    lines.push("Readiness issues:");
    for (const r of a.reasons) lines.push(`- ${r}`);
  }
  if (a.notes.length) {
    lines.push("Notes:");
    for (const n of a.notes) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}

/** Build user-args / task body for a skill handoff (appended after skill block). */
export function buildReadPrompt(pkg: WorkPackage, mode: "primary" | "package"): string {
  const c = packageCompleteness(pkg);
  const detail = formatPackageDetail(pkg);

  if (mode === "primary") {
    const path = pkg.primary?.path ?? pkg.files[0]?.path;
    return [
      "Read and summarize this work item for me.",
      "",
      detail,
      "",
      readinessBlock(pkg),
      "",
      path ? `Focus file: ${path}` : "",
      "",
      "Instructions:",
      "- Read the file(s) with the read tool.",
      "- Summarize problem, outcome, scope, and acceptance criteria.",
      "- Note missing companions and implementation readiness.",
      c.complete ? "" : `- Missing companions: ${c.missing.join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    "Read this work package (primary + companions) and give me a concise briefing.",
    "",
    detail,
    "",
    pathsBlock(pkg),
    "",
    readinessBlock(pkg),
    "",
    "Instructions:",
    "- Read all available package files.",
    "- Summarize goal, remaining to-dos, and test strategy.",
    "- Call out implementation readiness or missing detail.",
  ].join("\n");
}

export function buildImplementUserArgs(pkg: WorkPackage): string {
  const c = packageCompleteness(pkg);
  const readiness = assessReadiness(pkg);
  return [
    "Implement this existing work item using the implement-tdd-review workflow.",
    "",
    `Title: ${pkg.title}`,
    `Base: ${pkg.baseName}`,
    pathsBlock(pkg),
    "",
    readinessBlock(pkg),
    "",
    "Instructions:",
    "- Treat these files as the canonical scope.",
    "- Keep the companion to-do list updated during execution.",
    "- Set all three artifacts to status `in_progress` when execution begins.",
    "- Use TDD for risk-justified automated coverage: tests first, then implementation.",
    "- When writing a failing test first, verify it fails for the intended reason before implementing.",
    "- Honor an explicit `No automated test needed` decision instead of inventing a test.",
    "- Map acceptance criteria to completed tasks and validation evidence before finishing.",
    "- Review the final diff for scope drift.",
    "- Check every in-scope to-do before marking files done.",
    "- User-facing outcomes are only COMPLETE or BLOCKED (continue internally if work remains).",
    "- Only move all three canonical artifacts to the finished directory if the work is actually complete.",
    "- After moving, report the new finished paths.",
    c.complete
      ? "- All three package files are present."
      : `- Warning: package is incomplete (missing: ${c.missing.join(", ")}). Stop if you cannot resolve them safely.`,
    readiness.ready
      ? "- Readiness gate: READY."
      : `- Readiness gate: NOT READY (${readiness.level}). Stop unless the user explicitly overrides after seeing the issues.`,
  ].join("\n");
}

export function buildPlanUserArgs(args?: string): string {
  const topic = args?.trim();
  return [
    "Create a work-item package using the task-and-plan-routing skill.",
    "",
    topic ? `Topic / request:\n${topic}` : "Use the recent conversation context as the request.",
    "",
    "Instructions:",
    "- Run the clarification gate before writing files.",
    "- Place all open packages under the same open work directory (default `docs/work/work/`).",
    "- Type is metadata only — do not create type-based subfolders.",
    "- Instantiate the bundled work-item, to-do-list, and test-plan templates; do not invent alternate headings.",
    "- Read the bundled testing policy before proposing automated coverage.",
    "- Create primary + `-to-do-list.md` + `-test.md` for implementation-bound work.",
    "- For pure intake (`idea` / early `triage`), you may create a lighter capture; do not claim implementation-ready.",
    "- Implementation-ready packages must have no unresolved blocking Open Questions.",
    "- Return absolute paths, type rationale, readiness (ready|intake|not_ready), and placement rationale.",
  ].join("\n");
}

export function buildPlanAndImplementUserArgs(args?: string): string {
  const topic = args?.trim();
  return [
    "Create an implementation-ready work item and then implement it to completion.",
    "",
    topic ? `Topic / request:\n${topic}` : "Use the recent conversation context as the request.",
    "",
    "Instructions:",
    "- Phase A: follow task-and-plan-routing via the relative sibling skill path; stop if clarification is required.",
    "- Do not start Phase B until the three-file package is implementation-ready.",
    "- Docs-only commit when planning succeeds and Git allows a narrow commit; otherwise report commit skipped with reason.",
    "- Phase B: follow implement-tdd-review-runner via the relative sibling skill path.",
    "- Stay responsible until user-facing COMPLETE or BLOCKED (not merely launched).",
    "- Report validations run and final artifact paths (including finished paths if moved).",
  ].join("\n");
}

export function buildInjectPathsPrompt(pkg: WorkPackage): string {
  return [
    "Selected work package for context:",
    "",
    formatPackageDetail(pkg),
    "",
    pathsBlock(pkg),
    "",
    readinessBlock(pkg),
    "",
    "I may refer to this work package next. Keep these paths as the active work context unless I select another.",
  ].join("\n");
}

/**
 * Full handoff message: Pi-compatible skill block + user args.
 * Extension-injected messages skip /skill: expansion, so we embed the body.
 */
export function buildSkillHandoffMessage(
  skillName: PackageSkillName,
  userArgs: string,
  packageRoot = packageRootFromModuleUrl()
): string {
  const skill = loadPackageSkill(skillName, packageRoot);
  return formatSkillBlock(skill, userArgs);
}

export function buildImplementPrompt(
  pkg: WorkPackage,
  packageRoot = packageRootFromModuleUrl()
): string {
  return buildSkillHandoffMessage(
    "implement-tdd-review-runner",
    buildImplementUserArgs(pkg),
    packageRoot
  );
}

export function buildPlanPrompt(
  args?: string,
  packageRoot = packageRootFromModuleUrl()
): string {
  return buildSkillHandoffMessage(
    "task-and-plan-routing",
    buildPlanUserArgs(args),
    packageRoot
  );
}

export function buildPlanAndImplementPrompt(
  args?: string,
  packageRoot = packageRootFromModuleUrl()
): string {
  return buildSkillHandoffMessage(
    "plan-and-implement-runner",
    buildPlanAndImplementUserArgs(args),
    packageRoot
  );
}

// Re-export user-arg builders for tests that want body without skill file IO
export {
  pathsBlock,
  readinessBlock,
};
