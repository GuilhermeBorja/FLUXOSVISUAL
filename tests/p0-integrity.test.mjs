import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");

function createContext() {
  const storage = new Map();
  const sandbox = vm.createContext({
    console,
    document: { querySelector: () => ({}) },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
    },
  });
  vm.runInContext(source, sandbox);
  vm.runInContext("state=seedState();state.currentUserId='u_luis';", sandbox);
  return (script) => vm.runInContext(script, sandbox);
}

const itemDefaults = '{type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:"2026-10-20",dueAt:"2026-10-23",plannedDurationDays:3,weight:1}';

test("P0 M-01: dependência temporal não altera hierarquia e ciclo faz rollback integral", () => {
  const run = createContext();
  run(`a=createItem({... ${itemDefaults},title:"Temporal A"});b=createItem({... ${itemDefaults},title:"Temporal B"});`);
  run('createRelation(a.id,b.id,"TI",0,"Predecessora");');

  assert.equal(run('getItem(b.id).parentId'), "");
  assert.equal(run('state.relations.some((r)=>r.sourceId===a.id && r.targetId===b.id && r.relationType==="contains")'), false);
  assert.equal(run('state.relations.some((r)=>r.sourceId===a.id && r.targetId===b.id && r.relationType==="TI")'), true);

  run('beforeRelations=JSON.stringify(state.relations);beforeEvents=JSON.stringify(state.events);beforeItems=JSON.stringify(state.items);');
  assert.throws(() => run('createRelation(b.id,a.id,"TI",0,"Ciclo proibido")'), /ciclo nas dependências temporais/i);
  assert.equal(run('JSON.stringify(state.relations)'), run('beforeRelations'));
  assert.equal(run('JSON.stringify(state.events)'), run('beforeEvents'));
  assert.equal(run('JSON.stringify(state.items)'), run('beforeItems'));
});

test("P0 M-01: relação duplicada não cria eventos nem altera o grafo", () => {
  const run = createContext();
  run(`a=createItem({... ${itemDefaults},title:"Origem"});b=createItem({... ${itemDefaults},title:"Destino"});createRelation(a.id,b.id,"blocks",0,"Bloqueio");`);
  run('beforeRelations=JSON.stringify(state.relations);beforeEvents=JSON.stringify(state.events);');
  assert.throws(() => run('createRelation(a.id,b.id,"blocks",0,"Duplicada")'), /já existe|ja existe/i);
  assert.equal(run('JSON.stringify(state.relations)'), run('beforeRelations'));
  assert.equal(run('JSON.stringify(state.events)'), run('beforeEvents'));
});


test("P0 M-09: reprovação mantém identidade da aprovação, corrige e reenvia",()=>{
 const run=createContext();
 run(`item=createItem({... ${itemDefaults},title:"Aprovação em duas rodadas",type:"approval",ownerId:"u_luis"});item.approvalReviewerId="u_luis";originalId=item.id;firstSubmission=submitApprovalForReview(item.id,"Enviar rodada 1");firstDecision=decideApproval(item.id,"rejected","Corrigir critério","u_luis");correction=getItem(item.correctionItemId);updateItem(correction.id,{...correction,status:"done",progressPercent:100});secondSubmission=submitApprovalForReview(item.id,"Reenviar após correção");secondDecision=decideApproval(item.id,"approved","Critério atendido");`);
 assert.equal(run('item.id===originalId'),true);
 assert.equal(run('firstSubmission.round'),1);
 assert.equal(run('firstDecision.round'),1);
 assert.equal(run('firstDecision.outcome'),"rejected");
 assert.equal(run('correction.correctionFor===item.id'),true);
 assert.equal(run('state.relations.some(rel=>rel.sourceId===correction.id&&rel.targetId===item.id&&rel.relationType==="blocks")'),true);
 assert.equal(run('secondSubmission.round'),2);
 assert.equal(run('secondSubmission.previousDecisionId'),run('firstDecision.id'));
 assert.equal(run('secondDecision.round'),2);
 assert.equal(run('secondDecision.outcome'),"approved");
 assert.equal(run('item.status'),"done");
 assert.equal(run('state.approvalDecisions.filter(entry=>entry.requestId===item.id).length'),4);
});

test("P0 integrado: rede temporal e repactuação preservam baseline e identidade da relação", () => {
  const run = createContext();
  run(`root=createItem({... ${itemDefaults},title:"Grupo integrado",plannedStartAt:"2026-10-20",dueAt:"2026-10-20",plannedDurationDays:0});
    a=createItem({... ${itemDefaults},title:"Atividade A",parentId:root.id,plannedStartAt:"2026-10-20",dueAt:"2026-10-23",plannedDurationDays:3});
    b=createItem({... ${itemDefaults},title:"Atividade B",parentId:root.id,plannedStartAt:"2026-10-20",dueAt:"2026-10-22",plannedDurationDays:2});
    relation=createRelation(a.id,b.id,"TI",0,"Rede integrada");`);
  const relationId = run("relation.id");
  const baselineA = run("JSON.stringify({start:a.baselineStartAt,due:a.baselineDueAt})");
  const baselineB = run("JSON.stringify({start:b.baselineStartAt,due:b.baselineDueAt})");
  assert.equal(run("b.plannedStartAt"), "2026-10-23");
  assert.equal(run('state.relations.some((entry)=>entry.id===relation.id && entry.relationType==="TI")'), true);

  run('updateRelation(relation.id,{sourceId:a.id,targetId:b.id,relationType:"TI",lagDays:1,description:"Defasagem revisada"});');
  assert.equal(run("relation.id"), relationId, "editar a relação não pode recriar sua identidade");
  assert.equal(run("relation.lagDays"), 1);
  assert.equal(run("b.plannedStartAt"), "2026-10-24");

  run('updateItem(root.id,{...root,replannedDueAt:"2026-10-31"});');
  assert.equal(run("JSON.stringify({start:a.baselineStartAt,due:a.baselineDueAt})"), baselineA);
  assert.equal(run("JSON.stringify({start:b.baselineStartAt,due:b.baselineDueAt})"), baselineB);
  assert.notEqual(run("a.plannedStartAt"), "2026-10-20", "repactuação deve alterar a previsão, não a baseline");
  assert.equal(run('state.relations.filter((entry)=>entry.sourceId===a.id && entry.targetId===b.id && entry.relationType==="TI").length'), 1);
  // R2-10: só defasagem e descrição mudaram; o tipo continua TI e não gera evento de tipo.
  assert.equal(run('state.events.some((entry)=>entry.itemId===b.id && entry.eventType==="relation_lag_changed" && entry.toValue==="1")'), true);
  assert.equal(run('state.events.some((entry)=>entry.itemId===b.id && entry.eventType==="relation_description_changed" && entry.toValue==="Defasagem revisada")'), true);
  assert.equal(run('state.events.some((entry)=>entry.itemId===b.id && entry.eventType==="relation_updated")'), false);
});
