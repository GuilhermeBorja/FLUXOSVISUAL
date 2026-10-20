import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
const workspace=readFileSync(new URL("../dist/workspace.js",import.meta.url),"utf8");
const styles=readFileSync(new URL("../dist/styles.css",import.meta.url),"utf8");
const base='{title:"Teste",type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:"2026-10-20",plannedDurationDays:2}';
function runtime(){
  const storage=new Map();
  const context=vm.createContext({console,document:{querySelector:()=>({})},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(app,context);
  vm.runInContext('state=seedState();state.currentUserId="u_luis";',context);
  return code=>vm.runInContext(code,context);
}
test("PRD4.2: meta do pai nao altera projecao, filhos ou baseline original",()=>{
  const run=runtime();
  run('p=createItem({...'+base+',type:"project",plannedDurationDays:4});a=createItem({...'+base+',title:"Filho",plannedDurationDays:6,parentId:p.id});');
  const before=JSON.parse(run('JSON.stringify({p:{start:p.plannedStartAt,due:p.dueAt,duration:p.plannedDurationDays,baselineStart:p.baselineStartAt,baselineDue:p.baselineDueAt},a:{start:a.plannedStartAt,due:a.dueAt}})'));
  assert.equal(before.p.duration,6);
  run('updateItem(p.id,{...p,targetStartAt:"2026-10-21",targetDueAt:"2026-10-29"});');
  const after=JSON.parse(run('JSON.stringify({p:{start:p.plannedStartAt,due:p.dueAt,duration:p.plannedDurationDays,baselineStart:p.baselineStartAt,baselineDue:p.baselineDueAt,targetStart:p.targetStartAt,targetDue:p.targetDueAt},a:{start:a.plannedStartAt,due:a.dueAt}})'));
  assert.equal(after.p.targetStart,"2026-10-21");
  assert.equal(after.p.targetDue,"2026-10-29");
  assert.deepEqual(after.a,before.a);
  assert.equal(after.p.start,before.p.start);
  assert.equal(after.p.due,before.p.due);
  assert.equal(after.p.duration,before.p.duration);
  assert.equal(after.p.baselineStart,before.p.baselineStart);
  assert.equal(after.p.baselineDue,before.p.baselineDue);
  assert.equal(run('state.events.some(e=>e.itemId===p.id&&e.eventType==="target_due_changed")'),true);
});
test("PRD4.2: meta invalida e rejeitada",()=>{
  const run=runtime();
  run('p=createItem({...'+base+',type:"process"});a=createItem({...'+base+',parentId:p.id});');
  assert.throws(()=>run('updateItem(p.id,{...p,targetStartAt:"2026-11-20",targetDueAt:"2026-10-21"})'),/término-meta/i);
  assert.equal(run('p.targetDueAt'),"");
});
test("PRD4.2: status e duracao derivados dos filhos continuam protegidos",()=>{
  const run=runtime();
  run('p=createItem({...'+base+',type:"process"});a=createItem({...'+base+',parentId:p.id});');
  assert.throws(()=>run('updateItem(p.id,{...p,plannedDurationDays:p.plannedDurationDays+1})'),/calculad|herdad/i);
  assert.equal(run('p.plannedDurationDays'),2);
});
test("PRD4.2: mudanca autorizada de responsavel do pai nao troca os filhos",()=>{
  const run=runtime();
  run('p=createItem({...'+base+',type:"project"});a=createItem({...'+base+',parentId:p.id});');
  run('updateItem(p.id,{...p,ownerId:"u_enrique"});');
  assert.equal(run('p.ownerId'),"u_enrique");
  assert.equal(run('a.ownerId'),"u_luis");
  assert.equal(run('state.events.some(e=>e.itemId===p.id&&e.eventType==="owner_changed")'),true);
});
test("PRD4.2: cadastro indica pai explicitamente sem herdar selecao da tela",()=>{
  assert.match(workspace,/id="prd42ParentSelect"/);
  assert.match(workspace,/Nível principal — item independente/);
  assert.match(workspace,/form\.has\("parentId"\)/);
  assert.match(workspace,/data-create-child=/);
  assert.doesNotMatch(workspace,/id="prd4QuickCreate"/);
});
test("PRD4.2: indicadores compactos e grafo completo com controles acessiveis",()=>{
  assert.match(workspace,/class="prd42-summary"/);
  assert.match(workspace,/class="prd42-graph-options"/);
  assert.match(workspace,/id="groupingSelect"/);
  assert.match(workspace,/id="animationLayout"/);
  assert.match(workspace,/id="animationMode"/);
  assert.match(styles,/\.prd42-indicator/);
  assert.match(styles,/\.prd42-add-child/);
});
test("PRD4.2: estados da interface preservados, sem fixar perfis da simulacao",()=>{
  assert.match(workspace,/function prd42CaptureWorkspaceScroll/);
  assert.match(workspace,/function prd42RestoreWorkspaceScroll/);
  assert.match(workspace,/function renderPrd41Workspace/);
  assert.doesNotMatch(workspace,/Fornecedor Atlas|Virgínia.*papel obrigatório/);
});
