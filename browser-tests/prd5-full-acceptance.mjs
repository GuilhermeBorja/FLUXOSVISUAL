import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:768}});
page.setDefaultTimeout(5000);
const problems=[],passed=[],errors=[];
page.on("pageerror",e=>errors.push(e.message));
page.on("console",m=>{if(m.type()==="warning"&&/icon/i.test(m.text()))errors.push(m.text())});
const test=async(name,fn)=>{
 try{await fn();passed.push(name);console.log("PASS "+name);}
 catch(e){problems.push({name,message:String(e?.message||e).slice(0,950)});console.error("FAIL "+name+" "+e?.message);}
};
await page.goto("http://127.0.0.1:8080/",{waitUntil:"networkidle"});
await page.evaluate(()=>{
 const seed=seedState();seed.setupComplete=true;seed.currentUserId="u_luis";
 localStorage.setItem("fluxosVisualState.prd4",JSON.stringify(seed));
});
await page.reload({waitUntil:"networkidle"});

await test("workspace has exactly two panels",async()=>{
 assert.equal(await page.locator(".prd5-two-pane .prd41-pane").count(),2);
});
await test("no horizontal Gantt overflow at 1366 and 1920",async()=>{
 for(const width of [1366,1920]){
  await page.setViewportSize({width,height:width===1366?768:1080});
  const d=await page.locator(".prd41-pane--gantt .gantt-scroll").evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
  assert.ok(d.scroll<=d.client+3,JSON.stringify({width,...d}));
 }
 await page.setViewportSize({width:1366,height:768});
});
await test("create multi-root structure and per-item duration",async()=>{
 await page.locator('.workspace-heading-actions [data-action="create"]').click();
 const f=page.locator("#createItemForm");
 assert.equal(await f.locator('[name="parentId"],[name="title"]').count(),0);
 await f.locator("#prd43PasteActivities").fill("QA ROOT A\n\tQA LEAF A1\n\t\tQA NEST A1.1\nQA ROOT B\n\tQA LEAF B1\nQA ROOT C");
 assert.equal(await f.locator(".prd5-step-row").count(),6);
 for(const index of [2,4,5])await f.locator('[name="stepDuration_'+index+'"]').fill(index===2?"3":"4");
 await f.locator("#prd43Sequence").check();
 await f.locator('button[type="submit"]').click();
 await page.locator("#updateItemForm").waitFor();
 const out=await page.evaluate(()=>{
  const nodes=state.items.filter(x=>x.title.startsWith("QA "));
  const byName=new Map(nodes.map(x=>[x.title,x]));
  return {count:nodes.length,roots:nodes.filter(x=>!x.parentId).length,child:byName.get("QA NEST A1.1")?.parentId===byName.get("QA LEAF A1")?.id,duration:byName.get("QA NEST A1.1")?.plannedDurationDays,
     tis:state.relations.filter(r=>r.relationType==="TI"&&nodes.some(x=>x.id===r.sourceId)).length,
     contains:state.relations.filter(r=>r.relationType==="contains").length};
 });
 assert.equal(out.count,6);assert.equal(out.roots,3);assert.ok(out.child);assert.equal(out.duration,3);
 assert.equal(out.tis,2);assert.equal(out.contains,0);
 await page.locator('button[data-action="close-panel"]').click();
});
await test("graph and Gantt share parent relations",async()=>{
 const data=await page.evaluate(()=>{
   const graph=prd44GraphProjection(scopedItems());
   const contains=graph.relations.filter(r=>r.relationType==="contains");
   const active=graph.nodes.filter(x=>x.parentId&&graph.nodes.some(y=>y.id===x.parentId));
   return {contains:contains.length,expected:active.length,duplicates:new Set(contains.map(r=>r.sourceId+":"+r.targetId)).size!==contains.length};
 });
 assert.equal(data.contains,data.expected,JSON.stringify(data));assert.equal(data.duplicates,false);
});
await test("Gantt columns switch and persist",async()=>{
 await page.locator(".prd41-pane--gantt .prd44-pane-options>summary").click();
 const input=page.locator('[data-prd5-column="type"]');
 await input.check();
 assert.ok(await page.locator('[data-prd5-column="type"]').isChecked());
 await page.reload({waitUntil:"networkidle"});
 await page.locator(".prd41-pane--gantt .prd44-pane-options>summary").click();
 assert.ok(await page.locator('[data-prd5-column="type"]').isChecked());
 await page.locator(".prd41-pane--gantt .prd44-pane-options>summary").click();
});
await test("Gantt organize menu has loaded icon",async()=>{
 const menu=page.locator(".prd41-pane--gantt .prd5-gantt-more").first();
 const has=await menu.evaluate(el=>!!el.querySelector("summary svg"));
 assert.equal(has,true);
});
await test("Gantt contextual creation records the origin",async()=>{
 const source=page.locator(".prd43-gantt-row").filter({has:page.locator(".gantt-item strong",{hasText:"QA ROOT B"})}).first();
 await source.locator(".prd5-gantt-more>summary").click();
 await source.locator("[data-create-child]").click();
 assert.ok((await page.locator(".prd5-parent-context").innerText()).includes("QA ROOT B"));
 await page.locator("#createItemForm #prd43PasteActivities").fill("QA CHILD B2");
 await page.locator("#createItemForm [name='stepDuration_0']").fill("2");
 await page.locator("#createItemForm button[type=submit]").click();
 const item=await page.evaluate(()=>state.items.find(x=>x.title==="QA CHILD B2"));
 const parent=await page.evaluate(()=>state.items.find(x=>x.title==="QA ROOT B"));
 assert.equal(item.parentId,parent.id);
 await page.locator('button[data-action="close-panel"]').click();
});
await test("bulk selection opens drawer and updates two items",async()=>{
 const before=page.locator(".prd43-gantt-row [data-bulk-item]");
 await before.nth(0).check();await before.nth(1).check();
 const btn=page.locator(".prd5-gantt-bulk-toolbar [data-action='toggle-bulk']");
 assert.ok((await btn.innerText()).includes("(2)"));
 await btn.click();
 await page.locator("#bulkEditForm").waitFor();
 await page.locator('#bulkEditForm [name="weight"]').fill("3");
 await page.locator('#bulkEditForm [name="comment"]').fill("Teste de edição em lote");
 await page.locator('#bulkEditForm button[type=submit]').click();
 const n=await page.evaluate(()=>state.items.filter(x=>x.weight===3).length);
 assert.ok(n>=2);
});
await test("layers keep drawer above headers",async()=>{
 await page.locator('.workspace-heading-actions [data-action="create"]').click();
 const d=await page.evaluate(()=>{
  const z=s=>{const e=document.querySelector(s);return e?Number(getComputedStyle(e).zIndex)||0:0;};
  return {drawer:z("#panelRoot"),head:z(".prd5-two-pane .prd44-pane-heading")};
 });
 assert.ok(d.drawer>d.head,JSON.stringify(d));
 await page.locator('button[data-action="close-panel"]').click();
});
await test("Gantt legend includes distinct critical and blocked colors",async()=>{
 assert.equal(await page.locator(".prd43-gantt-legend [data-highlight-signal='critical']").count(),1);
 assert.equal(await page.locator(".prd43-gantt-legend [data-highlight-signal='red']").count(),1);
});
await test("Gantt drag zones activate and no exceptions",async()=>{
 const rows=page.locator(".prd43-gantt-row");
 assert.ok(await rows.count()>2);
 const r=await rows.nth(0).evaluate(el=>({draggable:el.draggable,dataset:el.dataset.row}));
 assert.equal(r.draggable,true);
});
await test("Global history has all filters",async()=>{
 await page.locator("[data-action='admin']").first().click();
 await page.locator('[data-admin-tab="history"]').click();
 for(const id of ["historyUserFilter","historyOrganizationFilter","historySectorFilter","historyEventFilter","historyItemFilter","historySinceFilter","historyUntilFilter"])assert.equal(await page.locator("#"+id).count(),1,id);
 await page.locator('button[data-action="close-panel"]').click();
});
await test("GPO filters and profile creation are present",async()=>{
 await page.locator("[data-action='admin']").first().click();
 await page.locator('[data-admin-tab="gpo"]').click();
 for(const id of ["gpoRuleForm","permissionProfileForm","prd5GpoSearch","prd5GpoEffect","prd5GpoOperation"])assert.equal(await page.locator("#"+id).count(),1,id);
 await page.locator('button[data-action="close-panel"]').click();
});
await test("no missing icons or JavaScript exceptions",async()=>{
 assert.equal(errors.length,0,errors.join("\n"));
});
console.log("PRD5_ACCEPTANCE="+JSON.stringify({passed,problems}));
await browser.close();
if(problems.length)process.exitCode=1;
