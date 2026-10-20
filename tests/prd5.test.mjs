import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const workspace=readFileSync(new URL("../dist/workspace.js",import.meta.url),"utf8");
const app=readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
const parser=workspace.slice(workspace.indexOf("function prd5ParseIndentedItems("),workspace.indexOf("function prd5IndentKeydown("));
const run=vm.runInNewContext(parser+"\nprd5ParseIndentedItems");
test("PRD5: tabulacao gera niveis e pai correto",()=>{
 const nodes=run("ITEM\nITEM\n\tSUBITEM\n\t\tNETO\nITEM");
 assert.deepEqual(Array.from(nodes,n=>[n.title,n.depth,n.parentIndex]),[["ITEM",0,-1],["ITEM",0,-1],["SUBITEM",1,1],["NETO",2,2],["ITEM",0,-1]]);
});
test("PRD5: aceita quatro espacos e rejeita saltos",()=>{
 assert.equal(run("A\n    B\n        C")[2].parentIndex,1);
 assert.throws(()=>run("A\n\t\tB"),/pulou um nível/);
 assert.throws(()=>run("\tA"),/primeiro subitem/);
});
test("PRD5: formulario remove cadastro repetido e duracao visivel",()=>{
 assert.doesNotMatch(workspace,/Mais nomes, um por linha|Outros itens independentes no mesmo nível|data-step-duration/);
 assert.doesNotMatch(workspace.slice(workspace.indexOf("function renderCreatePanel()"),workspace.indexOf("function historyEventsFor(")),/name="parentId"|name="title"|name="plannedDurationDays"/);
 assert.match(workspace,/id="prd43PasteActivities"/);
 assert.match(workspace,/data-step-depth/);
 assert.match(workspace,/function prd5IndentKeydown/);
});
test("PRD5: gantt inclui campos sinteticos e grafico, preserva TI",()=>{
 for(const token of ["Gantt estruturado","Grafo Analítico","prd5-gantt-status","prd5-gantt-progress","prd5-gantt-dates","prd5-gantt-edit","prd43DrawGanttRelations","prd5ResizePanes"])assert.ok(workspace.includes(token),token);
 assert.match(workspace,/createRelation\(originId,targetId,"TI"\)/);
});
test("PRD5: historico e refresh organizacional",()=>{
 for(const token of ["prd5HistoryUser","prd5HistoryOrganization","prd5HistorySector","function prd5HistoryPanel"])assert.ok(workspace.includes(token),token);
 assert.match(workspace,/notify\("Empresa cadastrada\."\); render\(\);/);
 assert.match(workspace,/notify\("Setor cadastrado\."\); render\(\);/);
});
test("PRD5: core conserva somente contains e TI",()=>{
 const ctx=vm.createContext({console,document:{querySelector:()=>({})},localStorage:{getItem:()=>null,setItem:()=>{}}});
 vm.runInContext(app,ctx);
 assert.equal(vm.runInContext("relationTypes.map(x=>x.id).join(',')",ctx),"contains,TI");
});