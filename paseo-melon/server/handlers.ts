import type { RpcInput } from "@getpaseo/plugin";
import type { PluginHandlerContext } from "@getpaseo/plugin/server";
import {
  previewRunRpc,
  workspaceStatusRpc,
  worktreeRunRpc,
  type WorktreeAction,
} from "../shared/contracts";
import { MUTATING_TIMEOUT_MS, READ_TIMEOUT_MS, runCommand, type CommandResult } from "./exec";

const MELON_WORKTREE = "melon-worktree";
const MELON_PREVIEW = "melon-preview";

const BRANCH_PATTERN = /^(pi|codex)\/(.+)$/;

function invalid(message: string): CommandResult {
  return { code: 2, output: message };
}

function required(value: string | undefined, label: string): string {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} is required for this action.`);
  }
  return trimmed;
}

/**
 * Translates one panel action into the exact `melon-worktree` argument list.
 * Argument order mirrors the script's usage text.
 */
function worktreeArguments(input: RpcInput<typeof worktreeRunRpc>): string[] {
  const base = (input.base ?? "").trim();
  const branch = (input.branch ?? "").trim();
  const target = (input.target ?? "").trim();

  switch (input.action) {
    case "create": {
      const args = ["create", required(input.owner, "Owner"), required(input.task, "Task name")];
      return base.length > 0 ? [...args, base] : args;
    }
    case "commit":
      return ["commit", required(input.message, "Commit message")];
    case "discard":
      return ["discard"];
    case "push":
      return ["push"];
    case "list":
      return ["list"];
    case "sync":
      return base.length > 0 ? ["sync", base] : ["sync"];
    case "push-current":
      return ["push-current", required(branch, "Branch")];
    case "sync-branch":
      return ["sync-branch", required(branch, "Source branch"), required(target, "Target branch")];
    case "push-branch":
      return ["push-branch", required(branch, "Source branch"), required(target, "Target branch")];
    case "merge":
      return ["merge", required(target, "Target branch")];
    case "merge-push":
      return ["merge-push", required(target, "Target branch")];
    case "publish":
      return ["publish", required(input.owner, "Owner"), required(input.task, "Task name")];
    case "remove":
      return ["remove", required(input.owner, "Owner"), required(input.task, "Task name")];
  }
}

const alwaysMutating: readonly WorktreeAction[] = [
  "create",
  "commit",
  "discard",
  "sync",
  "push",
  "push-current",
  "sync-branch",
  "push-branch",
  "merge",
  "merge-push",
  "publish",
  "remove",
];

/** `melon-worktree create` prints the created worktree path as its last line. */
function createdWorktreePath(output: string): string | null {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("/"));
  const path = lines[lines.length - 1];
  return path === undefined ? null : path;
}

export async function runWorktree(
  input: RpcInput<typeof worktreeRunRpc>,
  { paseo }: PluginHandlerContext,
): Promise<CommandResult> {
  let args: string[];
  try {
    args = worktreeArguments(input);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : String(error));
  }

  const timeoutMs = alwaysMutating.includes(input.action) ? MUTATING_TIMEOUT_MS : READ_TIMEOUT_MS;
  const result = await runCommand(MELON_WORKTREE, args, {
    cwd: input.directory,
    timeoutMs,
  });

  if (input.action !== "create" || result.code !== 0) {
    return result;
  }

  // A worktree created outside Paseo's own root is invisible until it is
  // registered, so open it as a workspace and report a failure in the output.
  const path = createdWorktreePath(result.output);
  if (path === null) {
    return result;
  }
  try {
    await paseo.workspaces.open({ cwd: path });
    return { code: 0, output: `${result.output}\nOpened in Paseo.` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { code: 0, output: `${result.output}\nPaseo could not open ${path}: ${reason}` };
  }
}

export async function runPreview(input: RpcInput<typeof previewRunRpc>): Promise<CommandResult> {
  switch (input.action) {
    case "start":
      return runCommand(MELON_PREVIEW, ["start"], {
        cwd: input.directory,
        timeoutMs: MUTATING_TIMEOUT_MS,
      });
    case "start-all":
      return runCommand(MELON_PREVIEW, ["start", "--all-apps"], {
        cwd: input.directory,
        timeoutMs: MUTATING_TIMEOUT_MS,
      });
    case "stop":
      return runCommand(MELON_PREVIEW, ["stop"], {
        cwd: input.directory,
        timeoutMs: MUTATING_TIMEOUT_MS,
      });
    case "status":
      return runCommand(MELON_PREVIEW, ["status", "--json"], {
        cwd: input.directory,
        timeoutMs: READ_TIMEOUT_MS,
      });
    case "logs":
      return runCommand(MELON_PREVIEW, ["logs"], {
        cwd: input.directory,
        timeoutMs: READ_TIMEOUT_MS,
      });
  }
}

export async function workspaceStatus(input: RpcInput<typeof workspaceStatusRpc>) {
  const branchResult = await runCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: input.directory,
    timeoutMs: READ_TIMEOUT_MS,
  });
  const branch = branchResult.code === 0 ? branchResult.output.trim() : "";
  const match = BRANCH_PATTERN.exec(branch);

  const previewResult = await runCommand(MELON_PREVIEW, ["status", "--json"], {
    cwd: input.directory,
    timeoutMs: READ_TIMEOUT_MS,
  });

  return {
    branch: branch.length > 0 ? branch : null,
    owner: match === null ? null : (match[1] as "pi" | "codex"),
    task: match === null ? null : (match[2] ?? null),
    preview: previewResult.code === 0 ? previewResult.output : null,
    previewError:
      previewResult.code === 0
        ? null
        : previewResult.output.length > 0
          ? previewResult.output
          : `${MELON_PREVIEW} exited with code ${previewResult.code}.`,
  };
}
