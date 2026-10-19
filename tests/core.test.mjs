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

test("mover uma subárvore atualiza a contenção de todos os descendentes", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`rootA=createItem({...${defaults},title:"Raiz A"});rootB=createItem({...${defaults},title:"Raiz B"});child=createItem({...${defaults},title:"Filho",parentId:rootA.id});grandchild=createItem({...${defaults},title:"Neto",parentId:child.id});moveItemHierarchy(child.id,rootB.id);`);
  assert.equal(run('state.relations.some((r)=>r.relationType==="contains" && r.sourceId===rootB.id && r.targetId===grandchild.id)'),true);
  assert.equal(run('state.relations.some((r)=>r.relationType==="contains" && r.sourceId===rootA.id && r.targetId===grandchild.id)'),false);
  assert.equal(run('state.relations.filter((r)=>r.relationType==="contains" && r.targetId===grandchild.id).length'),2);
});


test("previsão temporal respeita TI, II, TT, IF e não antecipa o início baseline", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`pairs=["TI","II","TT","IF"].map((type,index)=>{const source=createItem({...${defaults},title:"Origem "+type,plannedStartAt:"2026-01-01",dueAt:"2026-01-05",plannedDurationDays:4});const target=createItem({...${defaults},title:"Destino "+type,plannedStartAt:"2026-01-01",dueAt:"2026-01-03",plannedDurationDays:2});return {type,source,target};});state.relations=state.relations.filter((r)=>r.relationType==="contains");pairs.forEach((p)=>state.relations.push({id:uid("rel"),sourceId:p.source.id,targetId:p.target.id,relationType:p.type,lagDays:1,description:"teste"}));result=recalculatePlannedDates();`);
  assert.equal(run("result.valid"),true);
  assert.equal(run('getItem(pairs.find((p)=>p.type==="TI").target.id).plannedStartAt'),"2026-01-06");
  assert.equal(run('getItem(pairs.find((p)=>p.type==="II").target.id).plannedStartAt'),"2026-01-02");
  assert.equal(run('getItem(pairs.find((p)=>p.type==="TT").target.id).plannedStartAt'),"2026-01-04");
  assert.equal(run('getItem(pairs.find((p)=>p.type==="IF").target.id).plannedStartAt'),"2026-01-01");
});


test("edição é revertida integralmente quando o cronograma detecta ciclo", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`first=createItem({...${defaults},title:"Original A"});second=createItem({...${defaults},title:"Original B"});state.relations.push({id:uid("rel"),sourceId:first.id,targetId:second.id,relationType:"TI",lagDays:0},{id:uid("rel"),sourceId:second.id,targetId:first.id,relationType:"TI",lagDays:0});oldTitle=first.title;oldEvents=state.events.length;`);
  assert.throws(() => run('updateItem(first.id,{...first,title:"Não deve persistir"},nowIso());'),/ciclo nas dependências temporais/);
  assert.equal(run("getItem(first.id).title"),"Original A");
  assert.equal(run("state.events.length"),run("oldEvents"));
});


test("editar relação preserva o ID e registra a alteração", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`a=createItem({...${defaults},title:"Origem"});b=createItem({...${defaults},title:"Destino B"});c=createItem({...${defaults},title:"Destino C"});rel=createRelation(a.id,b.id,"TI",0,"Inicial");relId=rel.id;updateRelation(rel.id,{sourceId:a.id,targetId:c.id,relationType:"TT",lagDays:2,description:"Atualizada"});`);
  assert.equal(run("state.relations.some((r)=>r.id===relId && r.targetId===c.id && r.relationType===\"TT\" && r.lagDays===2 && r.description===\"Atualizada\")"),true);
  assert.equal(run('state.events.some((e)=>e.eventType==="relation_updated" && e.itemId===b.id)'),true);
});

