// Grava a identificação do build em dist/version.js e renova o sufixo de cache dos scripts.
// Roda no `npm run build`, tanto localmente quanto no CI e no deploy, para que a versão exibida
// no rodapé corresponda exatamente ao que foi publicado.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argIndex = process.argv.indexOf("--dist");
const distDir = resolve(argIndex > -1 ? process.argv[argIndex + 1] : "dist");

function git(command) {
  try { return execSync(`git ${command}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return ""; }
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const sha = (process.env.GITHUB_SHA || git("rev-parse HEAD") || "").slice(0, 7) || "local";
const branch = process.env.GITHUB_REF_NAME || git("rev-parse --abbrev-ref HEAD") || "local";
const builtAt = new Date().toISOString();
const info = { version: pkg.version, build: sha, branch, builtAt };

writeFileSync(join(distDir, "version.js"), `window.FLUXO_BUILD = Object.freeze(${JSON.stringify(info)});\n`);

// O sufixo ?v= muda a cada build; sem isso o navegador pode reutilizar scripts antigos do cache.
const indexPath = join(distDir, "index.html");
let html = readFileSync(indexPath, "utf8");
const cacheKey = `${sha}-${builtAt.slice(0, 16).replace(/[-:T]/g, "")}`;
html = html.replace(/\?v=[A-Za-z0-9._-]+/g, `?v=${cacheKey}`);
if (!html.includes("./version.js")) html = html.replace(/(\s*)<script src="\.\/vendor\.js/, `$1<script src="./version.js?v=${cacheKey}"></script>$1<script src="./vendor.js`);
writeFileSync(indexPath, html);
console.log(`Build ${info.version} (${info.build}, ${info.branch}) · cache ${cacheKey}`);
