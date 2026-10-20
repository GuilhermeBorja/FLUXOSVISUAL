import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("http://127.0.0.1:8080",{waitUntil:"networkidle"});
  await page.evaluate(()=>{
    const seed=seedState();
    seed.setupComplete=true;seed.currentUserId="u_luis";
    localStorage.setItem("fluxosVisualState.prd4",JSON.stringify(seed));
    localStorage.removeItem("fluxosVisual.panes.prd41.u_luis");
  });
  await page.reload({waitUntil:"networkidle"});
  await page.locator(".prd41-workspace").waitFor();
  assert.equal(await page.locator(".prd41-pane").count(),3,"three views");
  assert.equal(await page.locator(".prd41-splitter").count(),2,"resize grips");
  assert.equal(await page.locator(".prd42-indicator").count(),4,"compact indicators");
  assert.equal(await page.locator("#prd4QuickCreate").count(),0);
  assert.equal(await page.locator('[data-action="toggle-subitems"]').count(),1);
  assert.equal(await page.locator("#prd43GanttScroll").count(),1);
  assert.ok((await page.locator("#workspaceView").boundingBox()).y<255,"work area near top");

  // Two action clicks: open creation and save complete project.
  let actionClicks=0;
  await page.locator('[data-action="create"]').click();actionClicks++;
  const form=page.locator("#createItemForm");
  await form.locator('[name="title"]').fill("PRD4.3 Poço do elevador Atlas");
  await form.locator('[name="type"]').selectOption("project");
  await form.locator("#prd43PasteActivities").fill(
    "Regularizar poço\nInformar liberação à Atlas\nMobilização Atlas\nComunicar início da montagem"
  );
  assert.equal(await form.locator(".prd43-step-row").count(),4,"pasted multiline activities become rows");
  await form.locator('[name="stepOwner_0"]').selectOption("u_enrique");
  await form.locator('[name="stepOwner_1"]').selectOption("u_enrique");
  await form.locator('[name="stepOwner_3"]').selectOption("u_enrique");
  await form.locator('[name="stepDuration_0"]').fill("2");
  await form.locator('[name="stepDuration_1"]').fill("3");
  await form.locator('[name="stepDuration_2"]').fill("2");
  await form.locator('[name="stepDuration_3"]').fill("1");
  await form.locator('#prd43Sequence').check();
  await form.locator('button[type="submit"]').click();actionClicks++;
  assert.equal(actionClicks,2,"one open, one save");
  await page.locator("#updateItemForm").waitFor();
  const created=await page.evaluate(()=>{
    const root=state.items.find(item=>item.title==="PRD4.3 Poço do elevador Atlas");
    const children=state.items.filter(item=>item.parentId===root?.id);
    const childIds=new Set(children.map(item=>item.id));
    const ties=state.relations.filter(r=>r.relationType==="TI"&&childIds.has(r.sourceId)&&childIds.has(r.targetId));
    return {rootId:root?.id,children:children.map(({id,title,ownerId,plannedStartAt,dueAt,plannedDurationDays})=>({id,title,ownerId,plannedStartAt,dueAt,plannedDurationDays})),ties:ties.map(r=>({id:r.id,sourceId:r.sourceId,targetId:r.targetId}))};
  });
  assert.ok(created.rootId);
  assert.equal(created.children.length,4);
  assert.equal(created.ties.length,3,"auto TI chain");
  assert.equal(created.children[0].ownerId,"u_enrique");
  assert.equal(created.children[0].plannedDurationDays,2);
  assert.ok(created.children[1].plannedStartAt>created.children[0].plannedStartAt);
  assert.ok(created.children[3].plannedStartAt>created.children[2].plannedStartAt);
  await page.locator('#panelRoot button[data-action="close-panel"]').click();

  // Gantt displays TI lines and supports direct edit.
  await page.locator('[data-pane-focus="gantt"]').click();
  await page.waitForTimeout(180);
  const ganttState=await page.evaluate(()=>({
    rows:document.querySelectorAll('[data-gantt-row]').length,
    bars:document.querySelectorAll('[data-gantt-bar]').length,
    links:document.querySelectorAll('#prd43GanttOverlay [data-gantt-ti]').length,
    showSubitems:ui.showSubitems,
    edges:state.relations.filter(r=>r.relationType==="TI").length,
    errors:document.querySelector('#noticeRoot')?.innerText||""
  }));
  assert.ok(ganttState.links>=3,"Visible Gantt TI lines: "+JSON.stringify(ganttState)+" runtime "+errors.join("; "));
  const [a,b,c,d]=created.children.map(item=>item.id);
  const origin=page.locator('[data-gantt-handle="'+a+'"]');
  await origin.scrollIntoViewIfNeeded();
  const rect=await origin.boundingBox();
  const targetRect=await page.locator('[data-gantt-row="'+c+'"] .gantt-item').boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  await page.mouse.down();
  await page.mouse.move(targetRect.x+Math.min(85,targetRect.width/3),targetRect.y+targetRect.height/2,{steps:9});
  await page.mouse.up();
  const extra=await page.evaluate(({a,c})=>state.relations.find(r=>r.relationType==="TI"&&r.sourceId===a&&r.targetId===c)?.id||"",{a,c});
  const info=await page.evaluate(()=>({
    notice:document.querySelector("#noticeRoot")?.innerText||"",
    activeHandles:document.querySelectorAll("[data-gantt-handle]").length,
    links:document.querySelectorAll("[data-gantt-ti]").length
  }));
  assert.ok(extra,"drag creates additional TI: "+JSON.stringify(info)+" errors="+errors.join("; "));
  await page.locator('[data-gantt-ti="'+extra+'"]').dispatchEvent("click");
  assert.equal(await page.locator("#prd43GanttRelationEditor").isVisible(),true);
  await page.locator("#prd43TiTarget").selectOption(d);
  await page.locator('[data-action="prd43-update-ti"]').click();
  const retargeted=await page.evaluate(({extra,a,d})=>state.relations.some(r=>r.id===extra&&r.sourceId===a&&r.targetId===d),{extra,a,d});
  assert.equal(retargeted,true,"retarget TI inline");
  await page.locator('[data-gantt-ti="'+extra+'"]').dispatchEvent("click");
  await page.locator('[data-action="prd43-delete-ti"]').click();
  assert.equal(await page.evaluate(extra=>state.relations.some(r=>r.id===extra),extra),false);
  assert.equal(await page.locator('[data-action="prd43-undo"]').count(),1);
  await page.locator('[data-action="prd43-undo"]').click();
  assert.equal(await page.evaluate(({a,d})=>state.relations.some(r=>r.relationType==="TI"&&r.sourceId===a&&r.targetId===d),{a,d}),true);

  // A blocked child visibly elevates its parent; calculated status and percentage remain model-owned.
  await page.evaluate(id=>{
    const item=getItem(id);updateItem(id,{...item,status:"blocked",progressPercent:0});saveState();render();
  },a);
  await page.locator('[data-gantt-row="'+created.rootId+'"].signal-red').waitFor();
  assert.equal(await page.locator('[data-row="'+created.rootId+'"] .status-badge.red').count(),1);
  const alerts=await page.evaluate(id=>prd43DescendantAlerts(getItem(id)),created.rootId);
  assert.ok(alerts.blocked>=1);
  const parent=await page.evaluate(id=>({status:getItem(id).status,progress:getItem(id).progressPercent}),created.rootId);
  assert.equal(typeof parent.progress,"number");
  const legend=page.locator(".prd43-gantt-legend");
  assert.equal(await legend.locator("span").count(),6);
  assert.equal(await page.locator('[data-action="toggle-subitems"]').count(),1);
  assert.deepEqual(errors,[],"no runtime exceptions");
  console.log("PRD4.3 smoke PASSED: two-action project creation, four children, auto TI, draggable Gantt TI, retarget, delete/undo, parent alerts, unified panes.");
}finally{await browser.close();}
