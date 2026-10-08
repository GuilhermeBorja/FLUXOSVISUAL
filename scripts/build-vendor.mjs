import { build } from "esbuild";

await build({
  entryPoints: ["src/vendor.js"],
  outfile: "dist/vendor.js",
  bundle: true,
  minify: true,
  format: "iife",
  globalName: "FluxosVendor",
  legalComments: "eof",
  target: ["es2020"],
});
