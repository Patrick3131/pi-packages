import { test } from "node:test";
import { execFileSync } from "node:child_process";

test("Pi sync preserves target preferences, gates writes and backs up config", () => {
  execFileSync("python3", ["scripts/pi-sync-test.py"], { stdio: "pipe" });
});
