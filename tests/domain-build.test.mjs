import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");

test("build gera e carrega o domínio antes dos consumidores do navegador", () => {
  assert.match(pkg.scripts.build, /build-domain\.mjs/);
  assert.match(pkg.scripts.check, /--check dist\/domain\.js/);
  assert.match(html, /<script src="\.\/domain\.js[^\"]*"><\/script>/);
  assert.ok(html.indexOf("./domain.js") < html.indexOf("./graph.js"));
  assert.ok(html.indexOf("./domain.js") < html.indexOf("./app.js"));
  assert.ok(html.indexOf("./domain.js") < html.indexOf("./workspace.js"));
});

test("gates mantidos usam domínio, backend e E2E autenticado sem executar testes estáticos legados", () => {
  assert.match(pkg.scripts.test, /tests\/domain-\*\.test\.mjs/);
  assert.match(pkg.scripts.test, /tests\/trend-engine\.test\.mjs/);
  assert.match(pkg.scripts.test, /tests\/build-version\.test\.mjs/);
  assert.doesNotMatch(pkg.scripts.test, /prd\d|core\.test|deletion\.test|graph\.test/);
  assert.equal(pkg.scripts["test:legacy"], undefined);
  assert.match(pkg.scripts["test:all"], /npm test/);
  assert.match(pkg.scripts["test:all"], /test:backend/);
  assert.match(pkg.scripts["test:all"], /test:backend:browser/);
  assert.match(pkg.scripts["test:backend:browser"], /graph-projection-e2e\.mjs/);
});

