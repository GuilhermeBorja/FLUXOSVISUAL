import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
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
  assert.match(workspace, /parent\?\.baselineStartAt \|\| parent\?\.plannedStartAt/);
});

test("nós do grafo exibem início e término idealizados e instrução de arraste coerente", () => {
  assert.match(graph, /class="node-ideal-start"/);
  assert.match(graph, /class="node-ideal-end"/);
  assert.match(workspace, /idealStart: \(item\) => item\.plannedStartAt/);
  assert.match(workspace, /idealEnd: \(item\) => item\.dueAt/);
  assert.match(workspace, /Arraste um nó individualmente/);
});


function analyzeSchedule(items, relations) {
  const start = workspace.indexOf("function scheduleAnalysis(items) {");
  const end = workspace.indexOf("function renderGantt(items) {", start);
  const source = workspace.slice(start, end);
  const sandbox = {
    relationsFor: () => relations,
    today: () => "2026-01-01",
    shiftedDate: (date, offset) => {
      const value = new Date(date + "T12:00:00");
      value.setDate(value.getDate() + offset);
      return value.toISOString().slice(0, 10);
    },
  };
  return vm.runInNewContext(source + "\nscheduleAnalysis", sandbox)(items);
}

test("análise do Gantt calcula dependências, paralelismo e caminho crítico", () => {
  const items = [
    {id:"a",parentId:"",plannedStartAt:"2026-01-01",dueAt:"2026-01-05",plannedDurationDays:4},
    {id:"b",parentId:"",plannedStartAt:"2026-01-01",dueAt:"2026-01-03",plannedDurationDays:2},
    {id:"c",parentId:"",plannedStartAt:"2026-01-01",dueAt:"2026-01-04",plannedDurationDays:3},
  ];
  const analysis = analyzeSchedule(items,[{id:"ab",sourceId:"a",targetId:"b",relationType:"TI",lagDays:1}]);
  assert.equal(analysis.valid,true);
  assert.equal(analysis.reliable,true);
  assert.equal(analysis.durationDays,7);
  assert.equal(analysis.rows.find((row)=>row.item.id==="b").startOffset,5);
  assert.equal(analysis.rows.find((row)=>row.item.id==="a").critical,true);
  assert.equal(analysis.rows.find((row)=>row.item.id==="b").critical,true);
  assert.equal(analysis.rows.find((row)=>row.item.id==="c").critical,false);
});

test("análise do Gantt sinaliza duração ausente e ciclos temporais", () => {
  const items = [
    {id:"a",parentId:"",plannedStartAt:"2026-01-01"},
    {id:"b",parentId:"",plannedStartAt:"2026-01-01",dueAt:"2026-01-03",plannedDurationDays:2},
  ];
  const incomplete = analyzeSchedule(items,[]);
  assert.equal(incomplete.valid,true);
  assert.equal(incomplete.reliable,false);
  assert.match(incomplete.message,/nenhuma duração é presumida/);
  const cycle = analyzeSchedule(items.map((item)=>({...item,dueAt:item.dueAt || "2026-01-03"})),[
    {id:"ab",sourceId:"a",targetId:"b",relationType:"TI",lagDays:0},
    {id:"ba",sourceId:"b",targetId:"a",relationType:"TI",lagDays:0},
  ]);
  assert.equal(cycle.valid,false);
  assert.match(cycle.message,/ciclo/);
});

test("cores de estado configuradas são repassadas aos nós do grafo", () => {
  assert.match(graph, /const statusColor = options\.labels\.statusColor/);
  assert.match(graph, /stroke="\$\{esc\(statusColor\)\}"/);
  assert.match(workspace, /statusColor: \(item\) => statusConfig\(item\.status\)\.color/);
});

test("cores das linhas são configuráveis por nível e por projeto", () => {
  assert.match(workspace, /data-row-fill-level/);
  assert.match(workspace, /data-row-fill-project/);
  assert.match(workspace, /settings-reset-row-colors/);
  assert.match(workspace, /function rowFillColor\(item, depth\)/);
  assert.match(css, /--row-fill/);
});


test("Gantt aplica as quatro fórmulas de dependência temporal", () => {
  const items = [];
  const relations = [];
  for (const type of ["TI","II","TT","IF"]) {
    items.push({id:"s"+type,parentId:"",plannedStartAt:"2026-01-01",dueAt:"2026-01-05",plannedDurationDays:4});
    items.push({id:"t"+type,parentId:"",plannedStartAt:"2026-01-01",dueAt:"2026-01-03",plannedDurationDays:2});
    relations.push({id:"r"+type,sourceId:"s"+type,targetId:"t"+type,relationType:type,lagDays:1});
  }
  const analysis = analyzeSchedule(items,relations);
  assert.equal(analysis.valid,true);
  assert.equal(analysis.rows.find((row)=>row.item.id==="tTI").startOffset,5);
  assert.equal(analysis.rows.find((row)=>row.item.id==="tII").startOffset,1);
  assert.equal(analysis.rows.find((row)=>row.item.id==="tTT").startOffset,3);
  assert.equal(analysis.rows.find((row)=>row.item.id==="tIF").startOffset,0);
});

test("contexto do responsável é herdado e a cor de status chega ao Gantt", () => {
  assert.match(workspace, /organizationId:owner\?\.organizationId \|\| parent\?\.organizationId/);
  assert.match(workspace, /sectorId:owner\?\.sectorId \|\| parent\?\.sectorId/);
  assert.match(workspace, /state:owner\?\.state \|\| parent\?\.state/);
  assert.match(workspace, /statusConfig\(row\.item\.status\)\.color/);
  assert.match(workspace, /icon\(statusConfig\(row\.item\.status\)\.icon\)/);
});


test("preenchimento de linha prioriza projeto, depois nível, e valida a cor", () => {
  const start = workspace.indexOf("function rowFillColor(item, depth) {");
  const end = workspace.indexOf("function renderTable(items) {", start);
  const source = workspace.slice(start, end);
  const sandbox = {
    state: {rowFillSettings:{levels:{"1":"#123456"},projects:{projectA:"#abcdef",projectB:"red;position:fixed"}}},
    rootOf: (item) => ({id:item.project}),
  };
  const colorFor = vm.runInNewContext(source + "\nrowFillColor", sandbox);
  assert.equal(colorFor({project:"projectA"},1),"#abcdef");
  assert.equal(colorFor({project:"projectB"},1),"#123456");
  assert.equal(colorFor({project:"projectC"},1),"#123456");
  assert.equal(colorFor({project:"projectC"},0),"#ffffff");
});
