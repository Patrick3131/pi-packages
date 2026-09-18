import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Contracts shared by the daemon handlers and the workspace panel. Every field a
 * handler needs is validated here, so the panel can stay a thin form.
 */

export const worktreeActions = [
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
  "list",
] as const;

export const previewActions = ["start", "start-all", "status", "logs", "stop"] as const;

export const workspaceStatusRpc = defineRpc({
  name: "melon.workspace.status",
  input: z.object({ directory: z.string() }),
  output: z.object({
    branch: z.string().nullable(),
    owner: z.enum(["pi", "codex"]).nullable(),
    task: z.string().nullable(),
    preview: z.string().nullable(),
    previewError: z.string().nullable(),
  }),
});

export const worktreeRunRpc = defineRpc({
  name: "melon.worktree.run",
  input: z.object({
    directory: z.string(),
    action: z.enum(worktreeActions),
    owner: z.enum(["pi", "codex"]).optional(),
    task: z.string().optional(),
    branch: z.string().optional(),
    target: z.string().optional(),
    base: z.string().optional(),
    message: z.string().optional(),
  }),
  output: z.object({
    code: z.number(),
    output: z.string(),
  }),
});

export const previewRunRpc = defineRpc({
  name: "melon.preview.run",
  input: z.object({
    directory: z.string(),
    action: z.enum(previewActions),
  }),
  output: z.object({
    code: z.number(),
    output: z.string(),
  }),
});

export type WorktreeAction = (typeof worktreeActions)[number];
export type PreviewAction = (typeof previewActions)[number];
