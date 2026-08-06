import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { assessReadiness, hasBlockingOpenQuestions } from "../src/readiness.js";
import type { WorkPackage, WorkFile } from "../src/types.js";

function file(partial: Partial<WorkFile> & Pick<WorkFile, "path" | "kind">): WorkFile {
  return {
    relativePath: partial.relativePath ?? path.basename(partial.path),
    title: partial.title,
    frontmatter: partial.frontmatter ?? {},
    preview: partial.preview ?? "",
    mtimeMs: partial.mtimeMs ?? 1,
    ...partial,
  };
}

function basePkg(overrides: Partial<WorkPackage> = {}): WorkPackage {
  return {
    baseName: "2026-04-15-feature-foo",
    title: "Foo",
    status: "backlog",
    type: "feature",
    date: "2026-04-15",
    lifecycle: "open",
    dir: "/tmp",
    others: [],
    files: [],
    mtimeMs: 1,
    ...overrides,
  };
}

test("hasBlockingOpenQuestions detects real questions", () => {
  assert.equal(hasBlockingOpenQuestions("# T\n\n## Open Questions\n\n- Which API?\n"), true);
  assert.equal(hasBlockingOpenQuestions("# T\n\n## Open Questions\n\nNone\n"), false);
  assert.equal(hasBlockingOpenQuestions("# T\n\n## Open Questions\n\n"), false);
  assert.equal(hasBlockingOpenQuestions("# T\n\n## Scope\n\nx\n"), false);
});

test("ready complete feature package", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-work-ready-"));
  try {
    const primary = path.join(dir, "p.md");
    fs.writeFileSync(
      primary,
      `---\nstatus: backlog\n---\n\n# Foo\n\n## Type\n\nfeature\n\n## Open Questions\n\nNone\n`,
      "utf8"
    );
    const pkg = basePkg({
      primary: file({ path: primary, kind: "primary", frontmatter: { status: "backlog" } }),
      todo: file({ path: path.join(dir, "t.md"), kind: "todo" }),
      test: file({ path: path.join(dir, "x.md"), kind: "test" }),
    });
    // create dummy companions so completeness is about presence on pkg, not disk
    const a = assessReadiness(pkg);
    assert.equal(a.ready, true);
    assert.equal(a.level, "ready");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("idea is intake never ready", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-work-idea-"));
  try {
    const primary = path.join(dir, "p.md");
    fs.writeFileSync(primary, `---\nstatus: idea\n---\n\n# Idea\n\n## Type\n\nidea\n\n## Open Questions\n\nNone\n`, "utf8");
    const pkg = basePkg({
      type: "idea",
      status: "idea",
      primary: file({ path: primary, kind: "primary" }),
      todo: file({ path: path.join(dir, "t.md"), kind: "todo" }),
      test: file({ path: path.join(dir, "x.md"), kind: "test" }),
    });
    const a = assessReadiness(pkg);
    assert.equal(a.ready, false);
    assert.equal(a.level, "intake");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("incomplete package not ready", () => {
  const a = assessReadiness(
    basePkg({
      primary: file({ path: "/nope.md", kind: "primary" }),
    })
  );
  assert.equal(a.ready, false);
  assert.ok(a.reasons.some((r) => /to-do/i.test(r)));
});

test("blocking open questions prevent readiness", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-work-q-"));
  try {
    const primary = path.join(dir, "p.md");
    fs.writeFileSync(
      primary,
      `---\nstatus: backlog\n---\n\n# Foo\n\n## Type\n\nfeature\n\n## Open Questions\n\n- Need product decision on API shape\n`,
      "utf8"
    );
    const pkg = basePkg({
      primary: file({ path: primary, kind: "primary" }),
      todo: file({ path: path.join(dir, "t.md"), kind: "todo" }),
      test: file({ path: path.join(dir, "x.md"), kind: "test" }),
    });
    const a = assessReadiness(pkg);
    assert.equal(a.ready, false);
    assert.ok(a.reasons.some((r) => /Open Questions/i.test(r)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("finished lifecycle not ready", () => {
  const a = assessReadiness(basePkg({ lifecycle: "finished", status: "done" }));
  assert.equal(a.ready, false);
});

test("classified triage can be ready", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-work-triage-"));
  try {
    const primary = path.join(dir, "p.md");
    fs.writeFileSync(
      primary,
      `---\nstatus: backlog\n---\n\n# Triage done\n\n## Type\n\ntriage\n\n## Open Questions\n\nNone\n`,
      "utf8"
    );
    const pkg = basePkg({
      type: "triage",
      status: "backlog",
      primary: file({ path: primary, kind: "primary" }),
      todo: file({ path: path.join(dir, "t.md"), kind: "todo" }),
      test: file({ path: path.join(dir, "x.md"), kind: "test" }),
    });
    assert.equal(assessReadiness(pkg).ready, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
