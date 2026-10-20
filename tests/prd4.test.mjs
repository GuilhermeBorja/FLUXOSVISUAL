import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../dist/workspace.js",import.meta.url),"utf8");
const graph=readFileSync(new URL("../dist/graph.js",import.meta.url),"utf8");
function runtime(){
  const storage=new Map();
  const sandbox=vm.createContext({console,document:{querySelector:()=>({})},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(app,sandbox);
  vm.runInContext('state=seedState();state.currentUserId="u_luis";',sandbox);
  return expression=>vm.runInContext(expression,sandbox);
}
const input='{title:"Exemplo",type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:"2026-10-20",plannedDurationDays:2}';

test("PRD4: catalogo tem so CONTEM e TI e Bloqueado e um status",()=>{
  const run=runtime();
  assert.equal(run('relationTypes.map(item=>item.id).join(",")'),"contains,TI");
  assert.equal(run('statusCatalog.find(item=>item.id==="blocked").label'),"Bloqueado");
  assert.equal(run('itemTypes.some(item=>item.id==="blocker")'),false);
});

test("PRD4: sequencia TI nao muda status apenas planejamento",()=>{
  const run=runtime();
  run('a=createItem('+input+');b=createItem({...'+input+',title:"B"});createRelation(a.id,b.id,"TI");');
  assert.equal(run('b.status'),"backlog");
  assert.equal(run('b.baselineStartAt'),"2026-10-20");
  assert.equal(run('b.plannedStartAt'),"2026-10-22");
  assert.equal(run('state.events.some(e=>e.itemId===b.id && e.eventType==="start_changed" && e.comment.includes("Recalculo"))'),true);
});

test("PRD4: TI valida ciclo e preserva itens",()=>{
  const run=runtime();
  run('a=createItem('+input+');b=createItem({...'+input+',title:"B"});createRelation(a.id,b.id,"TI");');
  assert.throws(()=>run('createRelation(b.id,a.id,"TI")'),/ciclo/i);
  assert.equal(run('state.relations.filter(r=>r.relationType==="TI" && r.sourceId===b.id && r.targetId===a.id).length'),0);
});

test("PRD4: estados Bloqueados sao herdados e revertidos",()=>{
  const run=runtime();
  run('a=createItem('+input+');b=createItem({...'+input+',title:"B"});createRelation(a.id,b.id,"TI");');
  run('updateItem(a.id,{...a,status:"blocked",progressPercent:0});');
  assert.equal(run('a.status==="blocked" && b.status==="blocked"'),true);
  assert.equal(run('b.inheritedBlockedFrom.includes(a.id)'),true);
  run('updateItem(a.id,{...a,status:"ready",progressPercent:0});');
  assert.equal(run('b.status'),"backlog");
  assert.equal(run('b.inheritedBlockedFrom.length'),0);
});

test("PRD4: em execucao pode receber alerta e seguir sem rebloqueio",()=>{
  const run=runtime();
  run('a=createItem('+input+');b=createItem({...'+input+',title:"B",status:"in_progress",progressPercent:20});createRelation(a.id,b.id,"TI");updateItem(a.id,{...a,status:"blocked"});');
  assert.equal(run('b.status'),"in_progress");
  assert.equal(run('b.inheritedBlockedFrom.includes(a.id)'),true);
  run('recalculateBlocking();');
  assert.equal(run('b.status'),"in_progress");
});

test("PRD4: desbloqueio manual de sucessor mantem alerta herdado",()=>{
  const run=runtime();
  run('a=createItem('+input+');b=createItem({...'+input+',title:"B"});createRelation(a.id,b.id,"TI");updateItem(a.id,{...a,status:"blocked"});');
  run('updateItem(b.id,{...b,status:"in_progress",progressPercent:20});recalculateBlocking();');
  assert.equal(run('b.status'),"in_progress");
  assert.equal(run('b.inheritedBlockedFrom.includes(a.id)'),true);
});

test("PRD4: duas causas de bloqueio somente liberam apos ambas resolvidas",()=>{
  const run=runtime();
  run('a=createItem('+input+');c=createItem({...'+input+',title:"C"});b=createItem({...'+input+',title:"B"});createRelation(a.id,b.id,"TI");createRelation(c.id,b.id,"TI");updateItem(a.id,{...a,status:"blocked"});updateItem(c.id,{...c,status:"blocked"});');
  assert.equal(run('b.inheritedBlockedFrom.length'),2);
  run('updateItem(a.id,{...a,status:"ready"});');
  assert.equal(run('b.status'),"blocked");
  run('updateItem(c.id,{...c,status:"ready"});');
  assert.equal(run('b.status'),"backlog");
});

test("PRD4: consolidacao pondera folhas e pais nao concluem prematuramente",()=>{
  const run=runtime();
  run('p=createItem({...'+input+',title:"Pai",type:"process"});');
  run('a=createItem({...'+input+',title:"A",parentId:p.id});b=createItem({...'+input+',title:"B",parentId:p.id});');
  run('updateItem(a.id,{...a,status:"done",progressPercent:100});');
  assert.equal(run('p.status==="in_progress" && p.progressPercent===50'),true);
  run('updateItem(b.id,{...b,status:"done",progressPercent:100});');
  assert.equal(run('p.status==="done" && p.progressPercent===100'),true);
});

test("PRD4: filhos todos cancelados geram pai cancelado",()=>{
  const run=runtime();
  run('p=createItem({...'+input+',type:"process"});a=createItem({...'+input+',parentId:p.id});');
  run('updateItem(a.id,{...a,status:"cancelled"});');
  assert.equal(run('p.status'),"cancelled");
});

test("PRD4: reprovar aprovacao cria correcao TI visivel",()=>{
  const run=runtime();
  run('approval=createItem({...'+input+',type:"approval"});approval.status="under_review";');
  run('decision=decideApproval(approval.id,"rejected","Ajustar escopo","u_luis");');
  assert.equal(run('getItem(approval.correctionItemId).correctionFor===approval.id'),true);
  assert.equal(run('state.relations.some(r=>r.sourceId===approval.correctionItemId && r.targetId===approval.id && r.relationType==="TI")'),true);
  assert.equal(run('approval.status'),"correction");
});

test("PRD4: nao ha aba Relações na ficha do item",()=>{
  assert.doesNotMatch(workspace,/label:"Relações \("/);
  assert.match(workspace,/id:"history",label:"Histórico/);
});

test("PRD4: cadastro contextual preserva lotes, tipo, responsavel, inicio e duracao",()=>{
  for(const name of ["createItemForm","additionalTitles","quickSteps","plannedDurationDays","plannedStartAt","ownerId","type"])
    assert.ok(workspace.includes(name),name);
  assert.doesNotMatch(workspace,/id="prd4QuickCreate"/);
  assert.match(workspace,/additionalTitles\.length > 99/);
});

test("PRD4: graph tem conector independente, exclusao Delete e animacao pausavel",()=>{
  for(const term of ["graph-connector","onCreateRelation","onDeleteRelation","onDeleteKey","function pause()","function restart()","animationPath"])
    assert.ok(graph.includes(term),term);
  assert.ok(graph.includes('mode="sequential"') || graph.includes('mode="sequential",'));
  assert.ok(graph.includes('stopAtBlocked'));
});

test("PRD4: grafico utiliza somente conexoes TI e CONTEM no percurso",()=>{
  assert.match(graph,/link\.relation\.relationType==="TI" \|\| link\.relation\.relationType==="contains"/);
  assert.match(graph,/function route\(from,to\)/);
});

test("PRD4: historico automatico de datas apresenta valores anterior e novo",()=>{
  const run=runtime();
  run('a=createItem('+input+');b=createItem({...'+input+',title:"B"});createRelation(a.id,b.id,"TI");');
  assert.equal(run('state.events.some(e=>e.itemId===b.id && e.eventType==="start_changed" && e.fromValue!==e.toValue)'),true);
});
