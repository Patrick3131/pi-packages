import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MelonPanel } from "./client/panel";

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({
    id: "melon-workspaces",
    title: "Melon Workspaces",
    icon: "GitBranch",
    context: "workspace",
    Component: MelonPanel,
  });
  return () => {};
}
