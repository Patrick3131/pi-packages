import type { PluginServerContext } from "@getpaseo/plugin/server";
import { previewRunRpc, workspaceStatusRpc, worktreeRunRpc } from "./shared/contracts";
import { runPreview, runWorktree, workspaceStatus } from "./server/handlers";

export default function contribute(server: PluginServerContext) {
  server.handle(workspaceStatusRpc, workspaceStatus);
  server.handle(worktreeRunRpc, runWorktree);
  server.handle(previewRunRpc, runPreview);
  return () => {};
}