test("transformar um item em aprovação preserva identidade, relações e histórico", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`a=createItem({...${defaults},title:"Atividade"});b=createItem({...${defaults},title:"Dependente"});rel=createRelation(a.id,b.id,"TI");beforeEvents=state.events.length;updateItem(a.id,{...a,type:"approval"},nowIso(),"Transformado em aprovação");`);
  assert.equal(run('getItem(a.id).type'),"approval");
  assert.equal(run("getItem(a.id).id"),run("a.id"));
  assert.equal(run("state.relations.some((r)=>r.id===rel.id && r.sourceId===a.id && r.targetId===b.id)"),true);
  assert.equal(run('state.events.some((e)=>e.itemId===a.id && e.eventType==="type_changed" && e.toValue==="approval")'),true);
});


test("liberação automática considera todas as predecessoras e bloqueios", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`doneA=createItem({...${defaults},title:"Predecessora concluída",status:"done",progressPercent:100});pendingB=createItem({...${defaults},title:"Predecessora pendente",status:"backlog"});target=createItem({...${defaults},title:"Destino",status:"backlog"});blocker=createItem({...${defaults},title:"Bloqueio",status:"blocked"});state.relations.push({id:uid("rel"),sourceId:doneA.id,targetId:target.id,relationType:"TI",lagDays:0},{id:uid("rel"),sourceId:pendingB.id,targetId:target.id,relationType:"TI",lagDays:0},{id:uid("rel"),sourceId:blocker.id,targetId:target.id,relationType:"blocks",lagDays:0});recalculatePlannedDates();`);
  assert.equal(run('getItem(target.id).status'),"backlog");
  run('pendingB.status="done";pendingB.progressPercent=100;recalculatePlannedDates();');
  assert.equal(run('getItem(target.id).status'),"backlog");
  run('blocker.status="done";blocker.progressPercent=100;recalculatePlannedDates();');
  assert.equal(run('getItem(target.id).status'),"ready");
});


test("cancelamento define controle em 100% sem marcar conclusão operacional", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`item=createItem({...${defaults},title:"Cancelamento",progressPercent:25});updateItem(item.id,{...item,status:"cancelled"},nowIso(),"Escopo cancelado");`);
  assert.equal(run('getItem(item.id).status'),"cancelled");
  assert.equal(run('getItem(item.id).progressPercent'),100);
  assert.equal(run('completeStatus(getItem(item.id).status)'),false);
  assert.equal(run('getItem(item.id).completedAt'),"");
});


test("mover hierarquia reverte integralmente quando a validação temporal falha", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`parentA=createItem({...${defaults},title:"Pai original"});
parentB=createItem({...${defaults},title:"Novo pai"});
child=createItem({...${defaults},title:"Filho",parentId:parentA.id});
a=createItem({...${defaults},title:"Temporal A"});
b=createItem({...${defaults},title:"Temporal B"});
state.relations.push(
  {id:uid("rel"),sourceId:a.id,targetId:b.id,relationType:"TI",lagDays:0},
  {id:uid("rel"),sourceId:b.id,targetId:a.id,relationType:"TI",lagDays:0}
);
beforeEvents=state.events.length;
beforeRelations=JSON.stringify(state.relations);
`);
  assert.throws(() => run("moveItemHierarchy(child.id,parentB.id)"), /ciclo nas dependências temporais/);
  assert.equal(run("getItem(child.id).parentId"), run("parentA.id"));
  assert.equal(run('state.relations.some((r)=>r.relationType==="contains" && r.sourceId===parentA.id && r.targetId===child.id)'), true);
  assert.equal(run('state.relations.some((r)=>r.relationType==="contains" && r.sourceId===parentB.id && r.targetId===child.id)'), false);
  assert.equal(run("state.events.length"), run("beforeEvents"));
  assert.equal(run("JSON.stringify(state.relations)"), run("beforeRelations"));
});


