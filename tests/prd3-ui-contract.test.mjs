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

test("magnetismo controlado move nós relacionados proporcionalmente sem reexecutar forças", () => {
  assert.match(graph, /Controlled PRD3 magnetism attempt/);
  assert.match(graph, /distanceById\.set\(neighborId, distanceById\.get\(currentId\) \+ 1\)/);
  assert.match(graph, /Math\.max\(0\.08, Math\.pow\(0\.32, distance\)\)/);
  assert.match(graph, /gesture\.kind === "nodes" \? origin\.influence \?\? 1 : 1/);
  assert.match(graph, /function savePositions\(\)/);
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
  const appSource = readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
  const helpers = appSource.slice(appSource.indexOf("function calendarDayNumber("),appSource.indexOf("function recalculatePlannedDates("));
  return vm.runInNewContext(helpers + source + "\nscheduleAnalysis", sandbox)(items);
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
  assert.equal(analysis.rows.find((row)=>row.item.id==="a").slack,0);
  assert.equal(analysis.rows.find((row)=>row.item.id==="b").slack,0);
  assert.equal(analysis.rows.find((row)=>row.item.id==="c").slack,4);
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

test("atividades canceladas não ampliam a previsão nem o caminho crítico", () => {
  const items = [
    {id:"active",parentId:"",status:"in_progress",plannedStartAt:"2026-01-01",dueAt:"2026-01-03",plannedDurationDays:2},
    {id:"cancelled",parentId:"",status:"cancelled",plannedStartAt:"2026-01-01",dueAt:"2026-04-11",plannedDurationDays:100},
  ];
  const analysis = analyzeSchedule(items,[]);
  assert.equal(analysis.valid,true);
  assert.equal(analysis.durationDays,2);
  assert.equal(analysis.rows.some((row)=>row.item.id==="cancelled"),false);
});

test("cronograma sem atividades ativas não apresenta data fictícia de término", () => {
  const analysis = analyzeSchedule([{id:"cancelled",parentId:"",status:"cancelled",plannedStartAt:"2026-01-01",dueAt:"2026-01-11",plannedDurationDays:10}],[]);
  assert.equal(analysis.valid,true);
  assert.equal(analysis.reliable,false);
  assert.equal(analysis.finishDate,"");
  assert.match(analysis.message,/Não há atividades ativas/);
});

test("atividades canceladas têm barra neutra no Gantt e não são caminho crítico", () => {
  assert.match(workspace, /row\.item\.status === "cancelled" \? "cancelled"/);
  assert.match(css, /\.gantt-bar\.cancelled/);
});

test("criação em lote não presume a duração de etapas sem valor explícito", () => {
  assert.match(workspace, /Informe a duração de cada etapa para calcular a previsão/);
  assert.match(workspace, /if \(!durationRaw\) throw new Error\(`Informe a duração da etapa/);
  assert.doesNotMatch(workspace, /duration === null \? Number\(input\.plannedDurationDays \|\| 0\)/);
});


test("histórico do pai agrega eventos descendentes sem expor itens não autorizados", () => {
  const start = workspace.indexOf("function historyEventsFor(rootItem) {");
  const end = workspace.indexOf("function renderItemPanel(item) {", start);
  const source = workspace.slice(start, end);
  const items = [
    {id:"p",parentId:"",allowed:true},
    {id:"c",parentId:"p",allowed:true},
    {id:"g",parentId:"c",allowed:true},
    {id:"secret",parentId:"p",allowed:false},
  ];
  const sandbox = {
    state:{items,events:[{itemId:"p",id:"ep"},{itemId:"c",id:"ec"},{itemId:"g",id:"eg"},{itemId:"secret",id:"es"}]},
    currentUser:()=>({id:"u"}),
    canViewItem:(_user,item)=>item.allowed,
  };
  const events = vm.runInNewContext(source + "\nhistoryEventsFor",sandbox)({id:"p"});
  assert.equal(Array.from(events,(event)=>event.id).sort().join(","),"ec,eg,ep");
});

test("seletores operacionais usam a cor configurada para cada estado", () => {
  assert.match(workspace, /function statusOption\(status, selected = false\)/);
  assert.match(workspace, /style="color:\$\{escapeHtml\(statusConfig\(status\.id\)\.color\)\}"/);
  assert.match(workspace, /map\(\(status\) => statusOption\(status/);
});


test("timer do nó mede o tempo com o responsável atual", () => {
  const start = workspace.indexOf("function ownerElapsedLabel(item) {");
  const end = workspace.indexOf("function activityDurationLabel(item) {", start);
  const source = workspace.slice(start, end);
  const sandbox = {
    state:{events:[{itemId:"task",eventType:"owner_changed",toValue:"u2",effectiveAt:"2026-01-02T00:00:00.000Z"}]},
    nowIso:()=> "2026-01-03T00:00:00.000Z",
    durationFromMinutes:(minutes)=>String(minutes),
  };
  const timer = vm.runInNewContext(source + "\nownerElapsedLabel",sandbox);
  assert.equal(timer({id:"task",ownerId:"u2",createdAt:"2026-01-01T00:00:00.000Z",completedAt:""}),"1440");
});


test("P0: a Sintética não apresenta peso inválido zero como peso padrão 1", () => {
  assert.ok(workspace.includes('<td class="weight-cell">${Number(item.weight ?? 1)}</td>'));
  assert.equal(workspace.includes("Number(item.weight || 1)"), false);
});


test("P0 R2-19: propagação percorre subárvore, sobe aos pais e visita ramos restantes sem repetir nós", () => {
  const start = graph.indexOf("function propagate(id) {");
  const end = graph.indexOf("function fit(initial = false) {", start);
  assert.ok(start >= 0 && end > start);
  const source = graph.slice(start, end);
  const items = [
    {id:"root",parentId:"",sortOrder:0,status:"ready"},
    {id:"a",parentId:"root",sortOrder:100,status:"in_progress"},
    {id:"grandchild",parentId:"a",sortOrder:100,status:"ready"},
    {id:"b",parentId:"root",sortOrder:200,status:"waiting",blocked:true},
    {id:"other",parentId:"",sortOrder:0,status:"ready"},
  ];
  const relations = [
    {id:"root-a",sourceId:"root",targetId:"a",relationType:"contains"},
    {id:"a-grandchild",sourceId:"a",targetId:"grandchild",relationType:"contains"},
    {id:"root-b",sourceId:"root",targetId:"b",relationType:"contains"},
  ];
  const classes = new Map(items.map((item)=>[item.id,new Set()]));
  const makeElement = (id) => ({
    classList:{
      add:(...names)=>names.forEach((name)=>classes.get(id).add(name)),
      remove:(...names)=>names.forEach((name)=>classes.get(id).delete(name)),
    },
  });
  const nodeElements = new Map(items.map((item)=>[item.id,makeElement(item.id)]));
  const edgeElements = new Map(relations.map((relation)=>[relation.id,{
    classList:{add:()=>{},remove:()=>{}},
  }]));
  const timers = [];
  const model = {
    nodes:items.map((item)=>({id:item.id,item})),
    nodeById:new Map(items.map((item)=>[item.id,{id:item.id,item}])),
    links:relations.map((relation)=>({
      source:{id:relation.sourceId},
      target:{id:relation.targetId},
      relation,
    })),
  };
  const sandbox = {
    model, options:{items}, nodeElements, edgeElements,
    propagationTimers:[],
    setTimeout:(callback,delay)=>{timers.push({callback,delay});return timers.length;},
    clearTimeout:()=>{},
  };
  const propagate = vm.runInNewContext(source+"\npropagate",sandbox);
  assert.equal(propagate("a"),true);
  const finishDelay = items.length * 430 + 1800;
  const order = [];
  for (const timer of timers.filter((entry)=>entry.delay<finishDelay).sort((a,b)=>a.delay-b.delay)) {
    timer.callback();
    order.push([...classes].find(([,value])=>value.has("propagation-current"))?.[0]);
  }
  assert.deepEqual(order,["a","grandchild","root","b","other"]);
  assert.equal(new Set(order).size,items.length);
  assert.equal(classes.get("b").has("propagation-stop"),true);
});

test("M-11: seletor de anexos informa limites e armazenamento local antes do envio", () => {
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  const perFile = Number(app.match(/const MAX_ATTACHMENT_BYTES = (\d+);/)?.[1]);
  const total = Number(app.match(/const MAX_ATTACHMENT_TOTAL_BYTES = (\d+);/)?.[1]);
  const notice = workspace.match(/<small class="attachment-limits">([^<]+)<\/small>/)?.[1] || "";
  assert.ok(notice, "aviso de limites ausente no seletor de anexos");
  assert.equal(perFile, 256 * 1024);
  assert.equal(total, 1024 * 1024);
  assert.match(notice, /256 KB por arquivo/);
  assert.match(notice, /1 MB no total/);
  assert.match(notice, /apenas neste navegador/);
  assert.match(notice, /sem armazenamento no servidor/);
});

test("R2-31: identidade 'Fluxo Visual' sem o slogan antigo e com nome da organização no cabeçalho", () => {
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  const normalize = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  for (const [name, content] of [["workspace.js", workspace], ["app.js", app], ["graph.js", graph], ["index.html", html], ["README.md", readme]]) {
    assert.doesNotMatch(normalize(content), /gestao operacional/, `${name} ainda contém o slogan antigo`);
  }
  assert.doesNotMatch(readme, /Fluxos ·/);
  const brands = workspace.match(/<div class="brand">\$\{icon\("workflow"\)\}<span>([^<]+)<\/span><\/div>/g) || [];
  assert.ok(brands.length >= 3, "telas de login, master e workspace devem exibir a marca");
  for (const brand of brands) assert.match(brand, /<span>FLUXO VISUAL<\/span>/);
  assert.match(workspace, /<h1>\$\{escapeHtml\(orgName\(user\.organizationId\) === "-" \? "Organização" : orgName\(user\.organizationId\)\)\}<\/h1>/);
  assert.match(html, /<title>Fluxo Visual<\/title>/);
  assert.match(html, /content="Fluxo Visual — /);
});

test("R2-14/R2-12: estados transitórios e legados continuam representáveis sem aparecer nas escolhas comuns", () => {
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  const sandbox = vm.createContext({});
  vm.runInContext(app.match(/const statusCatalog = \[[\s\S]*?\n\];/)[0], sandbox);
  vm.runInContext(workspace.match(/function statusChoices\(currentStatus\) \{[^\n]*\}/)[0], sandbox);
  const ids = (current) => vm.runInContext(`statusChoices(${JSON.stringify(current)}).map((status) => status.id)`, sandbox);
  const labelOf = (id) => vm.runInContext(`statusCatalog.find((status) => status.id === ${JSON.stringify(id)})?.label`, sandbox);
  // Escolhas comuns não oferecem os estados transitórios.
  for (const current of ["backlog", "ready", "in_progress", "done"]) {
    assert.ok(!ids(current).includes("under_review") && !ids(current).includes("correction"), `${current}: transitório não deve aparecer`);
  }
  // Registro antigo em estado transitório mantém a própria opção e não cai na primeira da lista.
  assert.ok(ids("under_review").includes("under_review"));
  assert.ok(ids("correction").includes("correction"));
  assert.ok(!ids("under_review").includes("correction"));
  // Mesmos ids de status de antes da renomeação: dados salvos continuam válidos; só os rótulos mudaram.
  assert.equal(labelOf("backlog"), "Lista de pendências");
  assert.equal(labelOf("ready"), "Liberado para execução");
  assert.ok(!/\bBacklog\b|\bPronto\b/.test(workspace.replace(/"backlog"|backlog:/g, "")), "rótulo legado fixo na interface");
  assert.match(workspace, /statusChoices\(item\.status \|\| "backlog"\)/);
});

test("M-05: interface exibe bloqueio como indicador, com filtro, formulário e histórico próprios", () => {
  assert.match(workspace, /const blockedMark = isBlocked\(item\)/);
  assert.match(workspace, /\$\{blockedMark\}\$\{indicator\}/);
  assert.match(workspace, /<select data-filter="indicator">/);
  assert.match(workspace, /state\.filters\.indicator, state\.filters\.type/);
  assert.match(workspace, /name="blocked"/);
  assert.match(workspace, /name="blockedReason"/);
  assert.match(workspace, /form\.id === "updateItemForm"\) \{ result\.blocked = form\.get\("blocked"\) === "on"/);
  assert.match(workspace, /blocked_set:"Bloqueio sinalizado"/);
  assert.doesNotMatch(workspace, /status === "blocked"/);
  assert.doesNotMatch(graph, /status === "blocked"/);
});

test("R2-10: todo tipo de evento emitido tem rótulo e valores legíveis no histórico", () => {
  const app = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
  const emitted = new Set([...app.matchAll(/createEvent\([^,]+,\s*"([a-z_]+)"/g)].map((match) => match[1]));
  for (const [, type] of app.match(/const fields = \{([^}]*)\}/)[1].matchAll(/:"([a-z_]+_changed)"/g)) emitted.add(type);
  const labels = new Set([...workspace.match(/const eventLabels = \{([\s\S]*?)\};/)[1].matchAll(/(\w+):"/g)].map((match) => match[1]));
  const missing = [...emitted].filter((type) => !labels.has(type));
  assert.deepEqual(missing, [], `tipos de evento sem rótulo: ${missing.join(", ")}`);

  const storage = new Map();
  const sandbox = vm.createContext({ console, document: { querySelector: () => ({}) }, localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  vm.runInContext(app, sandbox);
  vm.runInContext('state = seedState(); function dateCell(value) { return "D:" + value; } function formatDateTime(value) { return "DT"; } function userName(id) { return state.users.find((user) => user.id === id)?.name || id; }', sandbox);
  vm.runInContext(workspace.match(/function eventValue\(event, value\) \{[\s\S]*?\n\}\n/)[0], sandbox);
  const show = (eventType, value) => vm.runInContext(`eventValue({eventType:${JSON.stringify(eventType)},itemId:"item_doors"},${JSON.stringify(value)})`, sandbox);
  assert.equal(show("context_changed", "sec_obra"), vm.runInContext('state.sectors.find((entry)=>entry.id==="sec_obra").name', sandbox));
  assert.equal(show("context_changed", "org_dmk"), vm.runInContext('state.organizations.find((entry)=>entry.id==="org_dmk").name', sandbox));
  assert.equal(show("context_changed", "PE"), "PE");
  assert.equal(show("parent_changed", "item_doors"), vm.runInContext('getItem("item_doors").title', sandbox));
  assert.equal(show("relation_retargeted", "item_doors"), vm.runInContext('getItem("item_doors").title', sandbox));
  assert.equal(show("relation_updated", "TI"), "TI · Término / Início");
  assert.equal(show("relation_lag_changed", "3"), "3 dias");
  assert.equal(show("started", "2026-10-19T01:08:31.700Z"), "DT");
  assert.equal(show("reopened", "done"), "Concluído");
});

test("M-03: telas que exibem o tipo usam a configuração por empresa", () => {
  const uses = (workspace.match(/itemTypeConfig\(/g) || []).length;
  assert.ok(uses >= 5, `tabela, árvore, grafo, formulário e configurações devem usar itemTypeConfig (achou ${uses})`);
  assert.match(workspace, /itemTypeConfig\(item\.type,item\.organizationId\)\.label/);
  assert.match(workspace, /typeColor: \(item\) => itemTypeConfig\(item\.type,item\.organizationId\)\.color/);
  assert.match(workspace, /const configured = itemTypeConfig\(type\.id,organizationId\)/);
  // Limite documentado: a configuração cobre ícone e cor; campos e transições por tipo são da Etapa 2.
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /Atributos personalizados e regras configuráveis de transição pertencem à formalização do modelo/);
});
