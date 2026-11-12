import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser=await chromium.launch({headless:true});
const error=[];
try {
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on("pageerror",e=>error.push(e.message));
 page.on("console",m=>{if(m.type()==="warning" && /icon/i.test(m.text()))error.push(m.text());});
 await page.goto("http://127.0.0.1:8080",{waitUntil:"networkidle"});
 await page.evaluate(()=>{const s=seedState();s.setupComplete=true;s.currentUserId="u_luis";localStorage.setItem("fluxosVisualState.prd4",JSON.stringify(s));});
 await page.reload({waitUntil:"networkidle"});
 for(const width of [1366,1920]) {
  await page.setViewportSize({width,height:width===1366?768:1080});
  await page.waitForTimeout(100);
  const result=await page.locator(".prd41-pane--gantt .gantt-scroll").evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth}));
  assert.ok(result.scroll<=result.client+3,"horizontal overflow "+width+" "+JSON.stringify(result));
 }
 await page.setViewportSize({width:1366,height:768});
 await page.locator('.workspace-heading-actions button[data-action="create"]').click();
 const f=page.locator("#createItemForm");
 await f.locator("#prd43PasteActivities").fill("QA PLANO\n\tQA TAREFA\n\t\tQA FOLHA\nQA OUTRO");
 await f.locator('[name="stepDuration_2"]').fill("5");
 assert.equal(await f.locator('[name="stepDuration_2"]').inputValue(),"5");
 await f.locator('#prd43PasteActivities').fill("QA PLANO\n\tQA TAREFA\n\t\tQA FOLHA\nQA OUTRO\nQA TERCEIRO");
 assert.equal(await f.locator('[name="stepDuration_2"]').inputValue(),"5","duration lost on editing hierarchy");
 await f.locator('button[type="submit"]').click();
 await page.locator("#updateItemForm").waitFor();
 await page.locator('#panelRoot .drawer-header button[data-action="close-panel"]').click();
 const items=await page.evaluate(()=>state.items.filter(x=>x.title.startsWith("QA ")).map(x=>({name:x.title,parent:x.parentId,duration:x.plannedDurationDays})));
 assert.equal(items.length,5);
 assert.equal(items.find(x=>x.name==="QA FOLHA").duration,5);
 assert.equal(await page.locator(".prd43-gantt-row [data-bulk-item]").count()>2,true);
 await page.locator(".prd43-gantt-row [data-bulk-item]").nth(0).check();
 await page.locator(".prd43-gantt-row [data-bulk-item]").nth(1).check();
 assert.match(await page.locator('.prd5-gantt-bulk-toolbar [data-action="toggle-bulk"]').innerText(),/\(2\)/);
 await page.locator('.prd5-gantt-bulk-toolbar [data-action="toggle-bulk"]').click();
 await page.locator("#bulkEditForm").waitFor();
 const above=await page.evaluate(()=>{const d=document.querySelector(".drawer"),h=document.querySelector(".prd5-two-pane .prd44-pane-heading");return {dz:parseInt(getComputedStyle(d).zIndex)||0,hz:parseInt(getComputedStyle(h).zIndex)||0};});
 assert.ok(above.dz>above.hz,"drawer below header "+JSON.stringify(above));
 await page.locator('#panelRoot .drawer-header button[data-action="close-panel"]').click();
 assert.deepEqual(error,[]);
 console.log("PRD5 hardening passed.");
}finally{await browser.close();}