test("criação de item reverte item, relações e eventos se o cronograma for inválido", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`a=createItem({...${defaults},title:"Temporal A"});
b=createItem({...${defaults},title:"Temporal B"});
state.relations.push(
  {id:uid("rel"),sourceId:a.id,targetId:b.id,relationType:"TI",lagDays:0},
  {id:uid("rel"),sourceId:b.id,targetId:a.id,relationType:"TI",lagDays:0}
);
beforeItems=state.items.length;
beforeRelations=JSON.stringify(state.relations);
beforeEvents=state.events.length;
`);
  assert.throws(() => run(`createItem({...${defaults},title:"Não deve persistir"})`), /ciclo nas dependências temporais/);
  assert.equal(run("state.items.length"), run("beforeItems"));
  assert.equal(run("JSON.stringify(state.relations)"), run("beforeRelations"));
  assert.equal(run("state.events.length"), run("beforeEvents"));
  assert.equal(run('state.items.some((item)=>item.title==="Não deve persistir")'), false);
});


test("falha ao criar relação CONTÉM preserva o pai anterior do item", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`parent=createItem({...${defaults},title:"Pai"});
child=createItem({...${defaults},title:"Filho",parentId:parent.id});
state.relations=state.relations.filter((r)=>!(r.relationType==="contains" && r.sourceId===parent.id && r.targetId===child.id));
a=createItem({...${defaults},title:"Temporal A"});
b=createItem({...${defaults},title:"Temporal B"});
state.relations.push(
  {id:uid("rel"),sourceId:a.id,targetId:b.id,relationType:"TI",lagDays:0},
  {id:uid("rel"),sourceId:b.id,targetId:a.id,relationType:"TI",lagDays:0}
);
beforeRelations=state.relations.length;
`);
  assert.throws(() => run('createRelation(parent.id,child.id,"contains")'), /ciclo nas dependências temporais/);
  assert.equal(run("getItem(child.id).parentId"), run("parent.id"));
  assert.equal(run("state.relations.length"), run("beforeRelations"));
  assert.equal(run('state.relations.some((r)=>r.relationType==="contains" && r.sourceId===parent.id && r.targetId===child.id)'), false);
});


test("P0: progresso ponderado usa apenas folhas e não conta grupos duas vezes", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...'+defaults+',title:"Projeto",type:"project"});group=createItem({...'+defaults+',title:"Grupo",parentId:root.id,type:"stage"});a=createItem({...'+defaults+',title:"Atividade A",parentId:group.id,status:"in_progress",progressPercent:50,weight:2});b=createItem({...'+defaults+',title:"Atividade B",parentId:group.id,status:"done",progressPercent:100,weight:1});syncParentSummary(group.id);syncParentSummary(root.id);');
  assert.equal(run("group.progressPercent"),67);
  assert.equal(run("root.progressPercent"),67);
});

test("P0: grupo sem nenhum peso válido não inventa percentual de avanço", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...'+defaults+',title:"Projeto",type:"project"});leaf=createItem({...'+defaults+',title:"Atividade",parentId:root.id,status:"in_progress",progressPercent:80,weight:1});leaf.weight=0;syncParentSummary(root.id);');
  assert.equal(run("root.progressPercent"),null);
});

test("P0: template preserva subitens, pesos, durações e relações temporais internas", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...'+defaults+',title:"Fluxo base",type:"project",plannedStartAt:"2026-10-25",dueAt:"2026-10-25",plannedDurationDays:0});a=createItem({...'+defaults+',title:"Etapa A",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-28",plannedDurationDays:3,weight:2});b=createItem({...'+defaults+',title:"Etapa B",parentId:root.id,plannedStartAt:"2026-10-28",dueAt:"2026-10-30",plannedDurationDays:2,weight:3});createRelation(a.id,b.id,"TI",1);template=saveFlowTemplate(root.id,"Modelo P0");result=applyFlowTemplate(template.id,{organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",title:"Instância P0",startDate:"2026-11-01"});');
  assert.equal(run("result.items.length"),3);
  assert.equal(run("result.items[1].weight"),2);
  assert.equal(run("result.items[1].plannedDurationDays"),3);
  assert.equal(run("result.items[2].weight"),3);
  assert.equal(run('state.relations.some((r)=>r.sourceId===result.items[1].id && r.targetId===result.items[2].id && r.relationType==="TI" && r.lagDays===1)'),true);
  assert.equal(run('state.relations.some((r)=>r.sourceId===result.items[0].id && r.targetId===result.items[1].id && r.relationType==="contains")'),true);
});

