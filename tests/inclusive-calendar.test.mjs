import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app = readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const workspace = readFileSync(new URL('../dist/workspace.js',import.meta.url),'utf8');
const graph = readFileSync(new URL('../dist/graph.js',import.meta.url),'utf8');
function context(saved) {
  const storage = new Map();
  if (saved) storage.set('fluxosVisualState.v2',JSON.stringify(saved));
  const sandbox = vm.createContext({console,document:{querySelector:()=>({})},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)}});
  const run = script => vm.runInContext(script,sandbox);
  run(app);
  if (!saved) run('state=seedState();state.currentUserId="u_luis";state.items=[];state.relations=[];state.events=[];');
  run(graph);
  run(workspace.replace(/\nrender\(\);\s*$/,''));
  run('render=()=>{};notify=()=>{};');
  return {run,storage};
}
const input = '{title:"Calendar",type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:"2026-10-01"}';
for (const [start,finish,days] of [['2026-10-01','2026-10-01',1],['2026-10-01','2026-10-02',2],['2026-10-28','2026-11-02',6],['2028-02-28','2028-03-01',3],['2026-12-31','2027-01-01',2]]) {
  test(`inclusive range ${start} to ${finish} is ${days} days`,()=>{
    const {run}=context();
    assert.equal(run(`inclusiveDurationDays('${start}','${finish}')`),days);
    assert.equal(run(`inclusiveFinishDate('${start}',${days})`),finish);
  });
}
test('invalid or reversed date ranges do not invent a duration',()=>{
  const {run}=context();
  assert.equal(run("inclusiveDurationDays('2026-02-30','2026-03-02')"),0);
  assert.equal(run("inclusiveDurationDays('2026-10-02','2026-10-01')"),0);
});
test('missing, null and blank durations use the inclusive date range; explicit zero is preserved',()=>{
  const {run}=context();
  for (const raw of ['undefined','null','""','" "']) assert.equal(run(`itemDurationDays({plannedStartAt:'2026-10-01',dueAt:'2026-10-02',plannedDurationDays:${raw}})`),2);
  assert.equal(run("itemDurationDays({plannedStartAt:'2026-10-01',dueAt:'2026-10-02',plannedDurationDays:0})"),0);
});
test('one day, explicit two days and date-only creation agree across dates, baseline and labels',()=>{
  const {run}=context();
  run(`one=createItem({...${input},plannedDurationDays:1});two=createItem({...${input},plannedDurationDays:2});range=createItem({...${input},dueAt:'2026-10-02'});`);
  assert.equal(run('one.dueAt'),'2026-10-01');
  for (const name of ['two','range']) {
    assert.equal(run(`${name}.dueAt`),'2026-10-02');
    assert.equal(run(`${name}.baselineDueAt`),'2026-10-02');
    assert.equal(run(`plannedLabel(${name})`),'2d previstos');
  }
});
test('two TI activities of two days occupy October 1-4, with an inclusive parent summary',()=>{
  const {run}=context();
  run(`parent=createItem({...${input},type:'project',plannedDurationDays:4});a=createItem({...${input},parentId:parent.id,plannedDurationDays:2});b=createItem({...${input},parentId:parent.id,plannedDurationDays:2});createRelation(a.id,b.id,'TI');recalculatePlannedDates();syncParentSummary(parent.id);analysis=scheduleAnalysis(state.items);`);
  assert.equal(run('a.dueAt'),'2026-10-02');
  assert.equal(run('b.plannedStartAt'),'2026-10-03');
  assert.equal(run('b.dueAt'),'2026-10-04');
  assert.equal(run('parent.plannedDurationDays'),4);
  assert.equal(run('analysis.durationDays'),4);
  assert.equal(run('analysis.finishDate'),'2026-10-04');
  assert.equal(run('analysis.rows.every(row=>row.critical && row.slack===0)'),true);
});
for (const [type,lag,start,finish] of [['TI',0,'2026-10-13','2026-10-14'],['TI',1,'2026-10-14','2026-10-15'],['TI',-1,'2026-10-12','2026-10-13'],['II',0,'2026-10-10','2026-10-11'],['TT',0,'2026-10-11','2026-10-12'],['IF',0,'2026-10-09','2026-10-10']]) {
  test(`${type} lag ${lag}: dates and CPM agree`,()=>{
    const {run}=context();
    run(`a=createItem({...${input},plannedStartAt:'2026-10-10',plannedDurationDays:3});b=createItem({...${input},plannedDurationDays:2});createRelation(a.id,b.id,'${type}',${lag});analysis=scheduleAnalysis(state.items);row=analysis.rows.find(r=>r.item.id===b.id);`);
    assert.equal(run('b.plannedStartAt'),start);
    assert.equal(run('b.dueAt'),finish);
    assert.equal(run('shiftedDate(analysis.startDate,row.startOffset)'),start);
    assert.equal(run('inclusiveFinishDate(shiftedDate(analysis.startDate,row.startOffset),row.duration)'),finish);
  });
}
test('CPM includes a long nonterminal predecessor connected by II',()=>{
  const {run}=context();
  run(`a=createItem({...${input},plannedDurationDays:10});b=createItem({...${input},plannedDurationDays:2});createRelation(a.id,b.id,'II');analysis=scheduleAnalysis(state.items);`);
  assert.equal(run('analysis.finishDate'),'2026-10-10');
  assert.equal(run('analysis.durationDays'),10);
  assert.equal(run('analysis.rows.find(r=>r.item.id===a.id).slack'),0);
  assert.equal(run('analysis.rows.find(r=>r.item.id===b.id).slack'),8);
});
test('zero-duration milestone stays on its date and releases a TI successor the same date',()=>{
  const {run}=context();
  run(`a=createItem({...${input},type:'milestone',plannedDurationDays:0});b=createItem({...${input},plannedDurationDays:1});createRelation(a.id,b.id,'TI');`);
  assert.equal(run('a.dueAt'),'2026-10-01');
  assert.equal(run('b.plannedStartAt'),'2026-10-01');
  assert.equal(run('itemDurationDays(a)'),0);
});
test('bulk duration edits update the authoritative duration and inclusive end date',()=>{
  const {run}=context();
  run(`a=createItem({...${input},plannedDurationDays:5});ui.bulkSelected=new Set([a.id]);applyBulkEdit({get:key=>key==='durationDays'?'2':''});`);
  assert.equal(run('a.plannedDurationDays'),2);
  assert.equal(run('a.dueAt'),'2026-10-02');
});
test('editing duration propagates to TI successors without changing their IDs',()=>{
  const {run}=context();
  run(`a=createItem({...${input},plannedDurationDays:2});b=createItem({...${input},plannedDurationDays:2});relation=createRelation(a.id,b.id,'TI');id=b.id;updateItem(a.id,{...a,plannedDurationDays:3});`);
  assert.equal(run('a.dueAt'),'2026-10-03');
  assert.equal(run('b.plannedStartAt'),'2026-10-04');
  assert.equal(run('b.dueAt'),'2026-10-05');
  assert.equal(run('id===b.id && relation.targetId===b.id'),true);
});
test('visual numbering changes with row position while internal IDs and relationships remain fixed',()=>{
  const {run}=context();
  run(`a=createItem({...${input},title:'A',plannedDurationDays:2});b=createItem({...${input},title:'B',plannedDurationDays:2});relation=createRelation(a.id,b.id,'TI');id=a.id;before=shortId(a);reorderItem(a.id,b.id,true);`);
  assert.equal(run('shortId(a)!==before'),true);
  assert.equal(run('a.id===id && relation.sourceId===id && relation.targetId===b.id'),true);
});
test('legacy local data gets a recovery copy and retains explicit duration and item ID',()=>{
  const seed=context();
  const saved=JSON.parse(seed.run('JSON.stringify(state)'));
  delete saved.calendarVersion;
  saved.items=[{id:'stable',type:'task',status:'backlog',plannedStartAt:'2026-10-01',dueAt:'2026-10-03',plannedDurationDays:2}];
  const {run,storage}=context(saved);
  assert.equal(run('state.items[0].id'),'stable');
  assert.equal(run('state.items[0].plannedDurationDays'),2);
  assert.deepEqual(JSON.parse(storage.get('fluxosVisualState.v2.beforeInclusiveCalendar')),saved);
});
