import { build } from "esbuild";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: [join(root, "src/domain.mjs")],
  outfile: join(root, "dist/domain.js"),
  bundle: true,
  format: "iife",
  globalName: "FluxosDomain",
  target: ["es2020"],
});
