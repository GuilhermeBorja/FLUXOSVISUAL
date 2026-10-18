import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
function context(savedState = null, seed = true) {
  const storage = new Map();
  if (savedState) storage.set("fluxosVisualState.v2",JSON.stringify(savedState));
  const sandbox = vm.createContext({console,document:{querySelector:()=>({})},localStorage:{getItem:(key)=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(source,sandbox);
  if (seed && !savedState) vm.runInContext("state=seedState();",sandbox);
  return (script) => vm.runInContext(script,sandbox);
}
const defaults = '{title:"Teste",type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:today(),dueAt:today(3)}';

test("GPO por usuário aplica escopos específicos, negação e padrão fechado", () => {
  const run = context();
  run('state.currentUserId="u_luis";testItem={...getItem("item_doors")};');
  assert.equal(run("canViewItem(currentUser(),testItem)"),true);
  assert.equal(run("canEditItem(currentUser(),testItem)"),true);
  assert.equal(run("canRemoveItem(currentUser(),testItem)"),true);
  assert.equal(run('state.users.every((user)=>!Object.hasOwn(user,"permissionLevel"))'),true);
  run('testUser={...currentUser(),id:"sem_regras"};');
  assert.equal(run("canViewItem(testUser,testItem)"),false);
  run('createPermissionRule({subjectType:"user",subjectId:"u_luis",operation:"edit_item",scopeType:"item",scopeId:testItem.id,effect:"deny"});');
  assert.equal(run("canEditItem(currentUser(),testItem)"),false);
  run('currentUser().disabled=true;');
  assert.equal(run("canViewItem(currentUser(),testItem)"),false);
});

test("dados antigos migram níveis legados para regras GPO de usuário", () => {
  const seed = context();
  const saved = JSON.parse(seed("JSON.stringify(state)"));
  saved.gpoVersion = 0;
  saved.permissionRules = [];
  const legacyLevels = {u_luis:10,u_virginia:7,u_eduardo:8,u_enrique:5,u_mateus:3,u_dmk:2};
  saved.users.forEach((user) => { user.permissionLevel = legacyLevels[user.id]; });
  const run = context(saved);
  assert.equal(run("state.gpoVersion"),1);
  assert.equal(run('state.users.every((user)=>!Object.hasOwn(user,"permissionLevel") && !Object.hasOwn(user,"legacyPermissionLevel"))'),true);
  assert.equal(run('state.permissionRules.length>0 && state.permissionRules.every((rule)=>rule.subjectType==="user")'),true);
  assert.equal(run('canEditItem(state.users.find((user)=>user.id==="u_virginia"),getItem("item_adm"))'),true);
});

test("relações só são exibidas quando ambos os itens são visíveis", () => {
  const run = context();
  run('state.currentUserId="u_enrique";');
  assert.equal(run("visibleRelations().length"),0);
  run('state.currentUserId="u_luis";state.filters.status="done";');
  assert.equal(run('visibleRelations().every((rel)=>getItem(rel.sourceId).status==="done" && getItem(rel.targetId).status==="done")'),true);
});

test("criação e edição fora das regras GPO não alteram dados", () => {
  const run = context();
  run('state.currentUserId="u_virginia";count=state.items.length;');
  assert.throws(()=>run(`createItem({...${defaults},organizationId:"org_dmk",sectorId:"sec_fornecedor"})`),/GPO/);
  assert.equal(run("state.items.length===count"),true);
  const original = run('getItem("item_doors").title');
  assert.throws(()=>run('updateItem("item_doors",{...getItem("item_doors"),title:"Inválido",organizationId:"org_dmk",sectorId:"sec_fornecedor"})'),/GPO/);
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

test("ordenação e hierarquia persistem sem alterar relações temporais", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`first=createItem({...${defaults},title:"Primeiro"});second=createItem({...${defaults},title:"Segundo"});third=createItem({...${defaults},title:"Terceiro"});temporal=createRelation(first.id,third.id,"TI");reorderItem(first.id,third.id,true);moveItemHierarchy(second.id,first.id);`);
  assert.equal(run('state.items.filter((item)=>[first.id,third.id].includes(item.id) && !item.parentId).sort((a,b)=>a.sortOrder-b.sortOrder).map((item)=>item.id).join(",")'),run('`${third.id},${first.id}`'));
  assert.equal(run("second.parentId===first.id"),true);
  assert.equal(run('temporal.sourceId===first.id && temporal.targetId===third.id && temporal.relationType==="TI"'),true);
  run('moveItemHierarchy(second.id,"");');
  assert.equal(run('second.parentId'),"");
});

test("conclusão e reabertura registram autor e data efetiva sem apagar histórico", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`item=createItem(${defaults});updateItem(item.id,{...item,status:"done",ownerId:"u_mateus"},"2026-10-08T12:00:00.000Z","Entrega revisada");`);
  assert.equal(run("item.completedAt"),"2026-10-08T12:00:00.000Z");
  assert.equal(run('state.events.some((event)=>event.itemId===item.id && event.eventType==="owner_changed" && event.effectiveAt==="2026-10-08T12:00:00.000Z" && event.userId==="u_luis")'),true);
  assert.equal(run("item.progressPercent"),100);
  assert.throws(()=>run('updateItem(item.id,{...item,status:"in_progress"},"2026-10-08T13:00:00.000Z");'),/novo percentual/);
  run('updateItem(item.id,{...item,status:"in_progress",progressPercent:35},"2026-10-08T13:00:00.000Z");');
  assert.equal(run("item.progressPercent"),35);
  assert.equal(run("item.completedAt"),"");
  assert.equal(run('state.events.some((event)=>event.itemId===item.id && event.eventType==="reopened")'),true);
});

test("percentual é opcional, preservado em edições e conclusão bloqueia datas previstas", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`item=createItem(${defaults});`);
  assert.equal(run("item.progressPercent"),0);
  run('updateItem(item.id,{...item,title:"Atualizado"},"2026-10-08T12:00:00.000Z");');
  assert.equal(run("item.progressPercent"),0);
  run('updateItem(item.id,{...item,progressPercent:42},"2026-10-08T12:30:00.000Z");');
  assert.equal(run("item.progressPercent"),42);
  run('updateItem(item.id,{...item,status:"done"},"2026-10-08T13:00:00.000Z");');
  assert.equal(run("item.progressPercent"),100);
  assert.equal(run("item.completedAt"),"2026-10-08T13:00:00.000Z");
  assert.throws(()=>run('updateItem(item.id,{...item,dueAt:today(8)},"2026-10-08T14:00:00.000Z");'),/bloqueadas/);
});

