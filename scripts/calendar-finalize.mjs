import {readFileSync,writeFileSync} from 'node:fs';
function replace(source,before,after,count=1) {
  const found=source.split(before).length-1;
  if(found!==count) throw new Error(`Expected ${count}, found ${found}: ${before}`);
  return source.split(before).join(after);
}
let workspace=readFileSync('dist/workspace.js','utf8');
workspace=replace(workspace,'[row.item.id,shiftedDate(schedule.startDate,row.startOffset + row.duration)]','[row.item.id,inclusiveFinishDate(shiftedDate(schedule.startDate,row.startOffset),row.duration)]');
writeFileSync('dist/workspace.js',workspace);
let smoke=readFileSync('browser-tests/prd3-smoke.mjs','utf8');
// Three inclusive days occupy start, start+1 and start+2. Keep this expectation independent of the production duration helper.
smoke=replace(smoke,'return formatDate(datePlusDays(parent.baselineStartAt || parent.plannedStartAt, 3));','return formatDate(datePlusDays(parent.baselineStartAt || parent.plannedStartAt, 2));');
writeFileSync('browser-tests/prd3-smoke.mjs',smoke);
let app=readFileSync('dist/app.js','utf8');
app=replace(app,'        parsed.calendarVersion = 1;','        parsed.calendarMigrationPending = parsed.calendarMigrationPending || !parsed.calendarVersion;\n        parsed.calendarVersion = 1;');
app += `
// Run the one-time calendar migration after all state and function dependencies are initialized.
// Reuse the actual scheduling engine so all views open with the same dates immediately.
if (state.calendarMigrationPending) {
  const beforeCalendarMigration = JSON.parse(JSON.stringify(state));
  try {
    const result = recalculatePlannedDates();
    if (!result.valid) throw new Error(result.message);
    delete state.calendarMigrationPending;
    saveState();
  } catch (error) {
    state = beforeCalendarMigration;
    console.warn('Calendario inclusivo: migracao adiada; dados originais preservados.', error);
  }
}
`;
writeFileSync('dist/app.js',app);
let tests=readFileSync('tests/inclusive-calendar.test.mjs','utf8');
tests += `
test('Analytical graph forecast uses the same inclusive finish as the stored schedule',()=>{
  const {run}=context();
  run(\`a=createItem({...\${input},plannedDurationDays:2});FluxosGraph.mount=(target,options)=>{capturedLabels=options.labels;return {};};document.querySelectorAll=()=>[];mountGraph(state.items);\`);
  assert.equal(run('capturedLabels.expected(a)'),run(\"formatDate('2026-10-02')\"));
  assert.equal(run('capturedLabels.deviation(a)'),'No t\u00e9rmino ideal');
});
test('legacy reload immediately recalculates inclusive forecasts while preserving baselines and relations',()=>{
  const seed=context();
  seed.run(\`a=createItem({...\${input},plannedDurationDays:2});b=createItem({...\${input},plannedDurationDays:2});createRelation(a.id,b.id,'TI');\`);
  const saved=JSON.parse(seed.run('JSON.stringify(state)'));
  delete saved.calendarVersion;
  saved.items[0].dueAt='2026-10-03'; saved.items[0].baselineDueAt='2026-10-03';
  saved.items[1].dueAt='2026-10-05';
  const {run}=context(saved);
  assert.equal(run('state.items[0].dueAt'),'2026-10-02');
  assert.equal(run('state.items[1].plannedStartAt'),'2026-10-03');
  assert.equal(run('state.items[1].dueAt'),'2026-10-04');
  assert.equal(run('state.items[0].baselineDueAt'),'2026-10-03');
  assert.equal(run('state.relations[0].sourceId===state.items[0].id'),true);
  assert.equal(run('state.calendarMigrationPending'),undefined);
});
`;
writeFileSync('tests/inclusive-calendar.test.mjs',tests);
console.log('Graph forecasts, browser expectation and protected reload migration aligned.');
