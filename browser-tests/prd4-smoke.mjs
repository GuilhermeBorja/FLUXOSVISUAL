import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("http://127.0.0.1:8080",{waitUntil:"networkidle"});
  await page.evaluate(()=>{
    const seed=seedState();
    seed.setupComplete=true;
    seed.currentUserId="u_luis";
    localStorage.setItem("fluxosVisualState.prd4",JSON.stringify(seed));
  });
  await page.reload({waitUntil:"networkidle"});
  await page.locator(".ops-shell").waitFor();
  assert.equal(await page.getByRole("tab",{name:/Sintética/}).count(),1);
  assert.equal(await page.getByRole("tab",{name:/Analítica/}).count(),1);
  assert.equal(await page.getByRole("tab",{name:/Gantt/}).count(),1);
  const form=page.locator("#prd4QuickCreate");
  await form.locator('[name="title"]').fill("PRD4 Cadastro direto");
  await form.locator("summary").click();
  await form.locator('[name="additionalTitles"]').fill("PRD4 Item em lote");
  await form.locator('[type="submit"]').click();
  await page.getByText("2 item(ns) criado(s).").waitFor();
  assert.equal(await page.locator("tr[data-row]").count()>0,true);
  assert.equal(await page.evaluate(()=>state.items.some(item=>item.title==="PRD4 Item em lote")),true);
  await page.getByRole("tab",{name:/Analítica/}).click();
  await page.locator(".graph-connector").first().waitFor();
  assert.equal(await page.locator(".graph-connector").count()>0,true);
  // Isolate a small graph with two leaves and exercise true pointer linking.
  const ids=await page.evaluate(()=>{
    const base={type:"task",status:"backlog",ownerId:"u_luis",organizationId:"org_castro",
      sectorId:"sec_pmo",state:"PE",plannedStartAt:"2026-10-20",plannedDurationDays:2};
    const root=createItem({...base,type:"process",title:"PRD4 Fluxo smoke"});
    const first=createItem({...base,title:"PRD4 Primeiro",parentId:root.id});
    const second=createItem({...base,title:"PRD4 Segundo",parentId:root.id});
    ui.scopeId=root.id;ui.selectedItemId="";ui.overviewMode="graph";render();
    return {root:root.id,first:first.id,second:second.id};
  });
  await page.locator('[data-node="'+ids.first+'"]').waitFor();
  const coords=await page.evaluate(({first,second})=>{
    const from=document.querySelector('[data-node="'+first+'"] .graph-connector').getBoundingClientRect();
    const target=document.querySelector('[data-node="'+second+'"] .node-circle').getBoundingClientRect();
    return {from:{x:(from.left+from.right)/2,y:(from.top+from.bottom)/2},
      to:{x:(target.left+target.right)/2,y:(target.top+target.bottom)/2}};
  },ids);
  await page.mouse.move(coords.from.x,coords.from.y);
  await page.mouse.down();
  await page.mouse.move(coords.to.x,coords.to.y,{steps:12});
  await page.mouse.up();
  await page.waitForTimeout(250);
  const linkId=await page.evaluate(({first,second})=>
    state.relations.find(r=>r.sourceId===first&&r.targetId===second&&r.relationType==="TI")?.id||"",ids);
  if(!linkId){
    console.log("DEBUG TI:",JSON.stringify({coords,notice:await page.evaluate(()=>ui.notice), errors,
      rects:await page.evaluate(ids=>({source:document.querySelector('[data-node="'+ids.first+'"] .graph-connector')?.getBoundingClientRect().toJSON(),
      target:document.querySelector('[data-node="'+ids.second+'"] .node-circle')?.getBoundingClientRect().toJSON(),
      view:document.querySelector("#graphCanvas")?.getBoundingClientRect().toJSON(),
      scene:document.querySelector(".graph-scene")?.getAttribute("transform"),
      relations:state.relations.filter(r=>r.sourceId===ids.first || r.targetId===ids.second).map(r=>[r.sourceId,r.targetId,r.relationType])}),ids)}));
  }
  assert.ok(linkId,"dragging the connector should create a TI link");
  const rel=page.locator('[data-edge="'+linkId+'"]');
  await rel.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(id=>state.relations.some(r=>r.id===id),linkId),false);
  await page.locator('[data-action="propagate"]').click();
  await page.waitForTimeout(110);
  assert.ok(await page.locator(".propagation-active").count()>0);
  await page.locator('[data-action="pause-animation"]').click();
  await page.locator('[data-action="restart-animation"]').click();
  await page.getByRole("tab",{name:/Gantt/}).click();
  await page.locator(".gantt-item").first().waitFor();
  assert.deepEqual(errors,[],"No runtime page errors");
  console.log("PRD4 smoke: quick create, batch, graph connectors, TI Delete, animation and views OK");
} finally {await browser.close();}
