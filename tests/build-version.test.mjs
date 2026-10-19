import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspace = readFileSync(join(root, "dist/workspace.js"), "utf8");

function buildInto(env = {}) {
  const dist = mkdtempSync(join(tmpdir(), "fluxo-dist-"));
  cpSync(join(root, "dist"), dist, { recursive: true });
  execFileSync("node", [join(root, "scripts/build-version.mjs"), "--dist", dist], { env: { ...process.env, ...env }, stdio: "pipe" });
  return dist;
}

test("build grava versão, commit e data em version.js e renova o sufixo de cache dos scripts", () => {
  const dist = buildInto({ GITHUB_SHA: "abcdef1234567890abcdef1234567890abcdef12", GITHUB_REF_NAME: "PRD3" });
  const sandbox = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(join(dist, "version.js"), "utf8"), sandbox);
  const info = sandbox.window.FLUXO_BUILD;
  assert.equal(info.version, pkg.version);
  assert.equal(info.build, "abcdef1");
  assert.equal(info.branch, "PRD3");
  assert.ok(Number.isFinite(new Date(info.builtAt).getTime()));
  assert.throws(() => { "use strict"; info.build = "outro"; }, TypeError, "a identificação é imutável");

  const html = readFileSync(join(dist, "index.html"), "utf8");
  const keys = [...html.matchAll(/\?v=([A-Za-z0-9._-]+)/g)].map((match) => match[1]);
  assert.ok(keys.length >= 5, "todos os arquivos referenciados recebem o sufixo");
  assert.equal(new Set(keys).size, 1, "um único sufixo por build");
  assert.match(keys[0], /^abcdef1-\d{12}$/);
  assert.doesNotMatch(html, /\?v=(dev|prd3-20261018a)/);
  // version.js carrega antes dos demais scripts, e uma segunda execução não duplica a tag.
  assert.ok(html.indexOf("./version.js") < html.indexOf("./vendor.js"));
  execFileSync("node", [join(root, "scripts/build-version.mjs"), "--dist", dist], { env: { ...process.env, GITHUB_SHA: "1234567abcdef" }, stdio: "pipe" });
  const again = readFileSync(join(dist, "index.html"), "utf8");
  assert.equal((again.match(/version\.js/g) || []).length, 1);
  assert.match(again, /\?v=1234567-\d{12}/);
});

test("rodapé e telas de entrada exibem a versão; sem build aparece como desenvolvimento", () => {
  assert.match(workspace, /<span class="build-label" data-build-label[^>]*>\$\{escapeHtml\(buildLabel\(\)\)\}<\/span><\/footer>/);
  assert.equal((workspace.match(/<p class="build-label" data-build-label>/g) || []).length, 2, "login e criação do usuário master");
  const source = workspace.match(/function buildLabel\(\) \{[\s\S]*?\n\}\n/)[0];
  const label = (build) => {
    const sandbox = vm.createContext({});
    if (build) vm.runInContext(`var FLUXO_BUILD = ${JSON.stringify(build)};`, sandbox);
    vm.runInContext(source, sandbox);
    return vm.runInContext("buildLabel()", sandbox);
  };
  assert.match(label({ version: "0.4.0-prd3", build: "abcdef1", builtAt: "2026-10-19T12:19:44.787Z" }), /^Versão 0\.4\.0-prd3 · build abcdef1 · \d{2}\/\d{2}\/\d{4},? \d{2}:\d{2}$/);
  assert.equal(label({ version: "0.4.0-prd3", build: "abcdef1", builtAt: "inválida" }), "Versão 0.4.0-prd3 · build abcdef1");
  assert.equal(label(null), "Versão de desenvolvimento (sem build)");
});

test("npm run build encadeia o bundle e a identificação do build", () => {
  assert.match(pkg.scripts.build, /build-vendor\.mjs && node scripts\/build-version\.mjs/);
});
