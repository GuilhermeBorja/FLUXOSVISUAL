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
  run('updateItem(a.id,{...a,status:"blocked",blockedReason:"Dependência externa não liberada"});');
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
  run('updateItem(a.id,{...a,status:"blocked",blockedReason:"Dependência externa não liberada"});');
  assert.equal(run('signalOf(a)'),"red");
  run('updateItem(a.id,{...a,status:"done",progressPercent:100},undefined,"Desbloqueio validado");');
  assert.equal(run('signalOf(a)'),"green");
});
test("PRD4.3: criacao unica e subitens por linha com sequencia TI facultativa",()=>{
  for(const token of ['id="prd43PasteActivities"','data-step-duration','data-step-owner','data-step-title','data-step-type','id="prd43Sequence"','name="autoSequence"','createRelation(','"TI"','stepTitle_','stepOwner_','stepDuration_']){
    assert.ok(workspace.includes(token),token);
  }
  assert.ok(workspace.includes('id="prd43PasteActivities"'),"mantem cadastro no mesmo nivel");
  assert.doesNotMatch(workspace,/id="prd4QuickCreate"/);
});
test("PRD4.3: Gantt cria, mostra, altera e remove relacoes TI usando core",()=>{
  for(const token of ["data-gantt-handle","prd43BindGantt","prd43DrawGanttRelations","data-gantt-ti","prd43-update-ti","prd43-delete-ti","updateRelation(rel.id","createRelation(originId,targetId,\"TI\")","removeRelation(rel.id)","prd43-undo"]){
    assert.ok(workspace.includes(token),token);
  }
  assert.match(app,/TI em agrupadores/);
  assert.ok(css.includes(".prd43-ti-path"));
});
test("Gantt usa o mesmo eixo inclusivo para baseline, compromisso, tendência e proposta",()=>{
  const run=runtime();
  run('window={innerWidth:1200,FluxosBackend:{enabled:true,start(){}}};');
  run(graph);
  run(workspace);
  run(`window.FluxosBackend.enabled=false; document.querySelector=()=>null;
    state.items=[]; state.relations=[]; state.events=[];
    p=createItem({...${base},type:"project",plannedStartAt:"2026-10-10"});
    a=createItem({...${base},parentId:p.id,plannedStartAt:"2026-10-10"});
    state.commitments=[
      {itemId:a.id,kind:"baseline",status:"active",startAt:"2026-10-01",dueAt:"2026-10-05"},
      {itemId:a.id,kind:"agreement",status:"proposed",version:2,startAt:"2026-10-20",dueAt:"2026-10-20"}
    ];
    state.trend={itemTrendById:{[a.id]:{trendStartAt:"2026-10-09",trendDueAt:"2026-10-10"}}};
    state.asOf="2026-10-20";ui.showSubitems=true;ui.selectedItemId=a.id;`);
  const html=run('renderGantt(state.items)');
  const task=html.split(`data-gantt-track="${run('a.id')}"`)[1].split('class="prd43-gantt-links"')[0];
  const parent=html.split(`data-gantt-track="${run('p.id')}"`)[1].split('class="prd43-gantt-links"')[0];
  assert.match(task,/data-gantt-layer="baseline"[^>]+left:0%;width:25%/);
  assert.doesNotMatch(task,/data-gantt-layer="agreement"/);
  assert.match(task,/Baseline original · compromisso vigente/);
  assert.match(task,/data-gantt-layer="trend"[^>]+left:40%;width:10%/);
  assert.match(task,/data-gantt-layer="proposal"[^>]+left:95%;width:5%/);
  assert.match(task,/Proposta pendente/);
  assert.match(parent,/data-gantt-layer="plan"/);
  assert.doesNotMatch(parent,/data-gantt-layer="trend"/);
  assert.match(html,/gantt-tick last" style="left:95%">20\/10\/2026/);
  assert.match(task,/gantt-today-line[^>]+left:95%/);
  run('state.commitments.push({itemId:a.id,kind:"agreement",status:"active",version:3,startAt:"2026-10-07",dueAt:"2026-10-08"})');
  assert.match(run('renderGantt(state.items)'),/data-gantt-layer="agreement"[^>]+left:30%;width:10%/);
});
test("PRD4.3: Gantt mantém a data de status visível e preserva o arraste da barra",()=>{
  assert.match(css,/\.gantt-commitment-band[^}]*pointer-events:none/);
  assert.match(workspace,/data-gantt-today/);
  assert.match(workspace,/data-status-date/);
  assert.match(workspace,/Status:.*statusDate/);
  assert.match(workspace,/Hoje · \$\{escapeHtml\(formatDate\(todayDate\)\)\}/);
});
test("PRD4.3: backend direciona avanço para medição factual",()=>{
  assert.match(workspace,/id="measurementForm"/);
  assert.match(workspace,/form-readonly-note/);
  assert.match(workspace,/Atualize pelo fluxo/);
  assert.match(workspace,/const progressField = window\.FluxosBackend\?\.enabled/);
  assert.match(workspace,/const progressRaw = window\.FluxosBackend\?\.enabled \? ""/);
  assert.match(workspace,/data-measurement-expected/);
  assert.match(workspace,/previewTrend\(ui\.selectedItemId, measurementDate\.value\)/);
  assert.match(workspace,/data-measurement-counters/);
  assert.match(workspace,/function trendCounterLabel\(item\)/);
  assert.match(workspace,/O registro factual não pode ser lançado no futuro/);
  assert.match(workspace,/Última medição confirmada/);
  assert.match(css,/\.backend-busy[^}]*pointer-events:none/);
});
test("O arraste usa as datas da tendência exibida, mesmo quando diferem do planejamento",()=>{
  const run=runtime();
  run('window={innerWidth:1200,FluxosBackend:{enabled:true,start(){}}};');
  run(graph);
  run(workspace);
  run(`document.querySelector=()=>null; state.items=[]; state.relations=[];
    a=createItem(${base}); state.trend={itemTrendById:{[a.id]:{trendStartAt:"2026-10-23",trendDueAt:"2026-10-26"}}};`);
  const html=run("renderGantt(state.items)");
  assert.match(html,/data-gantt-start="2026-10-23" data-gantt-end="2026-10-26"/);
  const pending=run(`state.commitments=[{itemId:a.id,kind:"agreement",status:"proposed",version:1,startAt:"2026-10-25",dueAt:"2026-10-28"}]; renderGantt(state.items)`);
  assert.match(pending,/data-gantt-layer="candidate"[^>]+data-gantt-start="2026-10-25" data-gantt-end="2026-10-28"/);
  assert.match(pending,/prd5-col-due">28\/10\/2026/);
  run('state.commitments[0].status="active"');
  const accepted=run("renderGantt(state.items)");
  assert.doesNotMatch(accepted,/data-gantt-layer="candidate"/);
  assert.match(accepted,/data-gantt-layer="agreement"/);
  run('gpoDecision=()=>false');
  assert.doesNotMatch(run("renderGantt(state.items)"),/data-gantt-date-drag=/);
});
test("PRD4.3: dashboard e tabela priorizam leitura sem alterar permissoes",()=>{
  assert.doesNotMatch(workspace,/Trabalho <small>Sintética/);
  assert.match(workspace,/prd5-gpo-profiles/);
  assert.match(workspace,/data-action="toggle-subitems"/);
  assert.match(workspace,/const mandatory=new Set\(compact\?/);
  assert.match(workspace,/function prd43ProgressBasis/);
  assert.match(workspace,/prd43InlineDeletion/);
  assert.match(css,/\.prd43-inline-confirm/);
  assert.match(workspace,/const graphPreferenceSection = '<section class="panel-section"><h3>Mapa executivo/);
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
test("PRD4.3: alteracao de TI preserva referencia resumida em agrupador",()=>{
  const run=runtime();
  run('p=createItem({...'+base+',type:"project"});a=createItem({...'+base+',parentId:p.id});b=createItem({...'+base+',title:"B"});c=createItem({...'+base+',title:"C"});rel=createRelation(a.id,b.id,"TI");');
  run('updateRelation(rel.id,{...rel,sourceId:p.id,targetId:c.id})');
  assert.equal(run('rel.sourceId===p.id&&rel.targetId===c.id'),true);
});
