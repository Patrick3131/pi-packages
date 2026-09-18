import { execFile } from "node:child_process";

export interface CommandResult {
  readonly code: number;
  readonly output: string;
}

const MAX_OUTPUT_CHARACTERS = 20_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** `melon-worktree` and `melon-preview` are interactive shells that never prompt. */
export const READ_TIMEOUT_MS = 60_000;
export const MUTATING_TIMEOUT_MS = 15 * 60 * 1000;

function truncate(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARACTERS) {
    return text;
  }
  return `…[truncated]\n${text.slice(text.length - MAX_OUTPUT_CHARACTERS)}`;
}

/** `ExecFileException` reports a numeric exit code, a string spawn code, or neither. */
function exitCodeOf(error: {
  readonly code?: string | number | null;
  readonly killed?: boolean;
}): number {
  if (typeof error.code === "number") {
    return error.code;
  }
  // A killed child is a timeout; a missing binary or a failed spawn is a plain failure.
  return error.killed === true ? 124 : 1;
}

/**
 * Runs one Melon CLI command. Failures resolve with the exit code and the
 * combined output instead of rejecting, so the panel can always show the text.
 */
export function runCommand(
  file: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs: number },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      [...args],
      {
        cwd: options.cwd,
        env: process.env,
        timeout: options.timeoutMs,
        maxBuffer: MAX_BUFFER_BYTES,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        const out = (stdout ?? "").trim();
        const err = (stderr ?? "").trim();
        if (error === null) {
          resolve({ code: 0, output: truncate(out) });
          return;
        }
        const code = exitCodeOf(error);
        const detail = code === 124 ? "Command timed out." : error.message;
        const combined = [out, err].filter((part) => part.length > 0).join("\n");
        resolve({
          code,
          output: truncate(combined.length > 0 ? combined : detail),
        });
      },
    );
  });
}
