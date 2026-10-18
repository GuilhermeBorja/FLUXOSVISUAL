import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
function context(storage=new Map()) {
  const sandbox=vm.createContext({console,document:{querySelector:()=>({})},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  vm.runInContext(source,sandbox);
  const run=script=>vm.runInContext(script,sandbox);
  run('state.currentUserId="u_luis";');
  return run;
}
const defaults='{title:"Teste",type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:today(),dueAt:today(3)}';

test("exclusão de projeto remove descendentes e vínculos, preserva memória e itens externos",()=>{
  const run=context();
  run(`parent=createItem(${defaults});child=createItem({...${defaults},parentId:parent.id});grandchild=createItem({...${defaults},parentId:child.id});external=createItem(${defaults});createRelation(grandchild.id,external.id,"blocks");state.graphPositions={layout:{[child.id]:{x:10,y:20},[external.id]:{x:40,y:50}}};`);
  run('result=removeItem(parent.id,{cascade:true});');
  assert.equal(run('result.items'),3);
  assert.equal(run('state.items.some((item)=>item.id===external.id)'),true);
  assert.equal(run('state.relations.some((rel)=>[parent.id,child.id,grandchild.id].includes(rel.sourceId) || [parent.id,child.id,grandchild.id].includes(rel.targetId))'),false);
  assert.equal(run('state.archivedItems.length'),3);
  assert.equal(run('state.events.some((event)=>event.itemId===external.id && event.eventType==="relation_removed")'),true);
  assert.equal(run('state.events.some((event)=>event.itemId===child.id && event.eventType==="created")'),true);
  assert.equal(run('state.graphPositions.layout[child.id]'),undefined);
  assert.equal(run('state.graphPositions.layout[external.id].x'),40);
});

test("excluir só o pai mantém a estrutura dos subitens sem pais inexistentes",()=>{
  const run=context();
  run(`parent=createItem(${defaults});child=createItem({...${defaults},parentId:parent.id});grandchild=createItem({...${defaults},parentId:child.id});`);
  run('removeItem(parent.id,{keepChildren:true});');
  assert.equal(run('getItem(child.id).parentId'),"");
  assert.equal(run('getItem(grandchild.id).parentId===child.id'),true);
  assert.equal(run('state.events.some((event)=>event.itemId===child.id && event.eventType==="parent_changed")'),true);
  assert.equal(run('state.items.every((item)=>!item.parentId || !!getItem(item.parentId))'),true);
});

test("todos os comandos de exclusão sem autorização GPO são negados antes de alterar dados",()=>{
  const run=context();
  run('state.currentUserId="u_virginia";before=JSON.stringify(state);');
  for(const command of ['removeItem("item_adm",{cascade:true})','removeUser("u_mateus")','removeSector("sec_rh",{replacementId:"sec_obra"})','removeOrganization("org_dmk")']) assert.throws(()=>run(command),/GPO/);
  assert.equal(run('JSON.stringify(state)===before'),true);
});

test("usuário excluído sai do cadastro; responsabilidades e autoria são preservadas corretamente",()=>{
  const run=context();
  run(`owned=createItem({...${defaults},ownerId:"u_mateus"});owned.createdBy="u_mateus";removeUser("u_mateus",{replacementId:"u_enrique"});`);
  assert.equal(run('state.users.some((user)=>user.id==="u_mateus")'),false);
  assert.equal(run('owned.ownerId'),"u_enrique");
  assert.equal(run('owned.createdBy'),"u_mateus");
  assert.equal(run('userName("u_mateus")'),"Mateus");
  assert.equal(run('state.events.some((event)=>event.itemId===owned.id && event.eventType==="owner_changed" && event.fromValue==="u_mateus" && event.toValue==="u_enrique")'),true);
});

test("excluir usuário pode deixar demandas sem responsável e limpa filtro antigo",()=>{
  const run=context();run('state.filters.owner="u_mateus";removeUser("u_mateus");');
  assert.equal(run('getItem("item_adm").ownerId'),"");
  assert.equal(run('state.filters.owner'),"all");
  assert.equal(run('state.archivedUsers.length'),1);
});

test("excluir um setor ocupado exige destino na mesma empresa e transfere os vínculos",()=>{
  const run=context();run('before=JSON.stringify(state);');
  assert.throws(()=>run('removeSector("sec_rh")'),/mesma empresa/);
  assert.throws(()=>run('removeSector("sec_rh",{replacementId:"sec_fornecedor"})'),/mesma empresa/);
  assert.equal(run('JSON.stringify(state)===before'),true);
  run('removeSector("sec_rh",{replacementId:"sec_obra"});');
  assert.equal(run('state.sectors.some((sector)=>sector.id==="sec_rh")'),false);
  assert.equal(run('state.users.find((user)=>user.id==="u_mateus").sectorId'),"sec_obra");
  assert.equal(run('getItem("item_adm").sectorId'),"sec_obra");
  assert.equal(run('sectorName("sec_rh")'),"RH");
  assert.equal(run('state.items.every((item)=>state.sectors.some((sector)=>sector.id===item.sectorId))'),true);
});

test("empresa é excluída com sua estrutura; demandas externas ficam sem responsável",()=>{
  const run=context();
  run(`external=createItem({...${defaults},ownerId:"u_dmk"});companyItem=createItem({...${defaults},organizationId:"org_dmk",sectorId:"sec_fornecedor",ownerId:"u_dmk"});crossChild=createItem({...${defaults},parentId:companyItem.id});createRelation(companyItem.id,external.id,"TI");result=removeOrganization("org_dmk");`);
  assert.equal(run('result.items'),2);
  assert.equal(run('state.organizations.some((org)=>org.id==="org_dmk")'),false);
  assert.equal(run('state.users.some((user)=>user.id==="u_dmk")'),false);
  assert.equal(run('state.sectors.some((sector)=>sector.id==="sec_fornecedor")'),false);
  assert.equal(run('getItem(external.id).ownerId'),"");
  assert.equal(run('getItem(crossChild.id)'),undefined);
  assert.equal(run('orgName("org_dmk")'),"DMK / Rocha");
  assert.equal(run('state.users.every((user)=>state.organizations.some((org)=>org.id===user.organizationId) && state.sectors.some((sector)=>sector.id===user.sectorId))'),true);
});

test("não permite excluir o acesso conectado nem sua empresa",()=>{
  const run=context();run('before=JSON.stringify(state);');
  assert.throws(()=>run('removeUser("u_luis")'),/outro administrador/);
  assert.throws(()=>run('removeOrganization("org_castro")'),/outra empresa/);
  assert.equal(run('JSON.stringify(state)===before'),true);
});

test("exclusões persistem ao reabrir os dados e não restauram o exemplo inicial",()=>{
  const storage=new Map();const run=context(storage);
  run('removeItem("item_adm",{cascade:true});removeUser("u_mateus");saveState();');
  const reopened=context(storage);
  assert.equal(reopened('getItem("item_adm")'),undefined);
  assert.equal(reopened('state.users.some((user)=>user.id==="u_mateus")'),false);
  assert.equal(reopened('state.archivedItems.length'),7);
});
