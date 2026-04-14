import { spawn } from "node:child_process";

export function resolveBrowserOpenCommand(
  targetPath: string,
  platform: NodeJS.Platform = process.platform
): {
  command: string;
  args: string[];
  label: string;
  windowsHide?: boolean;
} {
  if (platform === "darwin") {
    return { command: "open", args: [targetPath], label: "open" };
  }

  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", targetPath],
      label: "cmd /c start",
      windowsHide: true,
    };
  }

  return { command: "xdg-open", args: [targetPath], label: "xdg-open" };
}

export function openInBrowser(targetPath: string): { ok: boolean; command?: string; error?: string } {
  try {
    const resolved = resolveBrowserOpenCommand(targetPath);
    const child = spawn(resolved.command, resolved.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: resolved.windowsHide,
    });
    child.unref();
    return { ok: true, command: resolved.label };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
