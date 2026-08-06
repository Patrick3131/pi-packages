import * as fs from "node:fs";

import type { WorkPackage, WorkType } from "./types.js";
import { packageCompleteness } from "./discover.js";
import { parseMarkdown } from "./parse.js";

export type ReadinessLevel = "ready" | "not_ready" | "intake";

export interface ReadinessAssessment {
  level: ReadinessLevel;
  ready: boolean;
  reasons: string[];
  /** Soft notes that do not alone block readiness. */
  notes: string[];
}

const NON_READY_TYPES = new Set<string>(["idea"]);
/** Types that start as intake unless later promoted. */
const INTAKE_TYPES = new Set<string>(["idea", "triage"]);

function readPrimaryBody(pkg: WorkPackage): string | undefined {
  if (!pkg.primary?.path) return undefined;
  try {
    return fs.readFileSync(pkg.primary.path, "utf8");
  } catch {
    return undefined;
  }
}

/**
 * Detect unresolved blocking content under ## Open Questions.
 * Empty / "None" / "N/A" / "—" count as resolved.
 */
export function hasBlockingOpenQuestions(body: string): boolean {
  const lines = body.split(/\r?\n/);
  let inSection = false;
  const content: string[] = [];

  for (const line of lines) {
    if (/^##\s+Open Questions\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (inSection) content.push(line);
  }

  if (!inSection) return false;

  const text = content
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!text) return false;

  const normalized = text
    .replace(/^[-*]\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .trim()
    .toLowerCase();

  if (
    /^(none|n\/a|na|nil|—|-|no open questions|no blockers|resolved\.?)(\s*)$/i.test(
      normalized
    )
  ) {
    return false;
  }

  // Bullet list of only empty placeholders
  const bullets = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (
    bullets.length > 0 &&
    bullets.every((b) => /^[-*]\s*(\[[ x]\]\s*)?$/i.test(b) || b === "-")
  ) {
    return false;
  }

  return true;
}

/**
 * Assess whether a work package is implementation-ready.
 *
 * Rules (flat folders; type is metadata only):
 * - All packages live in the same open/finished dirs regardless of type.
 * - `idea` is never implementation-ready (intake).
 * - `triage` is intake unless package is complete, status is backlog|in_progress,
 *   and there are no blocking open questions (classified enough to execute).
 * - Other types need complete three-file package and no blocking open questions.
 * - `obsolete` / finished lifecycle are not ready for new implementation.
 */
export function assessReadiness(pkg: WorkPackage): ReadinessAssessment {
  const reasons: string[] = [];
  const notes: string[] = [];
  const completeness = packageCompleteness(pkg);
  const type = (pkg.type ?? "unknown").toLowerCase();
  const status = String(pkg.status ?? "").toLowerCase();

  if (pkg.lifecycle === "finished") {
    return {
      level: "not_ready",
      ready: false,
      reasons: ["Package is already in the finished directory."],
      notes,
    };
  }

  if (status === "obsolete") {
    return {
      level: "not_ready",
      ready: false,
      reasons: ["Status is obsolete."],
      notes,
    };
  }

  if (status === "done") {
    notes.push("Status is done but package is still in the open directory.");
  }

  if (!completeness.hasPrimary) reasons.push("Missing primary work-item doc.");
  if (!completeness.hasTodo) reasons.push("Missing companion to-do list.");
  if (!completeness.hasTest) reasons.push("Missing companion test plan.");

  let blockingQuestions = false;
  const raw = readPrimaryBody(pkg);
  if (raw) {
    const parsed = parseMarkdown(raw);
    blockingQuestions = hasBlockingOpenQuestions(parsed.body);
    if (blockingQuestions) {
      reasons.push("Primary doc has unresolved Open Questions (blocking).");
    }
    // Prefer body type if present
    if (parsed.type) {
      // already on pkg usually
    }
  } else if (pkg.primary) {
    notes.push("Could not read primary doc to inspect Open Questions.");
  }

  if (type === "idea" || NON_READY_TYPES.has(type)) {
    return {
      level: "intake",
      ready: false,
      reasons: [
        ...reasons,
        "Type `idea` is intake only — promote to an executable type before implementation.",
      ],
      notes,
    };
  }

  if (type === "triage") {
    const classified =
      completeness.complete &&
      !blockingQuestions &&
      (status === "backlog" || status === "in_progress");
    if (!classified) {
      return {
        level: "intake",
        ready: false,
        reasons: [
          ...reasons,
          "Type `triage` is not implementation-ready until classified (complete package, no blocking questions, status backlog|in_progress).",
        ],
        notes,
      };
    }
    // Classified triage can proceed
  }

  if (reasons.length > 0) {
    const level: ReadinessLevel =
      INTAKE_TYPES.has(type) && !completeness.complete ? "intake" : "not_ready";
    return { level, ready: false, reasons, notes };
  }

  return {
    level: "ready",
    ready: true,
    reasons: [],
    notes,
  };
}

export function readinessMarker(pkg: WorkPackage): string {
  const a = assessReadiness(pkg);
  if (a.ready) return "ready";
  if (a.level === "intake") return "intake";
  return "blocked";
}

export function isExecutableType(type: WorkType | undefined): boolean {
  const t = (type ?? "").toLowerCase();
  return t !== "" && t !== "idea";
}