test("P0: falha ao aplicar template reverte integralmente itens, relações e eventos", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...'+defaults+',title:"Fluxo base",type:"project"});child=createItem({...'+defaults+',title:"Etapa",parentId:root.id});template=saveFlowTemplate(root.id,"Modelo rollback");template.relations.push({sourceKey:"missing-key",targetKey:template.items[1].key,relationType:"TI",lagDays:0});before=JSON.stringify(state);');
  assert.throws(() => run('applyFlowTemplate(template.id,{organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",title:"Instância inválida",startDate:today()})'),/perdeu sua referência/);
  assert.equal(run("JSON.stringify(state)===before"),true);
});

test("P0: término baseline é capturado quando calculado pela duração inicial", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('item=createItem({...' + defaults + ',title:"Duração sem término informado",plannedStartAt:"2026-10-25",dueAt:"",plannedDurationDays:3});');
  assert.equal(run('item.dueAt'),"2026-10-28");
  assert.equal(run('item.baselineDueAt'),"2026-10-28");
  run('recalculatePlannedDates();');
  assert.equal(run('item.baselineDueAt'),"2026-10-28");
});

test("P0: predecessora cancelada não desloca a previsão da atividade ativa", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('cancelled=createItem({...' + defaults + ',title:"Atividade cancelada",status:"cancelled",progressPercent:100,plannedStartAt:"2026-10-01",dueAt:"2027-01-09",plannedDurationDays:100});active=createItem({...' + defaults + ',title:"Atividade ativa",status:"backlog",plannedStartAt:"2026-10-01",dueAt:"2026-10-03",plannedDurationDays:2});createRelation(cancelled.id,active.id,"TI",0);recalculatePlannedDates();');
  assert.equal(run('active.plannedStartAt'),"2026-10-01");
  assert.equal(run('active.dueAt'),"2026-10-03");
});

test("P0: arquivar e restaurar subárvore preserva relações CONTÉM e temporais", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...' + defaults + ',title:"Raiz",type:"project"});parent=createItem({...' + defaults + ',title:"Pai",parentId:root.id});child=createItem({...' + defaults + ',title:"Filho",parentId:parent.id});external=createItem({...' + defaults + ',title:"Externo"});createRelation(child.id,external.id,"TI",1);relationIds=state.relations.map((r)=>r.id).sort().join(",");archiveItem(parent.id);');
  assert.equal(run('getItem(parent.id).archivedAt!=="" && getItem(child.id).archivedAt!==""'),true);
  assert.equal(run('state.relations.map((r)=>r.id).sort().join(",")===relationIds'),true);
  run('restoreArchivedItem(parent.id);');
  assert.equal(run('getItem(parent.id).archivedAt'),"");
  assert.equal(run('getItem(child.id).archivedAt'),"");
  assert.equal(run('state.relations.map((r)=>r.id).sort().join(",")===relationIds'),true);
  assert.equal(run('state.relations.every((r)=>!!getItem(r.sourceId) && !!getItem(r.targetId))'),true);
});

test("P0: negação GPO em repactuação reverte edição parcial e eventos", () => {
  const run = context(); run('state.currentUserId="u_luis";item=createItem({...' + defaults + ',title:"Original",plannedStartAt:"2026-10-25",dueAt:"2026-10-28",plannedDurationDays:3});createPermissionRule({subjectType:"user",subjectId:"u_luis",operation:"change_duration",scopeType:"item",scopeId:item.id,effect:"deny"});before=JSON.stringify({item:getItem(item.id),events:state.events});');
  assert.throws(() => run('updateItem(item.id,{...item,title:"Alterado",replannedDueAt:"2026-11-01"},nowIso())'),/GPO/);
  assert.equal(run('getItem(item.id).title'),"Original");
  assert.equal(run('getItem(item.id).replannedDueAt'),"");
  assert.equal(run('JSON.stringify({item:getItem(item.id),events:state.events})===before'),true);
});

