import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../dist/workspace.js",import.meta.url),"utf8");
const graph=readFileSync(new URL("../dist/graph.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../dist/styles.css",import.meta.url),"utf8");
const base='{title:"Tarefa",type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:"2026-10-20",plannedDurationDays:2}';
function runtime(){
  const local=new Map(),sandbox=vm.createContext({console,document:{querySelector:()=>({})},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)}});
  vm.runInContext(app,sandbox);vm.runInContext('state=seedState();state.currentUserId="u_luis";',sandbox);
  return input=>vm.runInContext(input,sandbox);
}
test("PRD4.3: pais destacam pior excecao sem sobrescrever progresso ponderado",()=>{
  const run=runtime();
  run('p=createItem({...'+base+',type:"project"});a=createItem({...'+base+',parentId:p.id});b=createItem({...'+base+',parentId:p.id,title:"B",status:"in_progress",progressPercent:40});');
  assert.equal(run('p.status'),"in_progress");
  assert.equal(run('p.progressPercent'),20);
  run('updateItem(a.id,{...a,status:"blocked"});');
  assert.equal(run('signalOf(p)'),"red");
  assert.equal(run('p.progressPercent'),20);
  assert.equal(run('prd43DescendantAlerts(p).blocked'),1);
  assert.equal(run('p.ownerId'),"u_luis");
  assert.equal(run('b.status'),"in_progress");
});
test("PRD4.3: atraso e risco usam amarelo; bloqueio tem prioridade vermelha",()=>{
  const run=runtime();
  run('a=createItem({...'+base+',plannedStartAt:"2020-01-02",plannedDurationDays:1});');
  assert.equal(run('signalOf(a)'),"yellow");
  run('updateItem(a.id,{...a,status:"blocked"});');
  assert.equal(run('signalOf(a)'),"red");
  run('updateItem(a.id,{...a,status:"done",progressPercent:100});');
  assert.equal(run('signalOf(a)'),"green");
});
test("PRD4.3: criacao unica e subitens por linha com sequencia TI facultativa",()=>{
  for(const token of ['id="prd43PasteActivities"','data-step-duration','data-step-owner','data-step-title','data-step-type','id="prd43Sequence"','name="autoSequence"','createRelation(children[index-1].id,children[index].id,"TI")','stepTitle_','stepOwner_','stepDuration_']){
    assert.ok(workspace.includes(token),token);
  }
  assert.ok(workspace.includes("additionalTitles"),"mantem cadastro no mesmo nivel");
  assert.doesNotMatch(workspace,/id="prd4QuickCreate"/);
});
test("PRD4.3: Gantt cria, mostra, altera e remove relacoes TI usando core",()=>{
  for(const token of ["data-gantt-handle","prd43BindGantt","prd43DrawGanttRelations","data-gantt-ti","prd43-update-ti","prd43-delete-ti","updateRelation(rel.id","createRelation(originId,targetId,\"TI\")","removeRelation(rel.id)","prd43-undo"]){
    assert.ok(workspace.includes(token),token);
  }
  assert.match(app,/TI somente entre atividades finais/);
  assert.ok(css.includes(".prd43-ti-path"));
});
test("PRD4.3: dashboard e tabela priorizam leitura sem alterar permissoes",()=>{
  assert.doesNotMatch(workspace,/Trabalho <small>Sintética/);
  assert.doesNotMatch(workspace,/Perfis reutilizáveis/);
  assert.match(workspace,/data-action="toggle-subitems"/);
  assert.match(workspace,/const mandatory=new Set\(compact\?/);
  assert.match(workspace,/function prd43ProgressBasis/);
  assert.match(workspace,/prd43InlineDeletion/);
  assert.match(css,/\.prd43-inline-confirm/);
});
test("PRD4.3: cores comuns dos cinco grupos e grafo com etiquetas expandidas",()=>{
  for(const color of ["#b42332","#115e38","#238254","#9f6a00","#596872"]){
    assert.ok(workspace.includes(color),color);
  }
  assert.match(css,/\.prd43-gantt-bar\.signal-red/);
  assert.match(css,/\.status-badge\.yellow/);
  assert.match(graph,/function wrapLabel\(title,limit=24\)/);
  assert.match(graph,/lines\.length>4/);
});
test("PRD4.3: alteracao de TI nao aceita vinculo a item pai",()=>{
  const run=runtime();
  run('p=createItem({...'+base+',type:"project"});a=createItem({...'+base+',parentId:p.id});b=createItem({...'+base+',title:"B"});c=createItem({...'+base+',title:"C"});rel=createRelation(a.id,b.id,"TI");');
  assert.throws(()=>run('updateRelation(rel.id,{...rel,sourceId:p.id,targetId:c.id})'),/atividades finais/);
  assert.equal(run('rel.sourceId===a.id&&rel.targetId===b.id'),true);
});
