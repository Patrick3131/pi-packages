/**
 * Git-dependency `prepare` hook for the published root package.
 *
 * `prepare` runs on every install, and Pi installs Git packages with
 * `npm install --omit=dev --legacy-peer-deps`. `build:research` needs the `tsup`
 * devDependency, so on a production install the bundle cannot be built at all;
 * failing here aborts the whole install and leaves the consumer without the
 * package. Skip with a note instead.
 *
 * The bundle is still built by an explicit `npm run build:research` with dev
 * dependencies present, which is what a pinned research consumer does.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const tsupBins = ["node_modules/.bin/tsup", "node_modules/.bin/tsup.cmd"];
const hasTsup = tsupBins.some((candidate) => existsSync(candidate));

if (!hasTsup) {
	console.log("[pi-packages] skipping build:research - tsup is not installed (dev dependencies omitted)");
	process.exit(0);
}

// A real build failure must still fail the install.
execFileSync("npm", ["run", "build:research"], { stdio: "inherit", shell: process.platform === "win32" });