test("P0: editar item pai registra nome e responsável e repactua a previsão sem alterar baseline", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('root=createItem({...' + defaults + ',title:"Pai original",type:"project",plannedStartAt:"2026-10-25",dueAt:"2026-10-25",plannedDurationDays:0});child=createItem({...' + defaults + ',title:"Filho",parentId:root.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-28",plannedDurationDays:3});updateItem(root.id,{...root,title:"Pai repactuado",ownerId:"u_mateus",replannedDueAt:"2026-10-31"});');
  assert.equal(run('root.title'),"Pai repactuado");
  assert.equal(run('root.ownerId'),"u_mateus");
  assert.equal(run('child.dueAt'),"2026-10-31");
  assert.equal(run('child.baselineStartAt'),"2026-10-25");
  assert.equal(run('child.baselineDueAt'),"2026-10-28");
  assert.equal(run('state.events.some((e)=>e.itemId===root.id && e.eventType==="title_changed")'),true);
  assert.equal(run('state.events.some((e)=>e.itemId===root.id && e.eventType==="owner_changed")'),true);
  assert.equal(run('state.events.some((e)=>e.itemId===root.id && e.eventType==="replanned_due_changed")'),true);
});

test("P0: reabrir aprovação inicia nova rodada e preserva a decisão anterior", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('approval=createItem({...' + defaults + ',title:"Aprovação",type:"approval",status:"done",ownerId:"u_luis",progressPercent:100});approval.approvalReviewerId="u_luis";approval.approvalRound=1;approval.lastDecisionId="decision_previous";decision=reopenApproval(approval.id,"Revisar evidência",50);');
  assert.equal(run('approval.status'),"backlog");
  assert.equal(run('approval.progressPercent'),50);
  assert.equal(run('approval.approvalRound'),2);
  assert.equal(run('decision.kind'),"reopened");
  assert.equal(run('decision.reason'),"Revisar evidência");
  assert.equal(run('decision.previousDecisionId'),"decision_previous");
  assert.equal(run('decision.createdBy'),"u_luis");
  assert.equal(run('state.approvalDecisions.some((d)=>d.id===decision.id && d.round===2)'),true);
});


