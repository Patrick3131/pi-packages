import { spawn } from "node:child_process";

const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const KILL_GRACE_MS = 250;

// Trafilatura 2.x native extraction only: HTML comes from our remote crawler, never a URL fetch.
const PYTHON_SCRIPT = `import sys
try:
    import trafilatura
except ImportError:
    sys.stderr.write("Trafilatura is missing: install trafilatura>=2,<3 in the configured Python environment.\\n")
    sys.exit(1)
html = sys.stdin.buffer.read().decode("utf-8")
result = trafilatura.extract(
    html,
    output_format="markdown" if sys.argv[1] == "markdown" else "txt",
    include_tables=True,
    include_formatting=True,
    include_links=sys.argv[2] == 'true',
)
if result is None:
    sys.stderr.write("Trafilatura found no extractable content; read the preserved original source.\\n")
    sys.exit(1)
sys.stdout.buffer.write(result.encode("utf-8"))
`;

export interface TrafilaturaOptions {
  /** Explicit local executable; never installed, located via a shell or used for network fetching. */
  pythonPath: string;
  html: string;
  format: "markdown" | "text";
  includeLinks?: boolean;
  signal?: AbortSignal;
  /** Absolute epoch milliseconds: pass the crawl's existing deadline, not a fresh timeout. */
  deadline: number;
}

function abortError(message: string): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/** Caller persists HTML before calling and adds those exact original references to any error. */
export async function extractWithTrafilatura(options: TrafilaturaOptions): Promise<string> {
  const { pythonPath, html, format, signal, deadline, includeLinks = false } = options;
  if (signal?.aborted) throw abortError("Trafilatura extraction aborted");
  if (!Number.isFinite(deadline)) throw new Error("Trafilatura requires a finite crawl deadline");
  if (deadline <= Date.now()) throw abortError("Trafilatura crawl deadline exceeded");
  if (!pythonPath.trim()) throw new Error("Configure trafilatura.pythonPath / CRAWL4AI_TRAFILATURA_PYTHON with a Python executable containing trafilatura>=2,<3");
  if (format !== "markdown" && format !== "text") throw new Error("Trafilatura supports only Markdown or text");
  if (Buffer.byteLength(html, "utf8") > MAX_INPUT_BYTES) throw new Error("Trafilatura HTML input exceeds the 20 MiB safety limit");

  return new Promise<string>((resolve, reject) => {
    const child = spawn(pythonPath, ["-c", PYTHON_SCRIPT, format, String(includeLinks)], { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let failure: Error | undefined;
    let settled = false;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const stop = (error: Error) => {
      if (settled || failure) return;
      failure = error;
      child.stdin.destroy();
      child.kill("SIGTERM");
      killTimer = setTimeout(() => { if (!settled) child.kill("SIGKILL"); }, KILL_GRACE_MS);
    };
    const onAbort = () => stop(abortError("Trafilatura extraction aborted"));
    const onInputError = (error: Error) => {
      // A Python import failure can close stdin early; use its stderr/exit status instead of EPIPE.
      if ((error as NodeJS.ErrnoException).code !== "EPIPE") stop(new Error(`Trafilatura input failed: ${error.message}`));
    };
    const onOutput = (chunk: Buffer) => {
      if (failure) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) stop(new Error("Trafilatura output exceeds the 20 MiB safety limit"));
      else stdout.push(chunk);
    };
    const onStderr = (chunk: Buffer) => {
      if (failure) return;
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_STDERR_BYTES) stop(new Error("Trafilatura error output exceeds the 64 KiB safety limit"));
      else stderr.push(chunk);
    };
    const onProcessError = (error: Error) => {
      failure ??= new Error(`Could not run configured Python for Trafilatura: ${error.message}. Set trafilatura.pythonPath / CRAWL4AI_TRAFILATURA_PYTHON to an executable with trafilatura>=2,<3 installed.`);
    };
    const onClose = (code: number | null, exitSignal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      child.stdin.removeListener("error", onInputError);
      child.stdout.removeListener("data", onOutput);
      child.stderr.removeListener("data", onStderr);
      child.removeListener("error", onProcessError);
      child.removeListener("close", onClose);
      if (failure) { reject(failure); return; }
      if (code !== 0) {
        const preview = Buffer.concat(stderr).toString("utf8").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").trim().slice(0, 2000);
        reject(new Error(`Trafilatura extraction failed (${exitSignal ?? code}): ${preview || "no diagnostics"}. Verify trafilatura>=2,<3 in the configured Python environment; read preserved originals.`));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    };

    child.stdin.on("error", onInputError);
    child.stdout.on("data", onOutput);
    child.stderr.on("data", onStderr);
    child.on("error", onProcessError);
    child.on("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    // Recheck after spawn/listener setup so cancellation in that interval cannot be missed.
    if (signal?.aborted) onAbort();
    const remaining = deadline - Date.now();
    if (remaining <= 0) stop(abortError("Trafilatura crawl deadline exceeded"));
    else deadlineTimer = setTimeout(() => stop(abortError("Trafilatura crawl deadline exceeded")), Math.min(remaining, 2_147_483_647));
    if (!failure) child.stdin.end(html, "utf8");
  });
}
