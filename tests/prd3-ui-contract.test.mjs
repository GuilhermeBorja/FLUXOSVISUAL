import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("../dist/workspace.js", import.meta.url), "utf8");
const graph = readFileSync(new URL("../dist/graph.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../dist/styles.css", import.meta.url), "utf8");

test("templates têm ações separadas e criação é acessível no cabeçalho", () => {
  assert.match(workspace, /data-action="templates">.*?Modelos/s);
  assert.match(workspace, /data-action="create-from-template">.*?Criar conforme template/s);
  assert.match(workspace, /action === "create-from-template"/);
  assert.ok(workspace.includes('ui.templateCreationMode ? "Criar conforme template" : "Modelos"'));
});

test("propagação começa no item selecionado e evita repetir nós", () => {
  assert.match(graph, /visit\(id\);/);
  assert.match(graph, /const visited = new Set\(\);/);
  assert.match(graph, /Finish its subtree, then climb/);
});

test("fallback do grafo move o nó selecionado sem arrastar todo o componente", () => {
  assert.match(graph, /move the selected node only/);
  assert.doesNotMatch(graph, /const nodes = model\.nodes\.filter\(\(node\) => model\.connected\.get\(node\.id\) === componentId\)/);
});

test("configurações locais permitem alterar colunas e restaurar larguras automáticas", () => {
  assert.match(workspace, /function renderViewSettingsPanel\(\)/);
  assert.match(workspace, /data-setting-column/);
  assert.match(workspace, /settings-auto-fit/);
  assert.match(workspace, /settings-reset-columns/);
});

test("usuários cadastrados podem ser editados com validação e cancelamento", () => {
  assert.match(workspace, /data-edit-user=/);
  assert.match(workspace, /function renderUserEditForm\(\)/);
  assert.match(workspace, /submitHandler\("userEditForm"/);
  assert.match(workspace, /action === "cancel-user-edit"/);
  assert.match(workspace, /Este e-mail já está cadastrado/);
});

test("identidade e responsividade do produto estão definidas", () => {
  assert.match(html, /<title>Fluxo Visual<\/title>/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /table-layout: auto/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("Gantt não presume duração de um dia quando a duração está ausente", () => {
  assert.match(workspace, /const explicitDuration = Number\(item\.plannedDurationDays\)/);
  assert.match(workspace, /if \(days === null\) durationsComplete = false/);
  assert.match(workspace, /nenhuma duração é presumida/);
  assert.doesNotMatch(workspace, /: 1;\s*duration\.set\(item\.id,days\)/);
});

test("cadastro exige duração explícita e subitens herdam o início de referência", () => {
  assert.match(workspace, /Informe a duração planejada para calcular a previsão/);
  assert.match(workspace, /item\.parentId \? `<div class="schedule-summary">/);
  assert.match(workspace, /parentId:parent\.id/);
});

test("nós do grafo exibem início e término idealizados e instrução de arraste coerente", () => {
  assert.match(graph, /class="node-ideal-start"/);
  assert.match(graph, /class="node-ideal-end"/);
  assert.match(workspace, /idealStart: \(item\) => item\.plannedStartAt/);
  assert.match(workspace, /idealEnd: \(item\) => item\.dueAt/);
  assert.match(workspace, /Arraste um nó individualmente/);
});
