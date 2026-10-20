import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  const errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto("http://127.0.0.1:8080",{waitUntil:"networkidle"});
  await page.evaluate(()=>{
    const seed=seedState();
    seed.setupComplete=true;seed.currentUserId="u_luis";
    localStorage.setItem("fluxosVisualState.prd4",JSON.stringify(seed));
    localStorage.removeItem("fluxosVisual.panes.prd41.u_luis");
  });
  await page.reload({waitUntil:"networkidle"});
  await page.locator(".prd41-workspace").waitFor();
  assert.equal(await page.locator(".prd41-pane").count(),3);
  assert.equal(await page.locator(".prd41-splitter").count(),2);
  assert.equal(await page.locator("#prd4QuickCreate").count(),0,"remove always-visible creation form");
  assert.equal(await page.locator(".prd42-indicator").count(),4);
  assert.equal(await page.locator("#showSubitems").count(),1,"one shared subitem toggle");
  assert.equal(await page.locator("#showSubitemsGantt").count(),0);
  const y=await page.locator("#workspaceView").evaluate(el=>el.getBoundingClientRect().top);
  assert.ok(y<255,"operational panes must start before y=255 at 1366x768; actual "+y);
  const cards=await page.locator(".prd42-indicator").evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
  assert.ok(cards.every(h=>h<=37),"indicators must be compact: "+cards.join(","));

  // Deliberately select an existing item: global Novo item must NOT inherit it as parent.
  const firstExisting=await page.locator("[data-row]").first().getAttribute("data-row");
  await page.locator('[data-row="'+firstExisting+'"] [data-select]').first().click();
  await page.locator("#panelRoot button[data-action='close-panel']").click();
  await page.locator('[data-action="create"]').click();
  assert.equal(await page.locator("#prd42ParentSelect").inputValue(),"","root creation is explicit");
  assert.match(await page.locator("#prd42ParentHelp").innerText(),/independente/i);
  await page.locator('#createItemForm [name="title"]').fill("PRD4.2 Liberação do poço");
  await page.locator('#createItemForm [name="type"]').selectOption("project");
  await page.locator('#createItemForm button[type="submit"]').click();
  await page.locator("#updateItemForm").waitFor();
  const root=await page.evaluate(()=>state.items.find(x=>x.title==="PRD4.2 Liberação do poço"));
  assert.ok(root && !root.parentId,"new project remains independent");

  // From the parent's drawer, contextual creation is explicit and continuous.
  await page.locator('#panelRoot [data-action="new-subitem"]').click();
  assert.equal(await page.locator("#prd42ParentSelect").inputValue(),root.id);
  assert.match(await page.locator("#prd42ParentHelp").innerText(),/subitem de/i);
  await page.locator('#createItemForm [name="title"]').fill("Regularizar poço");
  await page.locator('#createItemForm [name="ownerId"]').selectOption("u_enrique");
  await page.locator('#createItemForm button[type="submit"]').click();
  const child=await page.evaluate(()=>state.items.find(x=>x.title==="Regularizar poço"));
  assert.equal(child.parentId,root.id);
  assert.equal(child.ownerId,"u_enrique");
  assert.ok(await page.evaluate(id=>state.relations.some(r=>r.relationType==="contains" && r.sourceId===id),root.id));
  await page.locator("#panelRoot button[data-action='close-panel']").click();

  // Add siblings directly from the parent row. Bulk mode creates peers, not grandchildren.
  await page.locator('[data-row="'+root.id+'"] [data-create-child]').click();
  assert.equal(await page.locator("#prd42ParentSelect").inputValue(),root.id);
  await page.locator('#createItemForm [name="title"]').fill("Mobilização Atlas");
  await page.locator('#createItemForm details.prd42-create-extras').filter({hasText:"Criar outros itens no mesmo nível"}).locator("summary").click();
  await page.locator('#createItemForm [name="additionalTitles"]').fill("Informar liberação à Atlas\nInformar início da montagem");
  await page.locator('#createItemForm button[type="submit"]').click();
  const newChildren=await page.evaluate(id=>state.items.filter(x=>x.parentId===id).map(x=>({id:x.id,title:x.title,parentId:x.parentId})),root.id);
  assert.equal(newChildren.length,4,"first subitem + three peers in one parent");
  assert.ok(newChildren.every(x=>x.parentId===root.id));

  // A parent retains a calculated schedule, while its own editable targets and owner can change.
  await page.locator("#panelRoot button[data-action='close-panel']").click();
  await page.locator('[data-row="'+root.id+'"] [data-select]').first().click();
  const parentForm=page.locator("#updateItemForm");
  assert.ok(await parentForm.locator('[name="targetDurationDays"]').count()===1);
  assert.equal(await parentForm.locator('[name="plannedDurationDays"]').count(),0,"derived duration is not editable");
  assert.equal(await parentForm.locator('[name="ownerId"]').isEnabled(),true);
  const before=await page.evaluate(id=>{const item=getItem(id);return {start:item.plannedStartAt,due:item.dueAt,duration:item.plannedDurationDays,baseline:item.baselineDueAt};},root.id);
  await parentForm.locator('[name="targetStartAt"]').fill("2026-10-21");
  await parentForm.locator('[name="targetDurationDays"]').fill("12");
  await parentForm.locator('[name="targetDurationDays"]').dispatchEvent("change");
  assert.equal(await parentForm.locator('[name="targetDueAt"]').inputValue(),"2026-11-01");
  await parentForm.locator('[name="ownerId"]').selectOption("u_enrique");
  await parentForm.locator('[type="submit"]').click();
  const after=await page.evaluate(id=>{const item=getItem(id);return {start:item.plannedStartAt,due:item.dueAt,duration:item.plannedDurationDays,baseline:item.baselineDueAt,owner:item.ownerId,targetStart:item.targetStartAt,targetDue:item.targetDueAt};},root.id);
  const formError=await page.locator("#panelError").count()?await page.locator("#panelError").innerText():"";
  const notification=await page.locator("#noticeRoot").innerText();
  assert.equal(after.owner,"u_enrique","parent save did not persist. error="+formError+" notice="+notification);
  assert.equal(after.targetStart,"2026-10-21");
  assert.equal(after.targetDue,"2026-11-01");
  assert.equal(after.baseline,before.baseline);
  assert.equal(after.start,before.start);
  assert.equal(after.due,before.due);
  assert.equal(after.duration,before.duration);

  // Selected item and scroll offsets persist through rerenders.
  await page.locator("#panelRoot button[data-action='close-panel']").click();
  const scrollBefore=await page.locator(".prd41-pane--gantt .gantt-scroll").evaluate(el=>{el.scrollLeft=120;return el.scrollLeft;});
  assert.ok(scrollBefore>20);
  await page.locator('[data-pane-focus="graph"]').click();
  await page.locator('[data-pane-focus="graph"]').click();
  await page.locator("#showSubitems").uncheck();
  const scrollAfter=await page.locator(".prd41-pane--gantt .gantt-scroll").evaluate(el=>el.scrollLeft);
  assert.ok(Math.abs(scrollAfter-scrollBefore)<5,"Gantt scroll preserved: "+scrollBefore+" "+scrollAfter);
  await page.locator("#showSubitems").check();

  // Animation, TI connector and hierarchy remain intact in the integrated workspace.
  await page.locator("#scopeSelect").selectOption(root.id);
  await page.locator('[data-pane-focus="graph"]').click();
  await page.locator('[data-action="propagate"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-action="pause-animation"]').click();
  await page.locator('[data-action="restart-animation"]').click();
  const fromId=child.id,toId=newChildren.find(x=>x.title==="Mobilização Atlas").id;
  await page.locator('[data-node="'+fromId+'"] .graph-connector').scrollIntoViewIfNeeded();
  const coords=await page.evaluate(({fromId,toId})=>{
    const a=document.querySelector('[data-node="'+fromId+'"] .graph-connector').getBoundingClientRect();
    const b=document.querySelector('[data-node="'+toId+'"] .node-circle').getBoundingClientRect();
    return {from:{x:(a.left+a.right)/2,y:(a.top+a.bottom)/2},to:{x:(b.left+b.right)/2,y:(b.top+b.bottom)/2}};
  },{fromId,toId});
  await page.mouse.move(coords.from.x,coords.from.y);
  await page.mouse.down();
  await page.mouse.move(coords.to.x,coords.to.y,{steps:12});
  await page.mouse.up();
  await page.waitForTimeout(150);
  const relation=await page.evaluate(({fromId,toId})=>state.relations.find(r=>r.sourceId===fromId&&r.targetId===toId&&r.relationType==="TI")?.id||"",{fromId,toId});
  assert.ok(relation,"TI created by drag in compact graph");
  await page.locator('[data-edge="'+relation+'"]').focus();
  await page.keyboard.press("Enter");await page.keyboard.press("Delete");
  assert.equal(await page.evaluate(id=>state.relations.some(r=>r.id===id),relation),false,"Delete preserved");
  await page.locator('[data-pane-focus="graph"]').click();
  assert.deepEqual(errors,[],"No browser JS errors");
  console.log("PRD4.2 smoke OK: viewport, contextual root/child and bulk creation, parent meta and owner, scroll, animation, TI.");
}finally{await browser.close();}
