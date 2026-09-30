import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractWithTrafilatura } from "./trafilatura";

const HTML = "<main><h1>Guide</h1><table><tr><td>Value</td></tr></table><a href='https://example.com'>Link</a></main>";
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "trafilatura-test-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function executable(body: string): string {
  const path = join(root, "controlled python with spaces");
  writeFileSync(path, `#!${process.execPath}\n${body}\n`, { mode: 0o700 });
  return path;
}

async function waitForPid(path: string): Promise<number> {
  const end = Date.now() + 2000;
  while (Date.now() < end) {
    try { return Number(readFileSync(path, "utf8")); } catch { /* Child is starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Controlled child did not start");
}

function expectExited(pid: number): void {
  expect(() => process.kill(pid, 0)).toThrow();
}

describe("extractWithTrafilatura", () => {
  it.each(["markdown", "text"] as const)("uses configured executable, HTML stdin and native %s options", async (format) => {
    const record = join(root, "input.json");
    const pythonPath = executable(`
      let html = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => html += chunk);
      process.stdin.on('end', () => {
        require('node:fs').writeFileSync(${JSON.stringify(record)}, JSON.stringify({ html, args: process.argv.slice(2) }));
        process.stdout.write(process.argv[4] === 'markdown' ? '# Guide\\n\\n| Value |\\n| --- |\\n[Link](https://example.com)' : 'Guide\\nValue\\nLink');
      });
    `);
    const content = await extractWithTrafilatura({ pythonPath, html: HTML, format, includeLinks: true, deadline: Date.now() + 3000 });
    const input = JSON.parse(readFileSync(record, "utf8"));
    expect(input.html).toBe(HTML);
    expect(input.args[0]).toBe("-c");
    expect(input.args.slice(2)).toEqual([format, "true"]);
    expect(input.args[1]).toContain("include_tables=True");
    expect(input.args[1]).toContain("include_formatting=True");
    expect(input.args[1]).toContain("include_links=sys.argv[2] == 'true'");
    expect(input.args[1]).not.toMatch(/fetch_url|requests|urllib/);
    expect(content).toBe(format === "markdown" ? "# Guide\n\n| Value |\n| --- |\n[Link](https://example.com)" : "Guide\nValue\nLink");
  });

  it("defaults links off and gives actionable missing executable/dependency errors without fallback", async () => {
    await expect(extractWithTrafilatura({ pythonPath: join(root, "missing"), html: HTML, format: "markdown", deadline: Date.now() + 3000 }))
      .rejects.toThrow(/configured Python.*trafilatura/i);
    const pythonPath = executable("process.stderr.write('ModuleNotFoundError: trafilatura'); process.exit(1);");
    await expect(extractWithTrafilatura({ pythonPath, html: HTML, format: "markdown", deadline: Date.now() + 3000 }))
      .rejects.toThrow(/ModuleNotFoundError: trafilatura/);
    const links = executable("process.stdout.write(process.argv[5]);");
    await expect(extractWithTrafilatura({ pythonPath: links, html: HTML, format: "text", deadline: Date.now() + 3000 })).resolves.toBe("false");
  });

  it.each([0, 1])("removes cancellation listeners after child exit %s", async (exitCode) => {
    const controller = new AbortController();
    const add = jest.spyOn(controller.signal, "addEventListener");
    const remove = jest.spyOn(controller.signal, "removeEventListener");
    const pythonPath = executable(`process.exit(${exitCode});`);
    const running = extractWithTrafilatura({ pythonPath, html: HTML, format: "text", signal: controller.signal, deadline: Date.now() + 3000 });
    if (exitCode) await expect(running).rejects.toThrow(/failed/i);
    else await expect(running).resolves.toBe("");
    expect(add).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    controller.abort(); // Completed processes have no remaining cancellation work.
  });

  it("pre-abort, expired deadline and oversized input do not spawn", async () => {
    const marker = join(root, "spawned");
    const pythonPath = executable(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'spawned');`);
    const controller = new AbortController();
    controller.abort();
    await expect(extractWithTrafilatura({ pythonPath, html: HTML, format: "markdown", deadline: Date.now() + 3000, signal: controller.signal })).rejects.toThrow(/abort/i);
    await expect(extractWithTrafilatura({ pythonPath, html: HTML, format: "markdown", deadline: Date.now() - 1 })).rejects.toThrow(/deadline/i);
    await expect(extractWithTrafilatura({ pythonPath, html: "x".repeat(20 * 1024 * 1024 + 1), format: "markdown", deadline: Date.now() + 3000 })).rejects.toThrow(/input.*limit/i);
    expect(() => readFileSync(marker)).toThrow();
  });

  it.each(["abort", "deadline"])("terminates a TERM-resistant child on %s and waits for actual exit", async (cause) => {
    const pidFile = join(root, "pid");
    const pythonPath = executable(`
      process.on('SIGTERM', () => {});
      require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      setInterval(() => {}, 1000);
    `);
    const controller = new AbortController();
    const running = extractWithTrafilatura({ pythonPath, html: HTML, format: "markdown", signal: controller.signal, deadline: Date.now() + (cause === "deadline" ? 800 : 3000) });
    const rejection = expect(running).rejects.toThrow(cause === "deadline" ? /deadline/i : /abort/i);
    const pid = await waitForPid(pidFile);
    if (cause === "abort") controller.abort();
    await rejection;
    expectExited(pid);
  });

  it.each(["stdout", "stderr"])("bounds %s and cleans up the IO-heavy process", async (stream) => {
    const pidFile = join(root, "pid");
    const pythonPath = executable(`
      require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      process.${stream}.write('x'.repeat(${stream === "stdout" ? 21 * 1024 * 1024 : 70 * 1024}));
      setInterval(() => {}, 1000);
    `);
    const running = extractWithTrafilatura({ pythonPath, html: HTML, format: "markdown", deadline: Date.now() + 3000 });
    const rejection = expect(running).rejects.toThrow(/output.*limit/i);
    const pid = await waitForPid(pidFile);
    await rejection;
    expectExited(pid);
  });
});