test("P0 integrado: mover subárvore, editar dependência e arquivar/restaurar preserva baseline e integridade do grafo", () => {
  const run = context(); run('state.currentUserId="u_luis";');
  run('rootA=createItem({...'+defaults+',title:"Projeto A",type:"project"});rootB=createItem({...'+defaults+',title:"Projeto B",type:"project"});parent=createItem({...'+defaults+',title:"Pai",parentId:rootA.id});child=createItem({...'+defaults+',title:"Filho",parentId:parent.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-28",plannedDurationDays:3});grandchild=createItem({...'+defaults+',title:"Neto",parentId:child.id,plannedStartAt:"2026-10-25",dueAt:"2026-10-27",plannedDurationDays:2});external=createItem({...'+defaults+',title:"Dependente",plannedStartAt:"2026-10-28",dueAt:"2026-10-30",plannedDurationDays:2});temporal=createRelation(grandchild.id,external.id,"TI",1,"Dependência integrada");baseline=JSON.stringify([child.baselineStartAt,child.baselineDueAt,grandchild.baselineStartAt,grandchild.baselineDueAt]);');
  run('moveItemHierarchy(parent.id,rootB.id);');
  assert.equal(run('getItem(parent.id).parentId'),run('rootB.id'));
  assert.equal(run('state.relations.some((r)=>r.sourceId===rootB.id && r.targetId===parent.id && r.relationType==="contains")'),true);
  assert.equal(run('state.relations.some((r)=>r.sourceId===rootA.id && r.targetId===parent.id && r.relationType==="contains")'),false);
  assert.equal(run('state.relations.some((r)=>r.sourceId===rootB.id && r.targetId===grandchild.id && r.relationType==="contains")'),true);
  assert.equal(run('state.relations.some((r)=>r.id===temporal.id && r.sourceId===grandchild.id && r.targetId===external.id && r.relationType==="TI")'),true);

  run('updateRelation(temporal.id,{sourceId:grandchild.id,targetId:external.id,relationType:"TT",lagDays:2,description:"Dependência revisada"});');
  assert.equal(run('state.relations.filter((r)=>r.id===temporal.id).length'),1);
  assert.equal(run('temporal.id'),run('state.relations.find((r)=>r.id===temporal.id).id'));
  assert.equal(run('state.relations.find((r)=>r.id===temporal.id).relationType'),"TT");
  assert.equal(run('state.relations.find((r)=>r.id===temporal.id).lagDays'),2);
  assert.equal(run('JSON.stringify([child.baselineStartAt,child.baselineDueAt,grandchild.baselineStartAt,grandchild.baselineDueAt])'),run('baseline'));

  run('relationIds=state.relations.map((r)=>r.id).sort().join(",");archiveItem(rootB.id);');
  assert.equal(run('getItem(rootB.id).archivedAt!=="" && getItem(parent.id).archivedAt!=="" && getItem(child.id).archivedAt!=="" && getItem(grandchild.id).archivedAt!==""'),true);
  assert.equal(run('state.relations.map((r)=>r.id).sort().join(",")===relationIds'),true);
  run('restoreArchivedItem(rootB.id);');
  assert.equal(run('getItem(rootB.id).archivedAt==="" && getItem(parent.id).archivedAt==="" && getItem(child.id).archivedAt==="" && getItem(grandchild.id).archivedAt===""'),true);
  assert.equal(run('state.relations.map((r)=>r.id).sort().join(",")===relationIds'),true);
  assert.equal(run('state.relations.every((r)=>!!getItem(r.sourceId) && !!getItem(r.targetId))'),true);
  assert.equal(run('JSON.stringify([child.baselineStartAt,child.baselineDueAt,grandchild.baselineStartAt,grandchild.baselineDueAt])'),run('baseline'));
});


test("P0 GPO: precedência de escopo e exceção individual é determinística e nega sem mutação", () => {
  const run = context();
  run('state.currentUserId="u_luis";state.permissionProfiles.push({id:"profile_test",name:"Perfil de teste"});currentUser().profileId="profile_test";item=getItem("item_doors");originalTitle=item.title;');
  run('createPermissionRule({subjectType:"profile",subjectId:"profile_test",operation:"edit_item",scopeType:"global",scopeId:"",effect:"deny"});');
  run('createPermissionRule({subjectType:"profile",subjectId:"profile_test",operation:"edit_item",scopeType:"organization",scopeId:item.organizationId,effect:"allow"});');
  run('createPermissionRule({subjectType:"profile",subjectId:"profile_test",operation:"edit_item",scopeType:"sector",scopeId:item.sectorId,effect:"deny"});');
  run('createPermissionRule({subjectType:"profile",subjectId:"profile_test",operation:"edit_item",scopeType:"item",scopeId:item.id,effect:"allow"});');
  assert.equal(run('canEditItem(currentUser(),item)'),true,"escopo do item deve prevalecer sobre setor, organização e global");
  run('createPermissionRule({subjectType:"user",subjectId:"u_luis",operation:"edit_item",scopeType:"item",scopeId:item.id,effect:"deny"});');
  assert.equal(run('canEditItem(currentUser(),item)'),false,"regra individual no mesmo escopo deve prevalecer sobre perfil");
  assert.throws(() => run('updateItem(item.id,{...item,title:"Mutação negada"},nowIso())'),/GPO/);
  assert.equal(run('getItem(item.id).title'),run("originalTitle"));
});