test("grupo herda o status menos avançado, o intervalo total e o progresso dos descendentes", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`parent=createItem({...${defaults},title:"Grupo",plannedStartAt:today(),dueAt:today(1)});first=createItem({...${defaults},parentId:parent.id,status:"in_progress",progressPercent:60,weight:1,plannedStartAt:today(),dueAt:today(4)});second=createItem({...${defaults},parentId:parent.id,status:"ready",progressPercent:20,weight:3,plannedStartAt:today(2),dueAt:today(9)});`);
  assert.equal(run("parent.status"),"ready");
  assert.equal(run("parent.plannedStartAt"),run("first.plannedStartAt"));
  assert.equal(run("parent.dueAt"),run("second.dueAt"));
  assert.equal(run("parent.progressPercent"),30);
  assert.throws(()=>run('updateItem(parent.id,{...parent,status:"done"})'),/herdados dos subitens/);
});

test("duração da atividade dependente começa na liberação da predecessora TI", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`first=createItem(${defaults});second=createItem(${defaults});first.createdAt="2026-10-01T12:00:00.000Z";first.completedAt="2026-10-08T12:00:00.000Z";first.status="done";second.createdAt="2026-10-01T12:00:00.000Z";second.actualStartAt="2026-10-09T12:00:00.000Z";createRelation(first.id,second.id,"TI");`);
  assert.equal(run("activityStartAt(second)"),"2026-10-08T12:00:00.000Z");
  assert.equal(run('activityDurationMinutes(second,"2026-10-10T12:00:00.000Z")'),2880);
  assert.equal(run('activityStartAt(first)'),"2026-10-01T12:00:00.000Z");
});

