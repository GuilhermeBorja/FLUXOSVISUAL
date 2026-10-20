import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1366,height:768}});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("http://127.0.0.1:8080",{waitUntil:"networkidle"});
  await page.evaluate(()=>{
    const seed=seedState();seed.setupComplete=true;seed.currentUserId="u_luis";
    // Isolar a arvore de teste da estrutura demonstrativa do seed.
    seed.items=[];seed.relations=[];seed.events=[];
    localStorage.setItem("fluxosVisualState.prd4",JSON.stringify(seed));
  });
  await page.reload({waitUntil:"networkidle"});
  await page.evaluate(()=>{
    const base={status:"backlog",ownerId:"u_luis",type:"task",organizationId:"org_castro",sectorId:"sec_pmo",state:"PE",plannedStartAt:today(),plannedDurationDays:3};
    const p=createItem({...base,type:"project",title:"Projeto alfa"});
    const a=createItem({...base,title:"Atividade A",parentId:p.id});
    const b=createItem({...base,title:"Atividade B",parentId:p.id});
    const q=createItem({...base,type:"project",title:"Projeto beta"});
    const c=createItem({...base,title:"Atividade C",parentId:q.id});
    createRelation(a.id,c.id,"TI");
    ui.scopeId="all";ui.showSubitems=true;ui.collapsed=new Set();
    state.filters.query="";
    saveState();render();
    window.prd44TestIds={p:p.id,a:a.id,b:b.id,q:q.id,c:c.id};
  });
  const ids=await page.evaluate(()=>window.prd44TestIds);
  assert.equal(await page.locator(".prd41-pane--graph [data-node]").count(),5);
  assert.equal(await page.locator(".prd41-pane--gantt [data-gantt-row]").count(),5);
  // Pendencias proximas, sem atraso, devem continuar cinza.
  assert.equal(await page.locator('[data-node="'+ids.b+'"] .node-circle').getAttribute("stroke"),"#596872");

  await page.locator('[data-action="toggle-subitems"]').click();
  assert.equal(await page.locator("[data-row]").count(),2);
  assert.equal(await page.locator("[data-gantt-row]").count(),2);
  assert.equal(await page.locator("#graphCanvas [data-node]").count(),2);
  assert.equal(await page.locator("#graphCanvas [data-edge]").count(),1,"external TI remains as representative connection");
  const projectedEdge=await page.locator("#graphCanvas [data-edge]").first().getAttribute("data-edge");
  assert.ok(projectedEdge);
  // Toggle only the alpha process in graph, synchronize table and gantt.
  const toggle=page.locator('[data-node="'+ids.p+'"] [data-graph-expand]');
  await toggle.dispatchEvent("pointerdown",{button:0,pointerId:3,clientX:10,clientY:10});
  assert.equal(await page.locator("#graphCanvas [data-node]").count(),4);
  assert.equal(await page.locator("[data-row]").count(),4);
  assert.equal(await page.locator("[data-gantt-row]").count(),4);
  assert.equal(await page.locator('[data-node="'+ids.q+'"]').count(),1);
  assert.equal(await page.locator('[data-node="'+ids.c+'"]').count(),0);
  await page.locator('[data-node="'+ids.p+'"] [data-graph-expand]').dispatchEvent("pointerdown",{button:0,pointerId:4,clientX:10,clientY:10});
  assert.equal(await page.locator("#graphCanvas [data-node]").count(),2);

  // Verifica dimensoes sem rolagem horizontal por breakpoint.
  for(const width of [1600,1366,1024,768,600,390]) {
    await page.setViewportSize({width,height:768});
    await page.waitForTimeout(80);
    const results=await page.evaluate(()=>{
      const candidates=[document.documentElement,document.body,
        document.querySelector(".prd41-workspace-viewport"),
        document.querySelector(".synth-table-wrap"),
        document.querySelector(".gantt-scroll")].filter(Boolean);
      return candidates.map(el=>({selector:el.className||el.tagName,client:el.clientWidth,scroll:el.scrollWidth,overflow:getComputedStyle(el).overflowX}));
    });
    assert.ok(results.every(r=>r.scroll<=r.client+3 || ["hidden","clip"].includes(r.overflow)),
      "horizontal overflow at "+width+": "+JSON.stringify(results));
    assert.ok(await page.locator("#graphCanvas").isVisible());
  }

  await page.setViewportSize({width:1366,height:768});
  await page.locator('[data-action="create"]').click();
  await page.locator("#createItemForm [name=title]").fill("Projeto compacto completo");
  await page.locator("#prd43PasteActivities").fill("Etapa 1\nEtapa 2\nEtapa 3\nEtapa 4\nEtapa 5");
  assert.equal(await page.locator(".prd43-step-row").count(),5);
  const layout=await page.evaluate(()=>{
    const drawer=document.querySelector(".drawer"),form=document.querySelector("#createItemForm"),button=form.querySelector('[type=submit]'),
      rect=button.getBoundingClientRect();
    return {buttonBottom:rect.bottom,buttonTop:rect.top,drawerScroll:drawer.scrollHeight-drawer.clientHeight,formScroll:form.scrollHeight-form.clientHeight};
  });
  assert.ok(layout.buttonBottom<=768&&layout.buttonTop>=0,"save visible without drawer scroll: "+JSON.stringify(layout));
  assert.ok(layout.drawerScroll<=3&&layout.formScroll<=3,"no form-level scrolling: "+JSON.stringify(layout));
  await page.locator('#panelRoot .drawer-header button[data-action="close-panel"]').click();

  // Reabrir todos os ramos para validar a conexão no próprio Gantt.
  await page.evaluate(()=>{ui.showSubitems=true;ui.collapsed=new Set();render();});
  await page.locator('[data-pane-focus="gantt"]').click();
  const handle=page.locator('[data-gantt-handle="'+ids.b+'"]');
  await handle.scrollIntoViewIfNeeded();
  await handle.click();
  assert.equal(await page.locator("#prd44TiDestination").count(),1,"clicking the handle must open target selection");
  await page.locator("#prd44TiDestination").selectOption(ids.c);
  await page.locator('[data-action="prd44-confirm-ti"]').click();
  assert.ok(await page.evaluate(({b,c})=>state.relations.some(r=>r.relationType==="TI"&&r.sourceId===b&&r.targetId===c),ids));
  assert.equal(await page.locator('[data-action="prd43-undo"]').count(),1);
  await page.locator('[data-action="prd43-undo"]').click();
  assert.ok(!await page.evaluate(({b,c})=>state.relations.some(r=>r.relationType==="TI"&&r.sourceId===b&&r.targetId===c),ids));
  assert.deepEqual(errors,[],"browser page errors");
  console.log("PRD4.3 layout smoke: graph collapse and external TI, 6 breakpoints without X scrolling, save visible, click-to-create TI OK");
} finally {await browser.close();}