test("R2-26: trocar o responsável (inclusive em lote) rederiva empresa, setor e UF do novo responsável", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  const before = JSON.parse(run('JSON.stringify((({ownerId,organizationId,sectorId,state:s})=>({ownerId,organizationId,sectorId,state:s}))(getItem("item_doors")))'));
  assert.deepEqual(before, { ownerId: "u_luis", organizationId: "org_castro", sectorId: "sec_pmo", state: "PE" });
  // Mesma forma do applyBulkEdit: {...item, ownerId} carrega o contexto do responsável antigo.
  run('state.users.find((entry)=>entry.id==="u_dmk").state="BA";');
  run('updateItem("item_doors",{...getItem("item_doors"),ownerId:"u_dmk"});');
  const after = JSON.parse(run('JSON.stringify((({ownerId,organizationId,sectorId,state:s})=>({ownerId,organizationId,sectorId,state:s}))(getItem("item_doors")))'));
  assert.deepEqual(after, { ownerId: "u_dmk", organizationId: "org_dmk", sectorId: "sec_fornecedor", state: "BA" });
  assert.equal(run('state.events.some((entry)=>entry.itemId==="item_doors" && entry.eventType==="owner_changed")'), true);
  assert.equal(run('state.events.some((entry)=>entry.itemId==="item_doors" && entry.eventType==="context_changed")'), true);
  // Sem troca de responsável, o contexto informado continua valendo.
  run('updateItem("item_doors",{...getItem("item_doors"),title:"Portas revisadas"});');
  assert.equal(run('getItem("item_doors").organizationId'), "org_dmk");
});

test("M-05: Bloqueado é indicador independente do status; atraso e risco continuam derivados", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  // O catálogo operacional não oferece mais "blocked"; o id legado segue legível no histórico.
  assert.equal(run('statusCatalog.some((status)=>status.id==="blocked")'), false);
  assert.equal(run('labelOf(statusCatalog,"blocked")'), "Bloqueado");
  const id = run('state.items.find((entry)=>entry.id==="item_adm_interview" && !state.items.some((child)=>child.parentId===entry.id)).id');
  const statusBefore = run(`getItem("${id}").status`);
  // Sinalizar exige motivo e preserva o status operacional.
  assert.throws(() => run(`updateItem("${id}",{...getItem("${id}"),blocked:true,blockedReason:" "})`), /motivo do bloqueio/);
  run(`updateItem("${id}",{...getItem("${id}"),blocked:true,blockedReason:"Aguardando laudo"})`);
  assert.equal(run(`getItem("${id}").status`), statusBefore);
  assert.equal(run(`isBlocked(getItem("${id}"))`), true);
  assert.equal(run(`signalOf(getItem("${id}"))`), "red");
  assert.equal(run(`isAtRisk(getItem("${id}"))`), false);
  assert.equal(run(`state.events.filter((entry)=>entry.itemId==="${id}" && entry.eventType==="blocked_set").length`), 1);
  // Reenviar o mesmo item (como faz a edição em lote) não gera evento novo.
  run(`updateItem("${id}",{...getItem("${id}")})`);
  assert.equal(run(`state.events.filter((entry)=>entry.itemId==="${id}" && entry.eventType==="blocked_set").length`), 1);
  // Trocar o motivo é registrado à parte; remover o bloqueio não muda o status.
  run(`updateItem("${id}",{...getItem("${id}"),blockedReason:"Laudo entregue, falta ART"})`);
  assert.equal(run(`state.events.some((entry)=>entry.itemId==="${id}" && entry.eventType==="blocked_reason_changed")`), true);
  run(`updateItem("${id}",{...getItem("${id}"),blocked:false})`);
  assert.equal(run(`isBlocked(getItem("${id}"))`), false);
  assert.equal(run(`getItem("${id}").status`), statusBefore);
  assert.equal(run(`state.events.some((entry)=>entry.itemId==="${id}" && entry.eventType==="blocked_cleared")`), true);
  // Concluir um item bloqueado encerra o indicador, com evento.
  run(`updateItem("${id}",{...getItem("${id}"),blocked:true,blockedReason:"Motivo"})`);
  run(`updateItem("${id}",{...getItem("${id}"),status:"done",progressPercent:100})`);
  assert.equal(run(`getItem("${id}").blocked`), false);
  assert.equal(run(`state.events.filter((entry)=>entry.itemId==="${id}" && entry.eventType==="blocked_cleared").length`), 2);
});

