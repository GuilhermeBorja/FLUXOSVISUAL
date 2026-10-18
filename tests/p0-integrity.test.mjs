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


test("P0 M-09: reprovação, correção e aprovação preservam rodada e encadeamento", () => {
  const run = createContext();
  run(`item=createItem({... ${itemDefaults},title:"Aprovação em duas rodadas",type:"approval",ownerId:"u_luis"});item.approvalReviewerId="u_luis";firstSubmission=submitApprovalForReview(item.id,"Enviar rodada 1");firstDecision=decideApproval(item.id,"rejected","Corrigir critério","u_luis");revision=getItem(item.supersededBy);secondSubmission=submitApprovalForReview(revision.id,"Reenviar após correção");secondDecision=decideApproval(revision.id,"approved","Critério atendido");`);

  assert.equal(run("firstSubmission.round"), 1);
  assert.equal(run("firstSubmission.kind"), "submitted");
  assert.equal(run("firstDecision.round"), 1);
  assert.equal(run("firstDecision.outcome"), "rejected");
  assert.equal(run("firstDecision.reason"), "Corrigir critério");
  assert.equal(run("firstDecision.reviewerId"), "u_luis");
  assert.ok(run("firstDecision.createdAt"));
  assert.equal(run("revision.approvalRound"), 2);
  assert.equal(run("revision.revisionOf"), run("item.id"));
  assert.equal(run("secondSubmission.round"), 2);
  assert.equal(run("secondSubmission.previousDecisionId"), run("firstDecision.id"));
  assert.equal(run("secondDecision.round"), 2);
  assert.equal(run("secondDecision.outcome"), "approved");
  assert.equal(run("secondDecision.previousDecisionId"), run("firstDecision.id"));
  assert.equal(run('getItem(revision.id).status'), "done");
  assert.equal(run('state.approvalDecisions.filter((entry)=>entry.requestId===item.id).length'), 4);
});
