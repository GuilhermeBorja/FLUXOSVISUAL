import assert from "node:assert/strict";
import {chromium} from "playwright";
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1540,height:930}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("http://127.0.0.1:8080",{waitUntil:"networkidle"});
 await page.evaluate(()=>{
  const seed=seedState();seed.setupComplete=true;seed.currentUserId="u_luis";
  localStorage.setItem("fluxosVisualState.prd4",JSON.stringify(seed));
 });
 await page.reload({waitUntil:"networkidle"});
 assert.equal(await page.locator(".prd5-two-pane .prd41-pane").count(),2);
 await page.locator('[data-action="create"]').click();
 const form=page.locator("#createItemForm");
 await form.locator('[name="title"]').fill("PRD5 EAP");
 await form.locator("#prd43PasteActivities").fill("A\nB\n\tC\n\t\tD\nE");
 assert.equal(await form.locator(".prd5-step-row").count(),5,JSON.stringify(await page.evaluate(()=>({raw:document.querySelector("#prd43PasteActivities")?.value,rows:document.querySelectorAll(".prd5-step-row").length,error:document.querySelector(".prd5-indent-error")?.textContent,parsed:(()=>{try{return prd5ParseIndentedItems(document.querySelector("#prd43PasteActivities")?.value)}catch(e){return e.message}})()}))));
 await form.locator('button[type="submit"]').click();
 await page.locator("#updateItemForm").waitFor();
 const shape=await page.evaluate(()=>{
  const root=state.items.find(x=>x.title==="PRD5 EAP");
  const child=state.items.find(x=>x.title==="C"),grand=state.items.find(x=>x.title==="D"),b=state.items.find(x=>x.title==="B");
  return {parent:child.parentId===b.id,grand:grand.parentId===child.id,root:root?.id};
 });
 assert.equal(shape.parent,true);assert.equal(shape.grand,true);
 await page.locator('[data-panel-tab="history"]').click();
 assert.equal(await page.locator("#prd5HistoryUser").count(),1);
 await page.locator('[data-action="close-panel"]').click();
 await page.locator("#scopeSelect").selectOption(shape.root);
 assert.ok(await page.locator(".prd5-gantt-edit").count()>=6);
 await page.locator(".prd5-gantt-edit").first().click();
 assert.equal(await page.locator("#updateItemForm").count(),1);
 assert.deepEqual(errors,[]);
 console.log("PRD5 browser smoke OK");
}finally{await browser.close();}