test("M-05: entrada legada com status blocked vira indicador sem inventar progresso", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run(`legacyBlocked=createItem({...${defaults},title:"Legado bloqueado",status:"blocked"});`);
  assert.equal(run("legacyBlocked.status"), "waiting");
  assert.equal(run("legacyBlocked.blocked"), true);
  assert.equal(run("legacyBlocked.blockedReason"), "Migrado do status Bloqueado");
  assert.equal(run('state.events.some((entry)=>entry.itemId===legacyBlocked.id && entry.eventType==="blocked_set")'), true);
  run(`legacyProgress=createItem({...${defaults},title:"Legado com avanço",status:"blocked",progressPercent:40});`);
  assert.equal(run("legacyProgress.status"), "in_progress");
  assert.equal(run("legacyProgress.progressPercent"), 40);
});

test("M-05: dados salvos com status blocked migram usando o histórico e o filtro antigo é convertido", () => {
  const seed = context();
  const saved = JSON.parse(seed("JSON.stringify(state)"));
  const [a, b, c] = saved.items.filter((item) => item.status !== "done").slice(0, 3);
  for (const item of [a, b, c]) { item.status = "blocked"; delete item.blocked; delete item.blockedReason; }
  b.progressPercent = 0; c.progressPercent = 40;
  saved.events.push({ id: "ev_legacy_block", itemId: a.id, eventType: "status_changed", fromValue: "in_progress", toValue: "blocked", createdAt: "2026-10-01T10:00:00.000Z", effectiveAt: "2026-10-01T10:00:00.000Z" });
  saved.filters.status = "blocked";
  const run = context(saved);
  const get = (id) => JSON.parse(run(`JSON.stringify((({status,blocked,blockedReason,progressPercent})=>({status,blocked,blockedReason,progressPercent}))(getItem("${id}")))`));
  assert.equal(get(a.id).status, "in_progress");   // status anterior vindo do histórico
  assert.equal(get(b.id).status, "waiting");       // sem histórico e sem avanço
  assert.equal(get(c.id).status, "in_progress");   // sem histórico, com avanço
  for (const id of [a.id, b.id, c.id]) { assert.equal(get(id).blocked, true); assert.equal(get(id).blockedReason, "Migrado do status Bloqueado"); }
  assert.equal(run('state.items.some((entry)=>entry.status==="blocked")'), false);
  assert.equal(run('state.filters.status'), "all");
  assert.equal(run('state.filters.indicator'), "blocked");
  assert.equal(run(`state.events.filter((entry)=>[${JSON.stringify(a.id)},${JSON.stringify(b.id)},${JSON.stringify(c.id)}].includes(entry.itemId) && entry.eventType==="blocked_set").length`), 3);
});

test("M-05: filtro por indicador separa bloqueados, atrasados e em risco do status", () => {
  const run = context();
  run('state.currentUserId="u_luis";');
  run('state.filters.indicator="blocked";');
  const blocked = JSON.parse(run('JSON.stringify(visibleItems().map((entry)=>entry.id))'));
  assert.ok(blocked.includes("item_doors_risk"), "o item do seed sinalizado como bloqueio deve aparecer");
  assert.ok(blocked.every((id) => run(`isBlocked(getItem("${id}"))`)));
  run('state.filters.indicator="overdue";');
  assert.ok(JSON.parse(run('JSON.stringify(visibleItems().map((entry)=>entry.id))')).every((id) => run(`isOverdue(getItem("${id}"))`)));
  run('state.filters.indicator="all";');
  assert.ok(run('visibleItems().length') >= blocked.length);
});
