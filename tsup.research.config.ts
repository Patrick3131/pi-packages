import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/research.ts"],
  format: ["esm"],
  target: "node22",
  tsconfig: "tsconfig.research.json",
  outDir: "dist",
  clean: true,
  dts: true,
  // Pi supplies host peers to extensions; research-only consumers need no host.
  noExternal: ["typebox"],
});
