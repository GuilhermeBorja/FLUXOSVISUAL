import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
function context() {
  const storage = new Map();
  const sandbox = vm.createContext({console,document:{querySelector:()=>({})},localStorage:{getItem:(key)=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(source,sandbox);
  return (script) => vm.runInContext(script,sandbox);
}
const defaults = '{title:"Teste",type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:today(),dueAt:today(3)}';

test("as dez alçadas respeitam criação, edição e escopo", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  for (let level=1;level<=10;level++) {
    run(`testUser={...currentUser(),permissionLevel:${level}};testItem={...getItem("item_doors")};`);
    assert.equal(run("canViewItem(testUser,testItem)"),true,`visibilidade ${level}`);
    assert.equal(run("canEditItem(testUser,testItem)"),[1,3,5,7,9,10].includes(level),`edição ${level}`);
    assert.equal(run("canRemoveItem(testUser)"),level===10);
    run('testItem={...testItem,createdBy:"outside",state:"SP",sectorId:"outside",organizationId:"outside"};');
    assert.equal(run("canViewItem(testUser,testItem)"),[8,9,10].includes(level),`escopo ${level}`);
  }
  run('testUser.disabled=true;');
  assert.equal(run("canViewItem(testUser,testItem)"),false);
});

test("relações só são exibidas quando ambos os itens são visíveis", () => {
  const run = context();
  run('state.currentUserId="u_enrique";');
  assert.equal(run("visibleRelations().length"),0);
  run('state.currentUserId="u_luis";state.filters.status="done";');
  assert.equal(run('visibleRelations().every((rel)=>getItem(rel.sourceId).status==="done" && getItem(rel.targetId).status==="done")'),true);
});

test("criação e edição fora da alçada não alteram dados", () => {
  const run = context();
  run('state.currentUserId="u_virginia";count=state.items.length;');
  assert.throws(()=>run(`createItem({...${defaults},organizationId:"org_dmk",sectorId:"sec_fornecedor"})`),/al[çc]ada/);
  assert.equal(run("state.items.length===count"),true);
  const original = run('getItem("item_doors").title');
  assert.throws(()=>run('updateItem("item_doors",{...getItem("item_doors"),title:"Inválido",organizationId:"org_dmk",sectorId:"sec_fornecedor"})'),/al[çc]ada/);
  assert.equal(run('getItem("item_doors").title'),original);
});

test("hierarquia aceita subitens e impede ciclos e pais duplicados", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`parent=createItem(${defaults});child=createItem({...${defaults},parentId:parent.id});other=createItem(${defaults});`);
  assert.equal(run("child.parentId===parent.id"),true);
  assert.throws(()=>run('createRelation(child.id,parent.id,"contains")'),/ciclos/);
  assert.throws(()=>run('createRelation(other.id,child.id,"contains")'),/pai/);
  assert.throws(()=>run('createRelation(parent.id,child.id,"contains")'),/existe/);
  for(const type of ["TI","II","TT","IF"]) run(`createRelation(child.id,other.id,"${type}",1);`);
  assert.equal(run("state.relations.filter((r)=>r.sourceId===child.id && r.targetId===other.id).length"),4);
});

test("conclusão e reabertura registram autor e data efetiva sem apagar histórico", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`item=createItem(${defaults});updateItem(item.id,{...item,status:"done",ownerId:"u_mateus"},"2026-10-08T12:00:00.000Z","Entrega revisada");`);
  assert.equal(run("item.completedAt"),"2026-10-08T12:00:00.000Z");
  assert.equal(run('state.events.some((event)=>event.itemId===item.id && event.eventType==="owner_changed" && event.effectiveAt==="2026-10-08T12:00:00.000Z" && event.userId==="u_luis")'),true);
  run('updateItem(item.id,{...item,status:"in_progress"},"2026-10-08T13:00:00.000Z");');
  assert.equal(run("item.completedAt"),"");
  assert.equal(run('state.events.some((event)=>event.itemId===item.id && event.eventType==="reopened")'),true);
});

test("remoção mantém memória e impede apagar uma hierarquia por acidente", () => {
  const run = context();run('state.currentUserId="u_luis";');
  run(`parent=createItem(${defaults});child=createItem({...${defaults},parentId:parent.id});`);
  assert.throws(()=>run('removeItem(parent.id)'),/subitens/);
  run('removeItem(child.id);');
  assert.equal(run("state.archivedItems[0].id===child.id"),true);
  assert.equal(run('state.events.some((event)=>event.itemId===child.id && event.eventType==="created")'),true);
  assert.equal(run("state.relations.some((relation)=>relation.targetId===child.id)"),false);
});

test("datas invertidas e status inválidos são rejeitados antes da criação", () => {
  const run = context();run('state.currentUserId="u_luis";');
  assert.throws(()=>run(`createItem({...${defaults},dueAt:today(-1)})`),/término/i);
  assert.throws(()=>run(`createItem({...${defaults},status:"unknown"})`),/Status/);
});