test("reprovação registra decisão e cria revisão ligada sem status rejeitado", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run(`item=createItem({...${defaults},title:"Aprovação",type:"approval",ownerId:"u_luis"});item.approvalReviewerId="u_luis";predecessor=createItem(${defaults});createRelation(predecessor.id,item.id,"TI");updateItem(predecessor.id,{...predecessor,status:"done"});submitApprovalForReview(item.id,"Validar entrega");decision=decideApproval(item.id,"rejected","Ajustar documentação","u_luis");revision=getItem(item.supersededBy);`);
  assert.equal(run('item.status'),"cancelled");
  assert.equal(run('state.approvalDecisions.some((entry)=>entry.id===decision.id && entry.outcome==="rejected")'),true);
  assert.equal(run('revision.revisionOf===item.id && revision.status==="correction"'),true);
  assert.equal(run('state.relations.some((relation)=>relation.sourceId===predecessor.id && relation.targetId===revision.id)'),true);
  assert.equal(run('statusCatalog.some((status)=>status.id==="rejected")'),false);
});

test("anexos têm histórico e a exclusão respeita GPO", () => {
  const run = context();
  run('state.currentUserId="u_luis";state.attachments.push({id:"attachment_test",itemId:"item_doors",name:"evidencia.pdf",type:"application/pdf",size:8,dataUrl:"data:application/pdf;base64,MTIzNDU2Nzg=",createdBy:"u_luis",createdAt:nowIso()});removeAttachment("attachment_test");');
  assert.equal(run('state.attachments.some((entry)=>entry.id==="attachment_test")'),false);
  assert.equal(run('state.archivedAttachments.some((entry)=>entry.id==="attachment_test" && !!entry.deletedAt)'),true);
  assert.equal(run('state.events.some((entry)=>entry.itemId==="item_doors" && entry.eventType==="attachment_removed")'),true);
  run('state.users.push({id:"u_unauthorized",name:"Sem regra",organizationId:"org_castro",state:"PE"});state.currentUserId="u_unauthorized";state.attachments.push({id:"attachment_denied",itemId:"item_doors",name:"privado.pdf",type:"application/pdf",size:4,dataUrl:"data:application/pdf;base64,MTIzNA==",createdBy:"u_luis",createdAt:nowIso()});');
  assert.throws(()=>run('removeAttachment("attachment_denied")'),/GPO/);
  assert.equal(run('state.attachments.some((entry)=>entry.id==="attachment_denied")'),true);
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

test("cronograma recalcula datas a partir da duração e das relações, preservando a baseline", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...' + defaults + ',title:"Contratar fornecedor de gesso",plannedStartAt:"2026-10-25",dueAt:"2026-10-25",plannedDurationDays:0});' +
      'a=createItem({...' + defaults + ',title:"Mapear fornecedor",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-28",plannedDurationDays:3});' +
      'b=createItem({...' + defaults + ',title:"Elaborar escopo",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-27",plannedDurationDays:2});' +
      'c=createItem({...' + defaults + ',title:"Equalizar",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-28",plannedDurationDays:3});' +
      'd=createItem({...' + defaults + ',title:"Obter aprovação",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-26",plannedDurationDays:1});' +
      'e=createItem({...' + defaults + ',title:"Contratar",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-25",plannedDurationDays:0});' +
      'createRelation(a.id,b.id,"TI"); createRelation(b.id,c.id,"TI"); createRelation(c.id,d.id,"TI"); createRelation(d.id,e.id,"TI");');
  assert.equal(run("a.plannedStartAt"),"2026-10-25");
  assert.equal(run("b.plannedStartAt"),"2026-10-28");
  assert.equal(run("c.plannedStartAt"),"2026-10-30");
  assert.equal(run("d.plannedStartAt"),"2026-11-02");
  assert.equal(run("e.plannedStartAt"),"2026-11-03");
  assert.equal(run("e.dueAt"),"2026-11-03");
  assert.equal(run("a.baselineStartAt"),"2026-10-25");
  assert.equal(run("a.baselineDueAt"),"2026-10-28");
});

