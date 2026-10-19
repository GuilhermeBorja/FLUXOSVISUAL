import {readFileSync,writeFileSync} from 'node:fs';
function replace(source,before,after,count=1) {
  const found=source.split(before).length-1;
  if(found!==count) throw new Error(`Expected ${count}, found ${found}: ${before}`);
  return source.split(before).join(after);
}
let core=readFileSync('tests/core.test.mjs','utf8');
// Three inclusive days ending October 31 start October 29; explicit baselines stay unchanged.
core=replace(core,'assert.equal(run("a.plannedStartAt"),"2026-10-28");','assert.equal(run("a.plannedStartAt"),"2026-10-29");');
core=replace(core,"assert.equal(run('item.dueAt'),\"2026-10-28\");","assert.equal(run('item.dueAt'),\"2026-10-27\");");
core=replace(core,"assert.equal(run('item.baselineDueAt'),\"2026-10-28\");","assert.equal(run('item.baselineDueAt'),\"2026-10-27\");",2);
core=replace(core,"assert.equal(run('active.dueAt'),\"2026-10-03\");","assert.equal(run('active.dueAt'),\"2026-10-02\");");
writeFileSync('tests/core.test.mjs',core);
let ui=readFileSync('tests/prd3-ui-contract.test.mjs','utf8');
// The isolated CPM test must load the same shared calendar functions used by the application.
ui=replace(ui,'  return vm.runInNewContext(source + "\\nscheduleAnalysis", sandbox)(items);',`  const appSource = readFileSync(new URL("../dist/app.js",import.meta.url),"utf8");
  const helpers = appSource.slice(appSource.indexOf("function calendarDayNumber("),appSource.indexOf("function recalculatePlannedDates("));
  return vm.runInNewContext(helpers + source + "\\nscheduleAnalysis", sandbox)(items);`);
writeFileSync('tests/prd3-ui-contract.test.mjs',ui);
console.log('Updated inclusive expectations and shared-helper test harness; no tests disabled.');
