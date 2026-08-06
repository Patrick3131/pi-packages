import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Known operator skills shipped with this package. */
export const PACKAGE_SKILL_NAMES = [
  "task-and-plan-routing",
  "implement-tdd-review-runner",
  "plan-and-implement-runner",
] as const;

export type PackageSkillName = (typeof PACKAGE_SKILL_NAMES)[number];

export interface LoadedSkill {
  name: string;
  filePath: string;
  baseDir: string;
  /** Full file contents including frontmatter. */
  raw: string;
  /** Body with YAML frontmatter stripped (Pi expansion style). */
  body: string;
  /** Parsed disable-model-invocation flag. */
  disableModelInvocation: boolean;
  description?: string;
}

export function packageRootFromModuleUrl(moduleUrl = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}

export function skillsDir(packageRoot = packageRootFromModuleUrl()): string {
  return path.join(packageRoot, "skills");
}

export function skillFilePath(
  name: string,
  packageRoot = packageRootFromModuleUrl()
): string {
  return path.join(skillsDir(packageRoot), name, "SKILL.md");
}

/**
 * Strip YAML frontmatter the same way Pi does for skill expansion.
 * Leading `---` … `---` block is removed; body is trimmed by callers when needed.
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  // skip past closing --- and optional newline
  let rest = content.slice(end + 4);
  if (rest.startsWith("\r\n")) rest = rest.slice(2);
  else if (rest.startsWith("\n")) rest = rest.slice(1);
  return rest;
}

function parseSkillMeta(raw: string): {
  disableModelInvocation: boolean;
  description?: string;
  name?: string;
} {
  if (!raw.startsWith("---")) {
    return { disableModelInvocation: false };
  }
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { disableModelInvocation: false };
  const fm = raw.slice(4, end);
  let disableModelInvocation = false;
  let description: string | undefined;
  let name: string | undefined;
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].trim();
    if (key === "disable-model-invocation") {
      disableModelInvocation = value === "true";
    } else if (key === "description") {
      description = value;
    } else if (key === "name") {
      name = value;
    }
  }
  return { disableModelInvocation, description, name };
}

export function loadSkillFromFile(filePath: string): LoadedSkill {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Skill file not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  const meta = parseSkillMeta(raw);
  const body = stripFrontmatter(raw).trim();
  const baseDir = path.dirname(abs);
  const name = meta.name ?? path.basename(baseDir);
  return {
    name,
    filePath: abs,
    baseDir,
    raw,
    body,
    disableModelInvocation: meta.disableModelInvocation,
    description: meta.description,
  };
}

export function loadPackageSkill(
  name: PackageSkillName | string,
  packageRoot = packageRootFromModuleUrl()
): LoadedSkill {
  return loadSkillFromFile(skillFilePath(name, packageRoot));
}

export function loadAllPackageSkills(
  packageRoot = packageRootFromModuleUrl()
): LoadedSkill[] {
  return PACKAGE_SKILL_NAMES.map((name) => loadPackageSkill(name, packageRoot));
}

/**
 * Format a skill the same way Pi's `_expandSkillCommand` does so the agent
 * receives the full SKILL.md body even when `sendUserMessage` skips expansion.
 */
export function formatSkillBlock(skill: LoadedSkill, userArgs?: string): string {
  const block = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.body}\n</skill>`;
  const args = userArgs?.trim();
  return args ? `${block}\n\n${args}` : block;
}

/**
 * Resolve a relative skill reference from one skill directory to another.
 * e.g. from plan-and-implement-runner baseDir + "../task-and-plan-routing/SKILL.md"
 */
export function resolveSiblingSkillPath(
  fromSkillBaseDir: string,
  relativeRef: string
): string {
  return path.resolve(fromSkillBaseDir, relativeRef);
}

export function siblingSkillExists(
  fromSkillBaseDir: string,
  relativeRef: string
): boolean {
  return fs.existsSync(resolveSiblingSkillPath(fromSkillBaseDir, relativeRef));
}