test("repactuação desloca previsão dos descendentes sem alterar a baseline original", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...' + defaults + ',title:"Grupo",plannedStartAt:"2026-10-25",dueAt:"2026-10-25"});' +
      'a=createItem({...' + defaults + ',title:"Atividade",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-28",plannedDurationDays:3});' +
      'updateItem(root.id,{...root,replannedDueAt:"2026-10-31"});');
  assert.equal(run("a.plannedStartAt"),"2026-10-28");
  assert.equal(run("a.dueAt"),"2026-10-31");
  assert.equal(run("a.baselineStartAt"),"2026-10-25");
  assert.equal(run("a.baselineDueAt"),"2026-10-28");
});
test("instalação nova inicia sem organização, usuários operacionais ou itens", () => {
  const run = context(null,false);
  assert.equal(run("state.setupComplete"),false);
  assert.equal(run("state.organizations.length"),0);
  assert.equal(run("state.sectors.length"),0);
  assert.equal(run("state.items.length"),0);
  assert.equal(run("state.users.length"),0);
});
test("relação CONTÉM é mantida com todos os ancestrais ao mover subitens", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...' + defaults + ',title:"Raiz"});' +
      'parent=createItem({...' + defaults + ',title:"Pai",parentId:root.id});' +
      'child=createItem({...' + defaults + ',title:"Filho",parentId:parent.id});' +
      'other=createItem({...' + defaults + ',title:"Outro pai"});');
  assert.equal(run('state.relations.some((r)=>r.sourceId===root.id && r.targetId===child.id && r.relationType==="contains")'),true);
  assert.equal(run('state.relations.some((r)=>r.sourceId===parent.id && r.targetId===child.id && r.relationType==="contains")'),true);
  run('moveItemHierarchy(child.id,other.id);');
  assert.equal(run('state.relations.some((r)=>r.sourceId===root.id && r.targetId===child.id && r.relationType==="contains")'),false);
  assert.equal(run('state.relations.some((r)=>r.sourceId===parent.id && r.targetId===child.id && r.relationType==="contains")'),false);
  assert.equal(run('state.relations.some((r)=>r.sourceId===other.id && r.targetId===child.id && r.relationType==="contains")'),true);
});
test("perfil GPO é herdado e regra individual prevalece como exceção", () => {
  const run=context(); run('state.currentUserId="u_luis";');
  run('state.permissionProfiles.push({id:"profile_test",name:"Teste"}); state.users.find((user)=>user.id==="u_virginia").profileId="profile_test"; state.permissionRules=state.permissionRules.filter((rule)=>rule.subjectId!=="u_virginia");');
  run('createPermissionRule({subjectType:"profile",subjectId:"profile_test",operation:"view_item",scopeType:"global",scopeId:"",effect:"deny"});');
  assert.equal(run('gpoDecision(state.users.find((user)=>user.id==="u_virginia"),"view_item",getItem("item_doors"))'),false);
  run('createPermissionRule({subjectType:"user",subjectId:"u_virginia",operation:"view_item",scopeType:"global",scopeId:"",effect:"allow"});');
  assert.equal(run('gpoDecision(state.users.find((user)=>user.id==="u_virginia"),"view_item",getItem("item_doors"))'),true);
});
test("status Liberado para execução é calculado pela liberação das predecessoras", () => {
  const run=context(); run('state.currentUserId="u_luis";');
  run('a=createItem({...' + defaults + ',title:"Predecessora"}); b=createItem({...' + defaults + ',title:"Sucessora"}); createRelation(a.id,b.id,"TI");');
  assert.equal(run("a.status"),"ready");
  assert.equal(run("b.status"),"backlog");
  run('updateItem(a.id,{...a,status:"done",progressPercent:100});');
  assert.equal(run("b.status"),"ready");
});

test("arquivar e restaurar um pai preserva e alterna a visibilidade dos descendentes", () => {
  const run=context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...' + defaults + ',title:"Raiz"}); child=createItem({...' + defaults + ',title:"Filho",parentId:root.id});');
  run('archiveItem(root.id);');
  assert.equal(run("getItem(root.id).archivedAt !== \"\""),true);
  assert.equal(run("getItem(child.id).archivedAt !== \"\""),true);
  assert.equal(run('visibleItems().some((item)=>item.id===root.id || item.id===child.id)'),false);
  run('restoreArchivedItem(root.id);');
  assert.equal(run("getItem(root.id).archivedAt || \"\""),"");
  assert.equal(run("getItem(child.id).archivedAt || \"\""),"");
});