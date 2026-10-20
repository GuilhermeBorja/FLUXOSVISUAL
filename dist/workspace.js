let graphInstance = null;
let returnFocus = null;
ui.positions = state.graphPositions || {};

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function accessibleItems() {
  return state.items.filter((item) => canViewItem(currentUser(), item));
}

function rootOf(item) {
  const byId = new Map(accessibleItems().map((entry) => [entry.id, entry]));
  return FluxosGraph.projectRoot(item, byId);
}

function scopedItems() {
  return visibleItems().filter((item) => ui.scopeId === "all" || rootOf(item).id === ui.scopeId);
}

function relationsFor(items) {
  const ids = new Set(items.map((item) => item.id));
  return state.relations.filter((rel) => ids.has(rel.sourceId) && ids.has(rel.targetId));
}
function prd44GraphProjection(items){
  // A mesma arvore visivel da Sintetica e do Gantt determina os nos do grafo.
  const shown=tableRows(items).map(row=>row.item);
  const visible=new Set(shown.map(item=>item.id));
  const byId=new Map(items.map(item=>[item.id,item]));
  function representative(id){
    let cursor=byId.get(id),seen=new Set();
    while(cursor && !visible.has(cursor.id) && !seen.has(cursor.id)){
      seen.add(cursor.id);cursor=byId.get(cursor.parentId);
    }
    return cursor && visible.has(cursor.id)?cursor.id:"";
  }
  const relations=[];
  for(const rel of relationsFor(items)){
    const src=representative(rel.sourceId),dst=representative(rel.targetId);
    if(!src||!dst||src===dst)continue;
    if(rel.relationType==="contains" && (src!==rel.sourceId || dst!==rel.targetId))continue;
    relations.push(src===rel.sourceId&&dst===rel.targetId?rel:{...rel,sourceId:src,targetId:dst,prd44Projected:true});
  }
  return {nodes:shown,relations};
}
function prd44ToggleHierarchy(id){
  const parent=getItem(id);
  if(!parent || !state.items.some(child=>child.parentId===id&&!child.archivedAt))return;
  ui.collapsed ||= new Set();
  if(!ui.showSubitems){
    ui.showSubitems=true;
    // Globalmente recolhido: expandir somente o ramo escolhido.
    ui.collapsed=new Set(scopedItems().filter(item=>state.items.some(child=>child.parentId===item.id&&!child.archivedAt)).map(item=>item.id));
    ui.collapsed.delete(id);
  }else if(ui.collapsed.has(id))ui.collapsed.delete(id);
  else ui.collapsed.add(id);
  render();
}

function childrenOf(id) {
  return accessibleItems().filter((item) => item.parentId === id);
}

function shortId(item) {
  const rows = tableRows(scopedItems());
  const index = rows.findIndex((entry) => entry.item.id === item.id);
  return `#${String((index >= 0 ? index : state.items.indexOf(item)) + 1).padStart(3, "0")}`;
}

function elapsedLabel(item) {
  const end = item.completedAt || nowIso();
  const minutes = Math.max(0, Math.floor((new Date(end) - new Date(item.createdAt)) / 60000));
  return durationFromMinutes(minutes);
}

function durationFromMinutes(minutes) {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes % 1440 / 60);
  return `${days ? `${days}d ` : ""}${hours ? `${hours}h ` : ""}${minutes % 60}min`;
}

function ownerElapsedLabel(item) {
  const assignment = (state.events || []).filter((event) => event.itemId === item.id && event.eventType === "owner_changed" && event.toValue === item.ownerId).sort((a,b) => new Date(b.effectiveAt || b.createdAt) - new Date(a.effectiveAt || a.createdAt))[0];
  const start = assignment?.effectiveAt || assignment?.createdAt || item.createdAt;
  const end = item.completedAt || nowIso();
  const minutes = Math.max(0,Math.floor((new Date(end) - new Date(start)) / 60000));
  return durationFromMinutes(minutes);
}

function activityDurationLabel(item) {
  const minutes = activityDurationMinutes(item);
  if (minutes === null) return state.relations.some((relation) => relation.targetId === item.id && relation.relationType === "TI") ? "Aguardando dependências" : "Não iniciada";
  return durationFromMinutes(minutes);
}

function prd43ProgressBasis(item){
  const leaves=[],seen=new Set(),queue=[item.id];let hasChildren=false;
  while(queue.length){
    const root=queue.shift();
    for(const child of state.items){
      if(child.parentId!==root||child.archivedAt||seen.has(child.id))continue;
      seen.add(child.id);hasChildren=true;
      const kids=state.items.some(grand=>grand.parentId===child.id&&!grand.archivedAt);
      if(kids)queue.push(child.id);else if(child.status!=="cancelled")leaves.push(child);
    }
  }
  if(!hasChildren)return "";
  const weight=leaves.reduce((sum,leaf)=>sum+Math.max(0,Number(leaf.weight??1)||0),0);
  return leaves.length+" atividade"+(leaves.length===1?"":"s")+" final"+(leaves.length===1?"":"is")+" · média ponderada (peso total "+weight.toLocaleString("pt-BR")+")";
}
function progressCell(item){
  if(item.progressPercent==null)return '<span class="progress-unavailable" title="Sem atividades elegíveis para consolidar">—</span>';
  const value=Math.max(0,Math.min(100,Number(item.progressPercent||0))),basis=prd43ProgressBasis(item);
  return `<div class="progress-cell prd43-progress-cell" role="img" title="${escapeHtml(basis||"Percentual informado para a atividade")}" aria-label="${value}% concluído${basis?" · "+escapeHtml(basis):""}"><span class="progress-track"><span style="width:${value}%"></span></span><strong>${value}%</strong></div>`;
}

function plannedLabel(item) {
  if (!item.plannedStartAt || !item.dueAt) return "Sem dura\u00e7\u00e3o";
  return itemDurationDays(item) + "d previstos";
}

function statusDisplayLabel(item) { if (item?.type === "approval" && item.status === "under_review") return "Aguardando decisão"; if (item?.type === "approval" && item.status === "correction") return "Correção solicitada"; return labelOf(statusCatalog,item?.status); }

// Identificação do build, gravada em dist/version.js pelo `npm run build`. Sem build (arquivos servidos
// direto da pasta), exibe "desenvolvimento" para deixar claro que não é uma versão publicada.
function buildLabel() {
  const info = typeof FLUXO_BUILD !== "undefined" ? FLUXO_BUILD : null;
  if (!info) return "Versão de desenvolvimento (sem build)";
  const when = new Date(info.builtAt);
  return `Versão ${info.version} · build ${info.build}${Number.isFinite(when.getTime()) ? ` · ${when.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}` : ""}`;
}

function signalLabel(item) {
  const alerts=prd43DescendantAlerts(item);
  if(isBlocked(item))return "Bloqueado";
  if(alerts.blocked)return statusDisplayLabel(item)+" · "+alerts.blocked+" bloqueado(s)";
  if(item?.inheritedBlockedFrom?.length)return statusDisplayLabel(item)+" · impedimento";
  if(isOverdue(item)||alerts.late)return statusDisplayLabel(item)+" · prazo em atraso";
  if(alerts.approvals)return statusDisplayLabel(item)+" · aprovação pendente";
  if(isAtRisk(item)||alerts.risk)return statusDisplayLabel(item)+" · risco";
  return statusDisplayLabel(item);
}

const prd43Colors={gray:"#596872",blue:"#238254",green:"#115e38",yellow:"#9f6a00",red:"#b42332"};
const statusDefaults={
  backlog:{icon:"list-todo",color:prd43Colors.gray},ready:{icon:"circle-play",color:prd43Colors.blue},
  in_progress:{icon:"loader-circle",color:prd43Colors.blue},waiting:{icon:"clock-3",color:prd43Colors.yellow},
  blocked:{icon:"ban",color:prd43Colors.red},under_review:{icon:"stamp",color:prd43Colors.yellow},
  correction:{icon:"wrench",color:prd43Colors.yellow},done:{icon:"check-circle-2",color:prd43Colors.green},
  cancelled:{icon:"circle-x",color:prd43Colors.gray}
};
function statusConfig(id){
  const signal=id==="blocked"?"red":id==="done"?"green":["in_progress","ready"].includes(id)?"blue":["waiting","under_review","correction"].includes(id)?"yellow":"gray";
  return {...(statusDefaults[id]||{icon:"circle-help"}),...(state.statusSettings?.[id]||{}),color:prd43Colors[signal]};
}
// R2-14: "Em análise" e "Em correção" ficam fora das escolhas comuns, mas um registro que já
// está em um desses estados precisa continuar representável; sem isso o seletor cairia na
// primeira opção e a gravação alteraria o status sem que o usuário percebesse.
function statusChoices(currentStatus) { return statusCatalog.filter((status) => !["under_review","correction"].includes(status.id) || status.id === currentStatus); }
function statusOption(status, selected = false) { return `<option value="${escapeHtml(status.id)}" style="color:${escapeHtml(statusConfig(status.id).color)}" ${selected ? "selected" : ""}>${escapeHtml(status.label)}</option>`; }

function statusBadge(item){
  const signal=signalOf(item),config=statusConfig(item.status),delta=dueDeltaDays(item);
  const alerts=prd43DescendantAlerts(item),flags=[];
  if(alerts.blocked)flags.push(alerts.blocked+" bloqueado"+(alerts.blocked===1?"":"s"));
  if(alerts.late)flags.push(alerts.late+" atrasado"+(alerts.late===1?"":"s"));
  if(alerts.approvals)flags.push(alerts.approvals+" aprovação pendente");
  if(!flags.length&&item.inheritedBlockedFrom?.length)flags.push("impedimento herdado");
  if(!flags.length&&isOverdue(item))flags.push(Math.abs(delta)+"d de atraso");
  if(!flags.length&&isAtRisk(item))flags.push("risco");
  const detail=flags.length?`<span class="prd43-status-alert" title="${escapeHtml(alerts.source||flags.join(" · "))}">${escapeHtml(flags.join(" · "))}</span>`:"";
  return `<span class="status-badge ${signal}" style="--status-color:${escapeHtml(prd43Colors[signal])}" title="${escapeHtml(signalLabel(item))}"><span class="status-symbol">${icon(config.icon)}</span><span class="prd43-status-name">${escapeHtml(statusDisplayLabel(item))}</span>${detail}</span>`;
}
function dateCell(value, withTime = false) {
  if (!value) return "—";
  return withTime ? formatDateTime(value) : formatDate(value.slice(0, 10));
}

function filterCount() {
  return [state.filters.status, state.filters.indicator, state.filters.type, state.filters.owner, state.filters.organization, state.filters.sector, state.filters.state].filter((value) => value && value !== "all").length;
}

function projectOptions() {
  const roots = new Map();
  accessibleItems().forEach((item) => { const root = rootOf(item); roots.set(root.id, root); });
  return [...roots.values()];
}

function itemContextLabel(item) {
  const root = rootOf(item);
  return `${orgName(item.organizationId)} · ${root.title || item.title} · ${item.title} (${shortId(item)})`;
}

function noticeMarkup() {
  if (!ui.notice) return "";
  const undo=ui.prd43Undo && ui.noticeKind!=="error"
    ? '<button type="button" class="button quiet prd43-undo-button" data-action="prd43-undo">Desfazer</button>' : "";
  return `<div class="notice ${ui.noticeKind === "error" ? "error" : ""} prd43-notice" role="${ui.noticeKind === "error" ? "alert" : "status"}">${escapeHtml(ui.notice)}${undo}<button class="icon-button" data-action="dismiss-notice" aria-label="Fechar aviso">${icon("x")}</button></div>`;
}

let prd44NoticeTimer=null;
function notify(message, kind = "success") {
  ui.notice=message;ui.noticeKind=kind;
  if(kind==="error")ui.prd43Undo=null;
  if(prd44NoticeTimer){clearTimeout(prd44NoticeTimer);prd44NoticeTimer=null;}
  const target=document.querySelector("#noticeRoot");
  if(target){target.innerHTML=noticeMarkup();mountIcons();}
  // Desfazer permanece acessivel durante tempo suficiente sem ocupar o layout.
  prd44NoticeTimer=setTimeout(()=>{
    if(ui.notice===message){
      ui.notice="";ui.prd43Undo=null;
      const notice=document.querySelector("#noticeRoot");if(notice)notice.innerHTML="";
    }
    prd44NoticeTimer=null;
  },ui.prd43Undo?9500:kind==="error"?7000:4500);
}

function mountIcons() {
  if (typeof FluxosVendor !== "undefined") FluxosVendor.mountIcons();
}


/* PRD4.1: uma area com tres perspectivas independentes, sem recriar o grafo ao redimensionar. */
let prd41PaneWidths = null;
let prd41PaneUser = "";
let prd41FocusedPane = "";
function prd41LoadPaneWidths() {
  const key = "fluxosVisual.panes.prd41." + currentUser().id;
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    if (data && ["table","graph","gantt"].every(name => Number.isFinite(data[name]) && data[name] >= 12 && data[name] <= 75)
        && Math.abs(data.table + data.graph + data.gantt - 100) < .2) return data;
  } catch {}
  return {table:0,graph:38,gantt:62};
}
function prd41SavePaneWidths() {
  try { localStorage.setItem("fluxosVisual.panes.prd41." + currentUser().id, JSON.stringify(prd41PaneWidths)); } catch {}
}
function prd41ApplyPaneLayout() {
  const container = document.querySelector(".prd41-workspace");
  if (!container || !prd41PaneWidths) return;
  if(container.classList.contains("prd5-two-pane")){container.classList.toggle("is-focused",!!prd41FocusedPane);container.dataset.focus=prd41FocusedPane||"all";container.querySelectorAll(".prd41-pane").forEach(el=>el.classList.toggle("is-focus-target",el.dataset.pane===prd41FocusedPane));container.querySelectorAll("[data-pane-focus]").forEach(el=>{const selected=el.dataset.paneFocus===prd41FocusedPane;el.setAttribute("aria-pressed",String(selected));el.setAttribute("title",selected?"Restaurar painéis":"Maximizar painel");el.setAttribute("aria-label",selected?"Restaurar painéis":"Maximizar "+el.dataset.paneFocus);el.innerHTML=selected?'<span aria-hidden="true">▣</span>':'<span aria-hidden="true">□</span>';});requestAnimationFrame(prd43DrawGanttRelations);return;}
  const values = prd41PaneWidths;
  container.style.setProperty("--pane-table", values.table + "fr");
  container.style.setProperty("--pane-graph", values.graph + "fr");
  container.style.setProperty("--pane-gantt", values.gantt + "fr");
  container.classList.toggle("is-focused", !!prd41FocusedPane);
  container.dataset.focus = prd41FocusedPane || "all";
  container.querySelectorAll(".prd41-pane").forEach(element => element.classList.toggle("is-focus-target", element.dataset.pane === prd41FocusedPane));
  container.querySelectorAll("[data-pane-focus]").forEach(button => {
    const selected = button.dataset.paneFocus === prd41FocusedPane;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("title", selected ? "Restaurar tres visualizacoes" : "Maximizar esta visualizacao");
    button.setAttribute("aria-label", selected ? "Restaurar tres visualizacoes" : "Maximizar " + button.dataset.paneFocus);
    button.innerHTML = selected ? '<span aria-hidden="true">▣</span>' : '<span aria-hidden="true">□</span>';
  });
  container.querySelectorAll("[data-pane-split]").forEach(separator => {
    const side = separator.dataset.paneSplit === "table-graph" ? "table" : "graph";
    separator.setAttribute("aria-valuenow", String(Math.round(values[side])));
  });
  requestAnimationFrame(() => applyTableColumnLayout());
}
function prd41UpdateWidths(split,deltaPx) {
  if (!prd41PaneWidths) return false;
  if(split==="gantt-graph")return prd5ResizePanes(deltaPx);
  const container = document.querySelector(".prd41-workspace");
  if (!container || prd41FocusedPane) return false;
  const available = container.getBoundingClientRect().width - 20;
  if (available < 1) return false;
  const first = split === "table-graph" ? "table" : "graph";
  const second = split === "table-graph" ? "graph" : "gantt";
  const minimum = {table:215,graph:245,gantt:250};
  const minA = minimum[first] / available * 100;
  const minB = minimum[second] / available * 100;
  const before = prd41PaneWidths[first];
  const next = Math.min(before + prd41PaneWidths[second] - minB, Math.max(minA,before + deltaPx / available * 100));
  if (Math.abs(next - before) < .001) return false;
  prd41PaneWidths[first] = Math.round(next * 10) / 10;
  prd41PaneWidths[second] = Math.round((prd41PaneWidths[second] + before - prd41PaneWidths[first]) * 10) / 10;
  prd41ApplyPaneLayout();
  return true;
}
let prd5GanttWidth=62;
function prd5ResizePanes(delta){
  const el=document.querySelector(".prd5-two-pane");if(!el||prd41FocusedPane)return false;
  const width=el.getBoundingClientRect().width;if(width<200)return false;
  prd5GanttWidth=Math.max(35,Math.min(80,prd5GanttWidth+delta/width*100));
  el.style.setProperty("--prd5-gantt-width",prd5GanttWidth+"%");
  return true;
}
function prd41BindSplitters() {
  document.querySelectorAll("[data-pane-split]").forEach(separator => {
    separator.addEventListener("pointerdown", event => {
      if (event.button !== 0 || prd41FocusedPane) return;
      event.preventDefault();
      const container = document.querySelector(".prd41-workspace");
      if (!container) return;
      const start = event.clientX;
      const initial = {...prd41PaneWidths};
      separator.setPointerCapture(event.pointerId);
      separator.classList.add("is-dragging");
      document.body.classList.add("prd41-resizing");
      const move = e => {
        if (e.pointerId !== event.pointerId) return;
        prd41PaneWidths = {...initial};
        prd41UpdateWidths(separator.dataset.paneSplit, e.clientX - start);
      };
      const end = e => {
        if (e.pointerId !== event.pointerId) return;
        separator.removeEventListener("pointermove",move);
        separator.removeEventListener("pointerup",end);
        separator.removeEventListener("pointercancel",end);
        separator.classList.remove("is-dragging");
        document.body.classList.remove("prd41-resizing");
        if (separator.hasPointerCapture(e.pointerId)) separator.releasePointerCapture(e.pointerId);
        prd41SavePaneWidths();
      };
      separator.addEventListener("pointermove",move);
      separator.addEventListener("pointerup",end);
      separator.addEventListener("pointercancel",end);
    });
    separator.addEventListener("keydown", event => {
      if (!["ArrowLeft","ArrowRight","Home"].includes(event.key)) return;
      event.preventDefault();
      if (event.key === "Home") {
        prd41PaneWidths = {table:34,graph:36,gantt:30};
        prd41ApplyPaneLayout();
      } else prd41UpdateWidths(separator.dataset.paneSplit,event.key === "ArrowRight" ? 24 : -24);
      prd41SavePaneWidths();
    });
  });
}
function prd44PaneToolbar(id,items){
  if(id==="table"){
    const rows=tableRows(items),selected=rows.filter(row=>ui.bulkSelected?.has(row.item.id)).length;
    return `<label class="prd44-toolbar-select" title="Selecionar todos os itens visíveis"><input type="checkbox" id="selectAllRows" ${rows.length&&selected===rows.length?"checked":""}/> Todos</label>
      <button class="prd44-small-control" type="button" data-action="toggle-bulk" ${selected?"":"disabled"} title="Editar itens selecionados">Lote${selected?" "+selected:""}</button>`;
  }
  if(id==="graph"){
    return `<button class="prd44-small-control prd44-play" data-action="propagate" title="Reproduzir sequência" aria-label="Reproduzir sequência">${icon("play")}</button>
      <button class="prd44-small-control" data-action="pause-animation" title="Pausar" aria-label="Pausar animação">${icon("pause")}</button>
      <details class="prd44-pane-options"><summary aria-label="Ferramentas do grafo" title="Ferramentas do grafo">${icon("sliders-horizontal")}</summary>
        <div class="prd44-options-menu">
          <div class="prd44-zoom-controls">
            <button class="icon-button" data-action="zoom-out" title="Diminuir zoom">${icon("zoom-out")}</button>
            <span id="zoomLabel">100%</span>
            <button class="icon-button" data-action="zoom-in" title="Aumentar zoom">${icon("zoom-in")}</button>
            <button class="icon-button" data-action="fit-graph" title="Enquadrar grafo">${icon("maximize")}</button>
            <button class="icon-button" data-action="reset-layout" title="Reorganizar nós">${icon("rotate-ccw")}</button>
          </div>
          <button class="button quiet" data-action="restart-animation">${icon("rotate-ccw")} Reiniciar animação</button>
          <label>Agrupar por<select id="groupingSelect">${[{id:"project",label:"Projeto / processo"},{id:"owner",label:"Responsável"},{id:"organization",label:"Empresa"},{id:"connections",label:"Itens conectados"}].map(entry=>option(entry.id,entry.label,ui.grouping===entry.id)).join("")}</select></label>
          <label>Apresentação<select id="animationLayout"><option value="sequential">Sequencial</option><option value="parallel">Paralela</option></select></label>
          <label>Análise<select id="animationMode"><option value="full">Percurso completo</option><option value="blocker">Até o bloqueio</option></select></label>
          ${ui.lastDeletedRelation?`<button class="button quiet" data-action="undo-relation">Desfazer TI</button>`:""}
        </div>
      </details>`;
  }
  return `<details class="prd44-pane-options"><summary aria-label="Configurações do Gantt" title="Configurações do Gantt">${icon("settings-2")}</summary>
    <div class="prd44-options-menu prd44-gantt-settings">
      ${canManageGpo(currentUser())?`<label>Limite de risco (dias)<input id="riskThresholdDays" type="number" min="1" max="60" step="1" value="${Math.max(1,Math.min(60,Number(state.riskThresholdDays)||3))}"/></label>`:""}
      <p>Arraste a extremidade de uma barra para criar TI; ou clique no círculo e escolha o destino.</p>
    </div>
  </details>`;
}
function renderPrd41Workspace(items) {
  const pane=(id,label,subtitle,content)=>`<section class="prd41-pane prd41-pane--${id} ${prd41FocusedPane===id?"is-focus-target":""}" data-pane="${id}" aria-label="${label}">
    <header class="prd41-pane-heading prd44-pane-heading"><strong>${label}</strong>
      <div class="prd44-pane-actions">${prd44PaneToolbar(id,items)}
        <button type="button" class="prd41-focus-button" data-pane-focus="${id}" aria-label="Maximizar ${label}" aria-pressed="${prd41FocusedPane===id}">${icon(prd41FocusedPane===id?"minimize-2":"maximize-2")}</button>
      </div></header>
    <div class="prd41-pane-body">${content}</div></section>`;
  return `<div class="prd41-workspace-viewport prd5-two-pane-viewport"><div class="prd41-workspace prd5-two-pane ${prd41FocusedPane?"is-focused":""}" data-focus="${prd41FocusedPane||"all"}">
    ${pane("gantt","Gantt estruturado","Hierarquia, dados e prazos",renderGantt(items))}
    <div class="prd41-splitter" role="separator" tabindex="0" data-pane-split="gantt-graph" aria-label="Redimensionar Gantt e Analítica" aria-orientation="vertical"><span aria-hidden="true"></span></div>
    ${pane("graph","Grafo Analítico","Relações e animação",renderGraph(items))}
  </div></div>`;
}

function prd42CaptureWorkspaceScroll() {
  const workspace=document.querySelector(".prd41-workspace");
  if (!workspace) return null;
  const captured={pageY:window.scrollY||0,panes:{}};
  workspace.querySelectorAll(".prd41-pane").forEach(pane=>{
    const key=pane.dataset.pane,body=pane.querySelector(".prd41-pane-body");
    const inner=pane.querySelector(".synth-table-wrap,.gantt-scroll");
    captured.panes[key]={top:body?.scrollTop||0,left:body?.scrollLeft||0,innerLeft:inner?.scrollLeft||0,innerTop:inner?.scrollTop||0};
  });
  return captured;
}
function prd42RestoreWorkspaceScroll(captured) {
  if(!captured)return;
  document.querySelectorAll(".prd41-pane").forEach(pane=>{
    const previous=captured.panes[pane.dataset.pane];if(!previous)return;
    const body=pane.querySelector(".prd41-pane-body"),inner=pane.querySelector(".synth-table-wrap,.gantt-scroll");
    if(body){body.scrollTop=previous.top;body.scrollLeft=previous.left;}
    if(inner){inner.scrollLeft=previous.innerLeft;inner.scrollTop=previous.innerTop;}
  });
  window.scrollTo(0,captured.pageY);
}
function render() {
  const prd42Scroll = prd42CaptureWorkspaceScroll();
  if (state.setupComplete === false) { renderMasterSetup(); return; }
  if (graphInstance) { ui.graphTransform = graphInstance.getTransform(); graphInstance.destroy(); graphInstance = null; }
  if (!currentUser() || currentUser().disabled) {
    state.currentUserId = "";
    renderLogin();
    return;
  }
  const user = currentUser();
  if (prd41PaneUser !== user.id) { prd41PaneWidths = prd41LoadPaneWidths(); prd41PaneUser = user.id; prd41FocusedPane = ""; }
  const items = scopedItems();
  if (ui.selectedItemId && !canViewItem(user, getItem(ui.selectedItemId))) { ui.selectedItemId = ""; ui.panel = ""; }
  app.innerHTML = `
    <main class="ops-shell">
      <header class="ops-header">
        <div class="brand">${icon("workflow")}<span>FLUXO VISUAL</span></div>
        <div class="header-actions">
          <span class="user-identity"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(orgName(user.organizationId))} · GPO</span></span>
          <button class="icon-button" data-action="export" title="Exportar dados visíveis" aria-label="Exportar dados visíveis">${icon("download")}</button>
          <button class="button quiet" data-action="admin">${icon("settings-2")}<span>Cadastros e configurações</span></button>
          <button class="icon-button" data-action="logout" title="Sair" aria-label="Sair">${icon("log-out")}</button>
        </div>
      </header>
      <section class="workspace-heading">
        <div class="prd42-context-title"><h1>${escapeHtml(orgName(user.organizationId) === "-" ? "Organização" : orgName(user.organizationId))}</h1><span class="prd42-items-count">${items.length} ${items.length === 1 ? "item" : "itens"}</span></div>
        <div class="workspace-heading-actions">
          <button class="button quiet" data-action="templates">${icon("workflow")}Modelos</button>
          <button class="button primary" data-action="create" ${canCreateItem(user) ? "" : 'disabled title="Seu perfil GPO não permite criar itens neste contexto."'}>${icon("plus")}Novo item</button>
        </div>
      </section>
      ${!state.organizations.length ? `<section class="empty-state"><strong>Configure o workspace</strong><span>Cadastre a organização e ao menos um setor antes de criar itens ou usuários operacionais.</span><button class="button primary" data-action="configure-workspace">${icon("building-2")}Configurar organização</button></section>` : ""}
      <div id="noticeRoot">${noticeMarkup()}</div>
      <section class="workspace-controls" aria-label="Visualização e filtros">
        <span class="sr-only">Sintética, Analítica e Gantt integrados</span>
        <div class="view-filters">
          ${renderPrd4Overview(items)}
          <label class="search-box">${icon("search")}<input id="searchInput" type="search" placeholder="Buscar item ou responsável" value="${escapeHtml(state.filters.query)}" aria-label="Buscar item ou responsável"/></label>
          <select id="scopeSelect" aria-label="Projeto ou processo"><option value="all">Todos os processos</option>${projectOptions().map((item) => option(item.id, item.title, ui.scopeId === item.id)).join("")}</select>
          <button type="button" class="button quiet prd43-level-toggle" id="showSubitems" data-action="toggle-subitems" aria-pressed="${ui.showSubitems}" title="Expandir ou recolher níveis da hierarquia">${icon(ui.showSubitems?"list-collapse":"list-tree")}${ui.showSubitems?"Recolher níveis":"Expandir níveis"}</button>
          <button class="button quiet ${ui.filtersOpen ? "active" : ""}" data-action="filters" aria-expanded="${ui.filtersOpen}">${icon("sliders-horizontal")}Filtros${filterCount() ? `<span class="count-badge">${filterCount()}</span>` : ""}</button>
        </div>
      </section>
      ${ui.filtersOpen ? renderFilters() : ""}
      <section id="workspaceView" aria-label="Três visualizações sincronizadas">
        ${renderPrd41Workspace(items)}
      </section>
      <footer class="workspace-footer"><span class="build-label" data-build-label title="Identificação desta versão publicada">${escapeHtml(buildLabel())}</span></footer>
    </main>
    <div id="panelRoot"></div>`;
  bindWorkspace();
  renderPanel(false);
  if (items.length) mountGraph(items);
  prd43BindGantt();
  prd41BindSplitters();
  prd41ApplyPaneLayout();
  mountIcons();
  requestAnimationFrame(()=>prd42RestoreWorkspaceScroll(prd42Scroll));
}

function renderMasterSetup() {
  app.innerHTML = `<main class="login-screen"><section class="login-card">
    <div class="brand">${icon("workflow")}<span>FLUXO VISUAL</span></div>
    <h1>Criar usuário master</h1>
    <p>O workspace começará vazio. O master poderá cadastrar a organização, os setores e os demais usuários.</p>
    <form id="masterSetupForm" class="form-stack"><label>Nome do administrador<input name="name" required maxlength="120" autocomplete="name"/></label><label>E-mail<input name="email" type="email" required autocomplete="email"/></label><button class="button primary" type="submit">Criar usuário master</button></form>
    <div class="demo-note"><strong>Protótipo de validação</strong><span>Os dados permanecem neste navegador. Esta etapa não substitui autenticação segura no servidor.</span></div>
    <p class="build-label" data-build-label>${escapeHtml(buildLabel())}</p>
    </section></main>`;
  document.querySelector("#masterSetupForm").addEventListener("submit",(event)=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget), name=String(form.get("name")||"").trim(), email=String(form.get("email")||"").trim().toLowerCase();
    if (!name || !email) return;
    if (state.users.some((user)=>user.email.toLowerCase()===email)) { notify("Já existe um usuário com este e-mail.","error"); return; }
    const user={id:uid("user"),name,email,state:"",organizationId:"",sectorId:"",role:"master",disabled:false};
    state.users.push(user);
    state.permissionProfiles=[
      {id:"profile_admin",name:"Administrador",createdBy:user.id,createdAt:nowIso()},
      {id:"profile_editor",name:"Editor",createdBy:user.id,createdAt:nowIso()},
      {id:"profile_reader",name:"Leitura",createdBy:user.id,createdAt:nowIso()}
    ];
    const editorOperations=["view_item","create_item","edit_item","create_relation","edit_relation","delete_relation","change_owner","change_weight","change_duration","change_hierarchy","add_attachment","delete_attachment","create_approval","decide_approval"];
    const profileRules=[];
    for (const operation of Object.keys(permissionOperationLabels)) profileRules.push({id:uid("gpo"),subjectType:"profile",subjectId:"profile_admin",operation,scopeType:"global",scopeId:"",effect:"allow",createdBy:user.id,createdAt:nowIso()});
    for (const operation of editorOperations) profileRules.push({id:uid("gpo"),subjectType:"profile",subjectId:"profile_editor",operation,scopeType:"organization",scopeId:"@user",effect:"allow",createdBy:user.id,createdAt:nowIso()});
    profileRules.push({id:uid("gpo"),subjectType:"profile",subjectId:"profile_reader",operation:"view_item",scopeType:"organization",scopeId:"@user",effect:"allow",createdBy:user.id,createdAt:nowIso()});
    state.permissionRules=profileRules.concat(Object.keys(permissionOperationLabels).map((operation)=>({id:uid("gpo"),subjectType:"user",subjectId:user.id,operation,scopeType:"global",scopeId:"",effect:"allow",createdBy:user.id,createdAt:nowIso()})));
    state.setupComplete=true; state.currentUserId=user.id; state.workspaceName="";
    createEvent(user.id,"created","","master","Usuário master criado.");
    saveState(); render();
  });
  mountIcons();
}

function renderLogin() {
  app.innerHTML = `<main class="login-screen"><section class="login-card">
    <div class="brand">${icon("workflow")}<span>FLUXO VISUAL</span></div>
    <h1>Acesse sua operação</h1>
    <p>Escolha um usuário para testar as regras GPO de demonstração.</p>
    <form id="loginForm"><label>Usuário<select name="userId" required>${state.users.filter((user) => !user.disabled).map((user) => option(user.id, `${user.name} · ${orgName(user.organizationId)}`)).join("")}</select></label><button class="button primary" type="submit">Entrar</button></form>
    <div class="demo-note"><strong>Modo de demonstração</strong><span>Login por perfil. Os dados ficam salvos neste navegador.</span></div>
    <p class="build-label" data-build-label>${escapeHtml(buildLabel())}</p>
    </section></main>`;
  document.querySelector("#loginForm").addEventListener("submit", (event) => {
    event.preventDefault();
    state.currentUserId = new FormData(event.currentTarget).get("userId");
    state.filters = { query: "", status: "all", type: "all", owner: "all", organization: "all", sector: "all", state: "all" };
    ui.scopeId = "all"; ui.selectedItemId = ""; ui.panel = ""; ui.notice = ""; ui.graphTransform = null;
    saveState(); render();
  });
  mountIcons();
}

function renderFilters() {
  const items = accessibleItems();
  const owners = new Set(items.map((item) => item.ownerId));
  const organizations = new Set(items.map((item) => item.organizationId));
  const sectors = new Set(items.map((item) => item.sectorId));
  const states = new Set(items.map((item) => item.state).filter(Boolean));
  return `<div class="filters-bar">
    <label>Status<select data-filter="status">${option("all", "Todos", state.filters.status === "all")}${statusCatalog.filter((status)=>!["under_review","correction"].includes(status.id)).map((status) => statusOption(status, state.filters.status === status.id)).join("")}</select></label>
    <label>Indicador<select data-filter="indicator">${option("all", "Todos", (state.filters.indicator || "all") === "all")}${option("blocked", "Bloqueados", state.filters.indicator === "blocked")}${option("overdue", "Atrasados", state.filters.indicator === "overdue")}${option("risk", "Em risco", state.filters.indicator === "risk")}</select></label>
    <label>Tipo<select data-filter="type">${option("all", "Todos", state.filters.type === "all")}${itemTypes.map((type) => option(type.id, type.label, state.filters.type === type.id)).join("")}</select></label>
    <label>Responsável<select data-filter="owner">${option("all", "Todos", state.filters.owner === "all")}${[...owners].map((id) => option(id, userName(id), state.filters.owner === id)).join("")}</select></label>
    <label>Empresa<select data-filter="organization">${option("all", "Todas", state.filters.organization === "all")}${[...organizations].map((id) => option(id, orgName(id), state.filters.organization === id)).join("")}</select></label>
    <label>Setor<select data-filter="sector">${option("all", "Todos", state.filters.sector === "all")}${[...sectors].map((id) => option(id, sectorName(id), state.filters.sector === id)).join("")}</select></label>
    <label>Estado<select data-filter="state">${option("all", "Todos", state.filters.state === "all")}${[...states].map((value) => option(value, value, state.filters.state === value)).join("")}</select></label>
    <button class="button quiet" data-action="clear-filters">Limpar filtros</button>
  </div>`;
}

function tableRows(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map();
  items.forEach((item) => { if (!children.has(item.parentId)) children.set(item.parentId, []); children.get(item.parentId).push(item); });
  for (const siblings of children.values()) siblings.sort((left,right) => Number(left.sortOrder ?? state.items.indexOf(left)) - Number(right.sortOrder ?? state.items.indexOf(right)));
  const rows = []; const seen = new Set();
  function visit(item, depth) {
    if (seen.has(item.id)) return;
    seen.add(item.id); rows.push({ item, depth, children: children.get(item.id) || [] });
    if (ui.showSubitems && !ui.collapsed?.has(item.id)) (children.get(item.id) || []).forEach((child) => visit(child, depth + 1));
  }
  (children.get("") || items.filter((item) => !byId.has(item.parentId))).forEach((item) => visit(item, 0));
  return rows;
}

const tableColumnOptions = [
  ["select","Selecionar"],["id","ID"],["name","Nome"],["progress","Conclusão"],["owner","Responsável"],
  ["created","Criação"],["start","Início projetado"],["actualStart","Início real"],["released","Liberada em"],
  ["due","Término projetado"],["completed","Término real"],["elapsed","Duração total"],["activityDuration","Duração da atividade"],["weight","Peso"],["status","Status"],["actions","Ações"]
];

function renderColumnSettings() {
  const hidden = new Set(state.hiddenTableColumns || []);
  return `<div class="column-settings" aria-label="Colunas visíveis">${tableColumnOptions.map(([key,label]) => `<label><input type="checkbox" data-column-toggle="${key}" ${hidden.has(key) || ui.autoHiddenTableColumns?.has(key) ? "" : "checked"} ${key === "name" ? "disabled" : ""}/> ${label}</label>`).join("")}<button type="button" class="button quiet" data-action="auto-fit-columns">Ajustar colunas automaticamente</button></div>`;
}

// Adaptive sizing uses the available space rather than old persisted pixel widths.
// Manual visibility preferences remain separate from columns hidden temporarily to fit.
const tableColumnMinimums = {
  select:27,id:48,name:157,progress:73,owner:92,created:93,start:93,
  actualStart:93,released:93,due:87,completed:93,elapsed:86,
  activityDuration:96,weight:50,status:108,actions:48
};
const tableColumnPriority = ["select","name","status","owner","due","actions","progress",
  "start","id","elapsed","weight","created","released","completed","actualStart","activityDuration"];

function applyTableColumnLayout() {
  const table=document.querySelector(".synth-table");
  if(!table) return;
  const container=table.closest(".synth-table-wrap");
  const available=Math.max(0,Math.floor(container?.clientWidth || 0)-2);
  if(!available) return;
  const manuallyHidden=new Set(state.hiddenTableColumns || []);
  const pinned=new Set(state.tableColumnPinned || []);
  const compact=available<730;
  const mandatory=new Set(compact?["select","name","actions"]:["select","name","status","owner","due","actions"]);
  const visible=new Set();
  const widthFor=(key)=>compact?(key==="select"?28:key==="actions"?37:Math.max(180,available-65)):(tableColumnMinimums[key]||90);
  let occupied=0;
  // Keep the identity, item title and actions available at every viewport.
  for(const key of tableColumnPriority){
    if(mandatory.has(key) && !manuallyHidden.has(key)){
      visible.add(key);occupied+=widthFor(key);
    }
  }
  for(const key of tableColumnPriority){
    if(compact && !mandatory.has(key))continue;
    if(visible.has(key)||manuallyHidden.has(key))continue;
    const width=widthFor(key);
    if(occupied+width<=available || pinned.has(key)){
      visible.add(key);occupied+=width;
    }
  }
  // A manually selected column takes precedence over less important automatic columns.
  if(occupied>available){
    for(const key of [...tableColumnPriority].reverse()){
      if(occupied<=available) break;
      if(visible.has(key)&&!pinned.has(key)&&!mandatory.has(key)){
        visible.delete(key);occupied-=widthFor(key);
      }
    }
  }
  const autoHidden=new Set(tableColumnOptions.map(([key])=>key).filter(key=>!visible.has(key)&&!manuallyHidden.has(key)));
  ui.autoHiddenTableColumns=autoHidden;
  table.classList.toggle("prd44-compact-table",compact);
  const headers=[...table.querySelectorAll("thead th")];
  const weights=tableColumnOptions.map(([key])=>visible.has(key)?widthFor(key):0);
  const sum=weights.reduce((a,b)=>a+b,0)||1;
  table.style.width="100%";
  table.style.minWidth="0";
  table.style.tableLayout="fixed";
  headers.forEach((header,index)=>{
    const [key]=tableColumnOptions[index]||[];
    if(!key)return;
    header.dataset.columnKey=key;
    header.classList.toggle("column-hidden",!visible.has(key));
    header.style.width=visible.has(key)?(weights[index]/sum*100).toFixed(4)+"%":"";
    // Disable old pixel sizing and drag handles: these caused the table to exceed its wrapper.
    header.querySelector(".column-resize-handle")?.remove();
  });
  table.querySelectorAll("tbody tr").forEach(row=>
    [...row.children].forEach((cell,index)=>{
      const [key]=tableColumnOptions[index]||[];
      if(key) cell.classList.toggle("column-hidden",!visible.has(key));
    })
  );
}

function rowFillColor(item, depth) {
  const settings = state.rowFillSettings || {};
  const projectId = rootOf(item)?.id || "";
  const projectColor = settings.projects?.[projectId];
  const levelDefaults = ["#ffffff","#f5f8fa","#edf3f6","#e4edf2"];
  const levelCandidate = settings.levels?.[String(Math.min(depth, 3))];
  const levelColor = /^#[0-9a-fA-F]{6}$/.test(levelCandidate || "") ? levelCandidate : levelDefaults[Math.min(depth, 3)];
  return /^#[0-9a-fA-F]{6}$/.test(projectColor || "") ? projectColor : levelColor;
}

function renderTable(items) {
  ui.bulkSelected ||= new Set();
  const rows = tableRows(items);
  const selectedVisible = rows.filter(({item}) => ui.bulkSelected.has(item.id)).length;
  return `<div class="table-card">
    ${ui.bulkOpen && selectedVisible ? renderBulkEditor() : ""}
    ${!rows.length ? emptyMarkup() : `<div class="synth-table-wrap"><table class="synth-table"><thead><tr><th><span class="sr-only">Selecionar</span></th><th>ID</th><th>Nome</th><th>Conclusão</th><th>Responsável</th><th>Criação</th><th>Início projetado</th><th>Início real</th><th>Liberada em</th><th>Término projetado</th><th>Término real</th><th>Duração total</th><th>Duração da atividade</th><th>Peso</th><th>Status</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>
      ${rows.map(({item, depth, children}) => `<tr data-row="${escapeHtml(item.id)}" data-depth="${depth}" data-type="${escapeHtml(item.type)}" data-row-draggable="${canChangeHierarchy(currentUser(),item) ? "true" : "false"}" draggable="${canChangeHierarchy(currentUser(),item)}" class="${item.id === ui.selectedItemId ? "selected" : ""} ${depth ? "child-row" : "root-row"}" style="--row-fill:${rowFillColor(item,depth)}">
        <td><input type="checkbox" data-bulk-item="${escapeHtml(item.id)}" aria-label="Selecionar ${escapeHtml(item.title)}" ${ui.bulkSelected.has(item.id) ? "checked" : ""}/></td><td class="id-cell">${shortId(item)}</td><td class="title-cell"><div class="tree-cell" style="--depth:${Math.min(depth, 8)}">${children.length ? `<button class="tree-toggle" data-expand="${escapeHtml(item.id)}" aria-label="${!ui.showSubitems || ui.collapsed?.has(item.id) ? "Expandir" : "Recolher"} subitens" aria-expanded="${ui.showSubitems && !ui.collapsed?.has(item.id)}">${icon(ui.showSubitems && !ui.collapsed?.has(item.id) ? "chevron-down" : "chevron-right")}</button>` : '<span class="tree-spacer"></span>'}<button class="item-title" data-select="${escapeHtml(item.id)}">${escapeHtml(item.title)}<span>${icon(itemTypeConfig(item.type,item.organizationId).icon)}${escapeHtml(itemTypeConfig(item.type,item.organizationId).label)}${children.length ? ` · ${children.length} subitens` : ""}</span></button><span class="prd44-row-facts" title="Status, responsável e término projetado"><span class="prd44-fact-status ${signalOf(item)}">${escapeHtml(statusDisplayLabel(item))}</span><span class="prd44-fact-owner">${escapeHtml(userName(item.ownerId))}</span><time class="prd44-fact-due">${dateCell(item.dueAt)}</time></span>${canEditItem(currentUser(),item) && canCreateItem(currentUser(),{...item,createdBy:currentUser().id}) && gpoDecision(currentUser(),"create_relation",item)===true ?
          `<button class="prd42-add-child" type="button" data-create-child="${escapeHtml(item.id)}" title="Criar subitem de ${escapeHtml(item.title)}" aria-label="Adicionar subitem de ${escapeHtml(item.title)}">${icon("plus")}</button>` : ""}</div></td>
        <td>${progressCell(item)}</td><td>${escapeHtml(userName(item.ownerId))}</td><td class="date-cell">${dateCell(item.createdAt, true)}</td><td class="date-cell">${dateCell(item.plannedStartAt)}</td><td class="date-cell">${dateCell(item.actualStartAt, true)}</td><td class="date-cell">${dateCell(activityStartAt(item), true)}</td><td class="date-cell ${isOverdue(item) ? "overdue" : ""}">${dateCell(item.dueAt)}</td><td class="date-cell">${dateCell(item.completedAt, true)}</td><td class="duration-cell">${elapsedLabel(item)}</td><td class="duration-cell">${activityDurationLabel(item)}</td><td class="weight-cell">${Number(item.weight ?? 1)}</td><td>${statusBadge(item)}</td><td><div class="row-actions prd42-row-actions"><button class="icon-button" data-select="${escapeHtml(item.id)}" title="Editar item" aria-label="Editar ${escapeHtml(item.title)}">${icon("pencil")}</button>
        <details class="prd42-row-more"><summary aria-label="Mais ações para ${escapeHtml(item.title)}" title="Mais ações">${icon("ellipsis")}</summary>
        <div class="prd42-row-extra">${canChangeHierarchy(currentUser(),item) ? `<button class="icon-button compact" data-order-up="${escapeHtml(item.id)}" title="Mover para cima" aria-label="Mover ${escapeHtml(item.title)} para cima">${icon("arrow-up")}</button><button class="icon-button compact" data-order-down="${escapeHtml(item.id)}" title="Mover para baixo" aria-label="Mover ${escapeHtml(item.title)} para baixo">${icon("arrow-down")}</button><button class="icon-button compact" data-indent="${escapeHtml(item.id)}" title="Indentar sob item anterior" aria-label="Indentar ${escapeHtml(item.title)}">${icon("corner-down-right")}</button>${item.parentId ? `<button class="icon-button compact" data-outdent="${escapeHtml(item.id)}" title="Remover do nível atual" aria-label="Recuar ${escapeHtml(item.title)}">${icon("corner-up-left")}</button>` : ""}` : ""}${canRemoveItem(currentUser(),item) ? deleteButton("item",item.id,item.title) : ""}</div></details></div></td>
      </tr>`).join("")}
    </tbody></table></div>`}
  </div>`;
}

function renderBulkEditor() {
  return `<form id="bulkEditForm" class="bulk-edit form-row"><label>Novo status<select name="status">${option("", "Manter status")}${statusCatalog.filter((status)=>!["under_review","correction"].includes(status.id)).map((status) => statusOption(status)).join("")}</select></label><label>Novo responsável<select name="ownerId">${option("", "Manter responsável")}${state.users.filter((user) => !user.disabled).map((user) => option(user.id, user.name)).join("")}</select></label><label>Duração (dias)<input type="number" name="durationDays" min="0" step="1" placeholder="Manter duração"/></label><label>Peso<input type="number" name="weight" min="0.1" step="0.1" placeholder="Manter peso"/></label><label>Conclusão (%)<input type="number" name="progressPercent" min="0" max="100" step="1" placeholder="Manter percentual"/></label><button class="button primary" type="submit">Aplicar aos selecionados</button></form>`;
}

function emptyMarkup() {
  return `<div class="empty-state">${icon("search")}<strong>Nenhum item nesta visão</strong><span>Ajuste os filtros ou crie um novo item.</span>${state.filters.query || filterCount() ? '<button class="button quiet" data-action="clear-filters">Limpar filtros</button>' : ""}</div>`;
}

function scheduleAnalysis(items) {
  const children = new Set(items.map((item) => item.parentId).filter(Boolean));
  let tasks = items.filter((item) => !children.has(item.id) && item.status !== "cancelled");
  if (!tasks.length) tasks = items.filter((item) => item.status !== "cancelled");
  if (!tasks.length) return {valid:true,reliable:false,startDate:today(),finishDate:"",durationDays:0,rows:[],message:"Não há atividades ativas para calcular a previsão."};
  const taskIds = new Set(tasks.map((item) => item.id));
  const temporalTypes = new Set(["TI"]);
  const dependencies = relationsFor(items).filter((relation) => temporalTypes.has(relation.relationType) && taskIds.has(relation.sourceId) && taskIds.has(relation.targetId));
  const sortedDates = tasks.map((item) => item.plannedStartAt).filter(Boolean).sort();
  const startDate = sortedDates[0] || today();
  const duration = new Map();
  const plannedStart = new Map();
  let durationsComplete = tasks.length > 0;
  for (const item of tasks) {
    const explicitDuration = Number(item.plannedDurationDays);
    const hasExplicitDuration = item.plannedDurationDays !== null && item.plannedDurationDays !== undefined && item.plannedDurationDays !== "" && Number.isFinite(explicitDuration) && explicitDuration >= 0;
    const hasDateRange = item.plannedStartAt && item.dueAt && item.dueAt >= item.plannedStartAt;
    const days = hasExplicitDuration
      ? explicitDuration
      : hasDateRange
        ? inclusiveDurationDays(item.plannedStartAt,item.dueAt)
        : null;
    if (days === null) durationsComplete = false;
    duration.set(item.id,days ?? 0);
    plannedStart.set(item.id,item.plannedStartAt ? Math.max(0,(new Date(item.plannedStartAt + "T12:00:00") - new Date(startDate + "T12:00:00")) / 86400000) : 0);
  }
  const reliable = tasks.length > 0 && durationsComplete && tasks.every((item) => item.plannedStartAt && (item.plannedDurationDays !== undefined && item.plannedDurationDays !== null && item.plannedDurationDays !== "" || item.dueAt && item.dueAt >= item.plannedStartAt));
  const incoming = new Map(tasks.map((item) => [item.id,[]]));
  const outgoing = new Map(tasks.map((item) => [item.id,[]]));
  dependencies.forEach((relation) => {
    incoming.get(relation.targetId).push(relation);
    outgoing.get(relation.sourceId).push(relation);
  });
  const indegree = new Map(tasks.map((item) => [item.id,incoming.get(item.id).length]));
  const queue = tasks.filter((item) => indegree.get(item.id) === 0).map((item) => item.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const relation of outgoing.get(id)) {
      const next = indegree.get(relation.targetId) - 1;
      indegree.set(relation.targetId,next);
      if (next === 0) queue.push(relation.targetId);
    }
  }
  if (order.length !== tasks.length) return {valid:false,reliable:false,startDate,finishDate:"",durationDays:0,rows:tasks.map((item) => ({item,startOffset:plannedStart.get(item.id),duration:duration.get(item.id),slack:null,critical:false})),message:"Há um ciclo nas dependências temporais. O caminho crítico não pode ser calculado."};
  const earliest = new Map(tasks.map((item) => [item.id,plannedStart.get(item.id)]));
  const offsetFor = (relation) => temporalStartOffset(relation,duration.get(relation.sourceId),duration.get(relation.targetId));
  for (const id of order) for (const relation of outgoing.get(id)) {
    earliest.set(relation.targetId,Math.max(earliest.get(relation.targetId),earliest.get(id) + offsetFor(relation)));
  }
  // II/IF links do not guarantee that terminal nodes finish last.
  const projectFinish = Math.max(0,...tasks.map((item) => earliest.get(item.id) + durationEndOffset(duration.get(item.id))));
  const projectDuration = projectFinish + (tasks.some((item) => duration.get(item.id) > 0) ? 1 : 0);
  const latest = new Map(tasks.map((item) => [item.id,projectFinish - durationEndOffset(duration.get(item.id))]));
  for (const id of [...order].reverse()) for (const relation of outgoing.get(id)) {
    latest.set(id,Math.min(latest.get(id),latest.get(relation.targetId) - offsetFor(relation)));
  }
  const rows = tasks.map((item) => {
    const es = earliest.get(item.id);
    const slack = Math.max(0,latest.get(item.id) - es);
    return {item,startOffset:es,duration:duration.get(item.id),slack,critical:slack < 0.01};
  });
  return {valid:true,reliable,startDate,finishDate:shiftedDate(startDate,Math.ceil(projectFinish)),durationDays:Math.ceil(projectDuration),rows,message:reliable ? "" : "Cronograma incompleto: informe a data inicial idealizada e uma duração explícita (ou início e término válidos) para cada atividade; nenhuma duração é presumida."};
}

let prd43SelectedTiId="";
let prd43GanttObserver=null;
let prd44LinkSource="";
function renderGantt(items) {
  const analysis=scheduleAnalysis(items), computed=new Map(analysis.rows.map(row=>[row.item.id,row]));
  const rows=tableRows(items).map(({item,depth,children})=>{
    if(computed.has(item.id))return {...computed.get(item.id),depth,children};
    const offset=item.plannedStartAt?Math.max(0,(new Date(item.plannedStartAt+"T12:00:00")-new Date(analysis.startDate+"T12:00:00"))/86400000):0;
    return {item,startOffset:offset,duration:itemDurationDays(item),slack:null,critical:false,structural:true,depth,children};
  });
  const maxDay=Math.max(1,...rows.map(row=>row.startOffset+row.duration+(row.slack||0)));
  const visible=new Set(rows.map(row=>row.item.id));
  const ties=relationsFor(items).filter(rel=>rel.relationType==="TI"&&visible.has(rel.sourceId)&&visible.has(rel.targetId));
  let html=`<div class="gantt-card prd43-gantt">
    <div class="prd43-gantt-relation-editor" id="prd43GanttRelationEditor" hidden></div>`;
  if(analysis.message)html+=`<div class="prd43-gantt-info" title="${escapeHtml(analysis.message)}">${escapeHtml(analysis.message)}</div>`;
  if(!rows.length)return html+emptyMarkup()+"</div>";
  html+=`<div class="gantt-scroll" id="prd43GanttScroll"><div class="prd43-gantt-content" id="prd43GanttContent">
    <div class="gantt-axis"><span>Atividade / responsável</span><span class="prd5-axis-status">Status</span><span class="prd5-axis-progress">Avanço</span><span class="prd5-axis-dates">Início / término</span><span class="prd5-axis-actions">Editar</span><div class="gantt-axis-track">${[0,25,50,75,100].map(percent=>`<span style="left:${percent}%">${escapeHtml(formatDate(shiftedDate(analysis.startDate,Math.round(maxDay*percent/100))))}</span>`).join("")}</div></div>`;
  const relationMap=new Map();
  for(const rel of ties){const incoming=relationMap.get(rel.targetId)||{before:[],after:[]};incoming.before.push(rel);relationMap.set(rel.targetId,incoming);
    const outgoing=relationMap.get(rel.sourceId)||{before:[],after:[]};outgoing.after.push(rel);relationMap.set(rel.sourceId,outgoing);}
  html+=rows.map(row=>{
    const item=row.item, left=Math.max(0,Math.min(100,row.startOffset/maxDay*100)), width=Math.max(1,Math.min(100-left,Math.max(1,row.duration/maxDay*100)));
    const start=shiftedDate(analysis.startDate,row.startOffset),end=inclusiveFinishDate(start,row.duration);
    const tone=signalOf(item), tiesFor=relationMap.get(item.id)||{before:[],after:[]};
    const predecessor=tiesFor.before.map(rel=>getItem(rel.sourceId)?.title).filter(Boolean);
    const successor=tiesFor.after.map(rel=>getItem(rel.targetId)?.title).filter(Boolean);
    const isLeaf=!state.items.some(child=>child.parentId===item.id&&!child.archivedAt);
    const canLink=isLeaf&&canEditItem(currentUser(),item)&&gpoDecision(currentUser(),"create_relation",item)===true;
    const critical=Boolean(row.critical&&analysis.valid);
    const toggle=row.children?.length?`<button class="tree-toggle" data-expand="${escapeHtml(item.id)}" aria-label="${ui.showSubitems&&!ui.collapsed?.has(item.id)?"Recolher":"Expandir"} subitens">${icon(ui.showSubitems&&!ui.collapsed?.has(item.id)?"chevron-down":"chevron-right")}</button>`:'<span class="tree-spacer"></span>';
    return `<div class="gantt-row prd43-gantt-row signal-${tone} ${critical?"is-critical":""} ${row.structural?"structural":""} ${item.id===ui.selectedItemId?"selected":""}" data-gantt-row="${escapeHtml(item.id)}" style="--depth:${Math.min(row.depth||0,8)}">
      <div class="gantt-item-wrap">${toggle}<button class="gantt-item" data-select="${escapeHtml(item.id)}" title="${escapeHtml(item.title)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(userName(item.ownerId))}${critical?" · crítico":""}</small></button></div>
      <span class="prd5-gantt-status">${statusBadge(item)}</span><span class="prd5-gantt-progress">${progressCell(item)}</span><span class="prd5-gantt-dates">${dateCell(item.plannedStartAt)}<span>→</span>${dateCell(item.dueAt)}</span><button type="button" class="prd5-gantt-edit" data-select="${escapeHtml(item.id)}" aria-label="Editar ${escapeHtml(item.title)}" title="Editar item">${icon("pencil")}</button>
      <div class="gantt-track" data-gantt-track="${escapeHtml(item.id)}" title="${escapeHtml(item.title+" · "+formatDate(start)+" a "+formatDate(end))}">
        <div class="gantt-bar prd43-gantt-bar signal-${tone} ${critical?"critical":""}" data-gantt-bar="${escapeHtml(item.id)}" style="left:${left}%;width:${width}%" title="${escapeHtml(formatDate(start)+" → "+formatDate(end)+" · "+statusDisplayLabel(item))}">
          ${canLink?`<button type="button" class="prd43-gantt-handle" data-gantt-handle="${escapeHtml(item.id)}" title="Arraste para criar TI a partir de ${escapeHtml(item.title)}" aria-label="Criar TI a partir de ${escapeHtml(item.title)}"></button>`:""}
        </div>
      </div>
      <span class="prd43-gantt-links" title="${escapeHtml("Predecessoras: "+(predecessor.join(", ")||"nenhuma")+" · Sucessoras: "+(successor.join(", ")||"nenhuma"))}">${predecessor.length?"←"+predecessor.length:""}${successor.length?" →"+successor.length:""}</span>
    </div>`;
  }).join("");
  html+=`<svg class="prd43-gantt-links-svg" id="prd43GanttOverlay" aria-label="Relações TI do Gantt"></svg>
    </div></div><div class="prd43-gantt-legend" aria-label="Legenda">
      <span class="gray">Não iniciado</span><span class="blue">Em execução</span><span class="green">Concluído</span>
      <span class="yellow">Risco / atraso</span><span class="red">Bloqueado</span><span class="prd43-critical-key">◆ Crítico</span>
    </div></div>`;
  return html;
}
function prd43DrawGanttRelations(){
  const content=document.querySelector("#prd43GanttContent"),svg=document.querySelector("#prd43GanttOverlay");
  if(!content||!svg)return;
  const contentBox=content.getBoundingClientRect();
  const width=content.scrollWidth,height=content.scrollHeight;
  svg.setAttribute("width",width);svg.setAttribute("height",height);svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
  let lines=`<defs><marker id="prd43-ti-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#286d73"/></marker></defs>`;
  const rows=[...content.querySelectorAll("[data-gantt-row]")],ids=new Set(rows.map(row=>row.dataset.ganttRow));
  const offset=rect=>({x:rect.left-contentBox.left+content.scrollLeft,y:rect.top-contentBox.top+content.scrollTop});
  for(const rel of state.relations.filter(r=>r.relationType==="TI"&&ids.has(r.sourceId)&&ids.has(r.targetId))){
    const source=content.querySelector('[data-gantt-bar="'+CSS.escape(rel.sourceId)+'"]');
    const target=content.querySelector('[data-gantt-bar="'+CSS.escape(rel.targetId)+'"]');
    if(!source||!target)continue;
    const sa=source.getBoundingClientRect(),tb=target.getBoundingClientRect();
    const start=offset(sa),end=offset(tb);
    const sx=start.x+sa.width,sy=start.y+sa.height/2,tx=end.x,ty=end.y+tb.height/2;
    const elbow=tx>=sx+24?Math.max(sx+11,(sx+tx)/2):sx+20;
    const d=`M${sx.toFixed(1)} ${sy.toFixed(1)} H${elbow.toFixed(1)} V${ty.toFixed(1)} H${tx.toFixed(1)}`;
    lines+=`<g class="prd43-ti-edge ${prd43SelectedTiId===rel.id?"selected":""}" data-action="select-gantt-ti" data-gantt-ti="${escapeHtml(rel.id)}" role="button" tabindex="0" aria-label="TI de ${escapeHtml(getItem(rel.sourceId)?.title||"")} para ${escapeHtml(getItem(rel.targetId)?.title||"")}. Clique para editar.">
       <path class="prd43-ti-hit" d="${d}"/><path class="prd43-ti-path" d="${d}" marker-end="url(#prd43-ti-arrow)"/></g>`;
  }
  svg.innerHTML=lines;
}
function prd44BeginGanttLink(sourceId){
  const source=getItem(sourceId),editor=document.querySelector("#prd43GanttRelationEditor");
  if(!editor||!source)return;
  prd44LinkSource=sourceId;prd43SelectedTiId="";
  const sources=scopedItems().filter(item=>item.id!==sourceId&&canViewItem(currentUser(),item)
    &&!state.items.some(child=>child.parentId===item.id&&!child.archivedAt));
  editor.hidden=false;
  editor.innerHTML=`<strong>Criar TI: ${escapeHtml(source.title)} →</strong>
    <label>Atividade de destino<select id="prd44TiDestination"><option value="">Selecione o destino…</option>${sources.map(item=>option(item.id,item.title)).join("")}</select></label>
    <button type="button" class="button primary" data-action="prd44-confirm-ti">Criar TI</button>
    <button type="button" class="button quiet" data-action="prd43-close-ti">Cancelar</button>`;
  mountIcons();editor.querySelector("#prd44TiDestination")?.focus();prd43DrawGanttRelations();
}
function prd43ShowGanttRelation(id){
  const relation=state.relations.find(rel=>rel.id===id&&rel.relationType==="TI");
  const editor=document.querySelector("#prd43GanttRelationEditor");
  if(!editor)return;
  prd44LinkSource="";
  prd43SelectedTiId=relation?.id||"";
  if(!relation){editor.hidden=true;editor.innerHTML="";prd43DrawGanttRelations();return;}
  const leaves=scopedItems().filter(item=>!state.items.some(child=>child.parentId===item.id&&!child.archivedAt)&&canViewItem(currentUser(),item));
  editor.hidden=false;
  editor.innerHTML=`<strong>Editar TI</strong><label>Origem<select id="prd43TiSource">${leaves.map(item=>option(item.id,item.title,relation.sourceId===item.id)).join("")}</select></label>
    <label>Destino<select id="prd43TiTarget">${leaves.map(item=>option(item.id,item.title,relation.targetId===item.id)).join("")}</select></label>
    <button type="button" class="button quiet" data-action="prd43-update-ti">Aplicar</button>
    <button type="button" class="button danger" data-action="prd43-delete-ti">Remover TI</button>
    <button type="button" class="icon-button" data-action="prd43-close-ti" aria-label="Fechar edição de TI">${icon("x")}</button>`;
  mountIcons();prd43DrawGanttRelations();
}
function prd43GanttDropTarget(clientX,clientY){
  // Uma conexão SVG pode estar sobre a barra: procurar a linha real abaixo dela.
  for(const element of document.elementsFromPoint(clientX,clientY)){
    const row=element.closest?.("[data-gantt-row]");
    if(row)return row;
  }
  return null;
}
function prd43BindGantt(){
  const content=document.querySelector("#prd43GanttContent");if(!content)return;
  if(prd43GanttObserver){prd43GanttObserver.disconnect();prd43GanttObserver=null;}
  requestAnimationFrame(prd43DrawGanttRelations);
  if(typeof ResizeObserver!=="undefined"){
    prd43GanttObserver=new ResizeObserver(()=>prd43DrawGanttRelations());prd43GanttObserver.observe(content);
  }
  content.querySelectorAll("[data-gantt-handle]").forEach(handle=>{
    handle.addEventListener("pointerdown",event=>{
      if(event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const originId=handle.dataset.ganttHandle,origin=handle.getBoundingClientRect();
      const root=content.getBoundingClientRect(),svg=content.querySelector("#prd43GanttOverlay");
      const start={x:origin.left+origin.width/2-root.left,y:origin.top+origin.height/2-root.top};
      const ghost=document.createElementNS("http://www.w3.org/2000/svg","path");
      ghost.classList.add("prd43-ti-preview");ghost.setAttribute("d",`M${start.x} ${start.y} L${start.x} ${start.y}`);
      svg.append(ghost);handle.setPointerCapture(event.pointerId);
      const move=e=>{
        if(e.pointerId!==event.pointerId)return;
        // Permitir arrastar para uma atividade fora da regiao inicialmente visivel.
        const pane=content.closest(".prd41-pane-body"),scroll=content.closest(".gantt-scroll");
        const bounds=pane?.getBoundingClientRect(),horizontal=scroll?.getBoundingClientRect();
        if(bounds&&pane){if(e.clientY>bounds.bottom-30)pane.scrollTop+=22;else if(e.clientY<bounds.top+30)pane.scrollTop-=22;}
        if(horizontal&&scroll){if(e.clientX>horizontal.right-25)scroll.scrollLeft+=18;else if(e.clientX<horizontal.left+25)scroll.scrollLeft-=18;}
        const adjustedRoot=content.getBoundingClientRect();
        const p={x:e.clientX-adjustedRoot.left,y:e.clientY-adjustedRoot.top};
        ghost.setAttribute("d",`M${start.x} ${start.y} L${p.x} ${p.y}`);
        content.querySelectorAll(".prd43-gantt-row.is-link-target").forEach(row=>row.classList.remove("is-link-target"));
        const target=prd43GanttDropTarget(e.clientX,e.clientY);
        if(target?.dataset.ganttRow!==originId)target?.classList.add("is-link-target");
      };
      const end=e=>{
        if(e.pointerId!==event.pointerId)return;
        handle.removeEventListener("pointermove",move);handle.removeEventListener("pointerup",end);handle.removeEventListener("pointercancel",end);
        if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
        ghost.remove();content.querySelectorAll(".prd43-gantt-row.is-link-target").forEach(row=>row.classList.remove("is-link-target"));
        if(e.type==="pointercancel")return;
        const targetId=prd43GanttDropTarget(e.clientX,e.clientY)?.dataset.ganttRow;
        if(!targetId||targetId===originId){
          // Clique simples no conector: escolha guiada do sucessor.
          prd44BeginGanttLink(originId);
          return;
        }
        try{
          const rel=createRelation(originId,targetId,"TI");saveState();
          ui.prd43Undo={type:"create-ti",relationId:rel.id};notify("TI criada: "+getItem(originId).title+" → "+getItem(targetId).title+".");render();
        }catch(error){notify(error.message,"error");}
      };
      handle.addEventListener("pointermove",move);handle.addEventListener("pointerup",end);handle.addEventListener("pointercancel",end);
    });
  });
}

function renderGraphTree(items) {
  const childMap = new Map();
  const visible = new Map(items.map((item) => [item.id,item]));
  items.forEach((item) => {
    if (visible.has(item.parentId)) {
      if (!childMap.has(item.parentId)) childMap.set(item.parentId,[]);
      childMap.get(item.parentId).push(item);
    }
  });
  ui.treeCollapsed ||= new Set();
  ui.graphTreeSelectedIds ||= new Set();
  const seen = new Set();
  function visit(item, depth) {
    if (seen.has(item.id)) return "";
    seen.add(item.id);
    const children = childMap.get(item.id) || [];
    const collapsed = ui.treeCollapsed.has(item.id);
    let html = '<div class="graph-tree-entry"><div class="graph-tree-row" style="--depth:' + Math.min(depth,8) + '">';
    html += children.length ? '<button type="button" class="tree-toggle" data-tree-toggle="' + escapeHtml(item.id) + '" aria-expanded="' + !collapsed + '" aria-label="' + (collapsed ? "Expandir" : "Recolher") + '">' + icon(collapsed ? "chevron-right" : "chevron-down") + '</button>' : '<span class="tree-spacer"></span>';
    html += '<input type="checkbox" class="graph-tree-select" data-graph-select-item="' + escapeHtml(item.id) + '" aria-label="Incluir ' + escapeHtml(item.title) + ' no conjunto destacado" ' + (ui.graphTreeSelectedIds.has(item.id) ? 'checked' : '') + '/>';
    html += '<button type="button" class="graph-tree-item ' + (ui.graphTreeSelectedId === item.id ? 'active' : '') + '" data-select="' + escapeHtml(item.id) + '" title="' + escapeHtml(item.title) + '">' + escapeHtml(item.title) + '<small>' + icon(itemTypeConfig(item.type,item.organizationId).icon) + escapeHtml(itemTypeConfig(item.type,item.organizationId).label) + ' · ' + escapeHtml(orgName(item.organizationId)) + '</small></button></div>';
    if (children.length && !collapsed) html += '<div class="graph-tree-children">' + children.map((child) => visit(child,depth + 1)).join("") + '</div>';
    return html + '</div>';
  }
  const roots = items.filter((item) => !visible.has(item.parentId));
  const owners = [...new Set(items.map((item) => item.ownerId).filter(Boolean))].sort((a,b)=>userName(a).localeCompare(userName(b),"pt-BR"));
  const ownerFilters = '<section class="graph-owner-filters"><h4>Responsáveis</h4>' + owners.map((id)=>'<button type="button" data-highlight-owner="' + escapeHtml(id) + '" aria-pressed="' + (ui.graphOwnerHighlight===id) + '" class="' + (ui.graphOwnerHighlight===id ? 'active' : '') + '">' + escapeHtml(userName(id)) + '</button>').join('') + (ui.graphOwnerHighlight ? '<button type="button" class="clear-owner-filter" data-highlight-owner="">Limpar destaque</button>' : '') + '</section>';
  return '<nav class="graph-tree" aria-label="Árvore de itens">' + ownerFilters + '<h3>Navegar itens<small class="tree-hint">Marque caixas para destacar um conjunto</small></h3><div class="graph-tree-list">' + roots.map((item) => visit(item,0)).join("") + '</div></nav>';
}

function renderPrd4Overview(items){
  const roots=items.filter(item=>!item.parentId || !items.some(other=>other.id===item.parentId));
  const affected=items.filter(item=>item.status==="blocked" || item.inheritedBlockedFrom?.length);
  const late=items.filter(item=>isOverdue(item));
  const approvals=items.filter(item=>item.type==="approval" && ["under_review","correction"].includes(item.status));
  const avg=roots.length?Math.round(roots.reduce((total,item)=>total+Number(item.progressPercent||0),0)/roots.length):0;
  const options=[{label:"Projetos e processos",value:roots.length,description:avg+"% de avanço médio",focus:roots[0]?.id||""},
    {label:"Impedimentos",value:affected.length,description:"Atividades a verificar",focus:affected[0]?.id||""},
    {label:"Atrasos",value:late.length,description:"Prazos vencidos",focus:late[0]?.id||""},
    {label:"Aprovações",value:approvals.length,description:"Aguardando decisão ou correção",focus:approvals[0]?.id||""}];
  return `<section class="prd42-summary" aria-label="Indicadores de acompanhamento">
    ${options.map(item=>`<button type="button" class="prd42-indicator ${item.value && item.label==='Impedimentos'?'prd43-indicator-blocked':item.value && item.label==='Atrasos'?'prd43-indicator-risk':''}" ${item.focus ? `data-prd4-focus="${escapeHtml(item.focus)}"` : "disabled"} title="${escapeHtml(item.description)}">
      <strong>${item.value}</strong><span>${item.label}</span></button>`).join("")}
  </section>`;
}

function renderGraph(items){
  const legend=[{signal:"red",label:"Bloqueado"},{signal:"yellow",label:"Atraso / risco"},{signal:"blue",label:"Em execução"},{signal:"green",label:"Concluído"},{signal:"gray",label:"Não iniciado"}];
  return `<div class="graph-layout prd44-graph-layout"><div class="graph-shell">
    <div id="graphCanvas" class="graph-canvas">${items.length?"":emptyMarkup()}</div>
    <details class="prd42-graph-legend prd44-graph-legend"><summary>Legenda e destaques</summary>
      <div class="graph-legend" aria-label="Legenda dos status">${legend.map(entry=>`<button type="button" class="${entry.signal}${ui.graphHighlight===entry.signal?" active":""}" data-highlight-signal="${entry.signal}" aria-pressed="${ui.graphHighlight===entry.signal}"><b></b>${entry.label}</button>`).join("")}${ui.graphHighlight?'<button class="button quiet" data-highlight-signal="all">Limpar destaque</button>':""}</div>
    </details>
  </div></div>`;
}
function layoutKey() { return `${currentUser().id}:${ui.grouping}`; }

function mountGraph(items) {
  const projection=prd44GraphProjection(items);
  const graphKey = `${layoutKey()}:${projection.nodes.map((item) => item.id).join("|")}`;
  const schedule = scheduleAnalysis(items);
  const forecasts = new Map(schedule.rows.map((row) => [row.item.id,inclusiveFinishDate(shiftedDate(schedule.startDate,row.startOffset),row.duration)]));
  graphInstance = FluxosGraph.mount(document.querySelector("#graphCanvas"), {
    items:projection.nodes, relations:projection.relations, grouping: ui.grouping,
    savedPositions: ui.positions[layoutKey()] || {}, selectedId: ui.selectedItemId,
    initialTransform: ui.graphKey === graphKey ? ui.graphTransform : null,
    escape: escapeHtml,
    labels: {
      owner: userName, organization: orgName, relation: (id) => labelOf(relationTypes, id),
      hasChildren: item=>state.items.some(child=>child.parentId===item.id&&!child.archivedAt),
      isCollapsed: item=>!ui.showSubitems||ui.collapsed?.has(item.id),
      type: (item) => itemTypeConfig(item.type,item.organizationId).label, typeColor: (item) => itemTypeConfig(item.type,item.organizationId).color, status: (item) => signalLabel(item),
      signal: signalOf, statusColor: (item) => prd43Colors[signalOf(item)], duration: elapsedLabel, ownerTimer: ownerElapsedLabel, planned: plannedLabel, idealStart: (item) => item.plannedStartAt ? formatDate(item.plannedStartAt) : "—", idealEnd: (item) => item.dueAt ? formatDate(item.dueAt) : "—", baseline: (item) => item.baselineDueAt ? formatDate(item.baselineDueAt) : "—", project: rootOf,
      progress: (item) => Math.round(Number(item.progressPercent || 0)),
      expected: (item) => forecasts.get(item.id) ? formatDate(forecasts.get(item.id)) : item.dueAt ? formatDate(item.dueAt) : "Sem previsão",
      deviation: (item) => {
        const forecast = forecasts.get(item.id);
        if (!forecast || !item.dueAt) return "Sem dados suficientes";
        const days = Math.round((new Date(forecast + "T12:00:00") - new Date(item.dueAt + "T12:00:00")) / 86400000);
        return days > 0 ? days + "d depois do término ideal" : days < 0 ? Math.abs(days) + "d de folga" : "No término ideal";
      },
      blockers: (item) => (item.inheritedBlockedFrom || []).map(id=>getItem(id)?.title||id).join(", ") || (item.status==="blocked" ? "Bloqueio próprio" : "Nenhum"),
      dependencies: (item) => state.relations.filter((relation) => relation.targetId === item.id && relation.relationType === "TI").map((relation) => getItem(relation.sourceId)?.title).filter(Boolean).join(", ") || "Nenhuma",
    },
    onSelect: (id) => openItem(id),
    onToggleCollapse: (id)=>prd44ToggleHierarchy(id),
    onRelation: (relation) => { ui.selectedRelationId=relation.id; notify("Relação selecionada. Pressione Delete para excluir."); },
    onCreateRelation: (sourceId,targetId)=>{
      try { const relation=createRelation(sourceId,targetId,"TI"); saveState();ui.prd43Undo={type:"create-ti",relationId:relation.id};notify("Precedência TI criada.");render(); }
      catch(error){notify(error.message,"error");}
    },
    onDeleteRelation: (id)=>{
      try {const rel=state.relations.find(r=>r.id===id);if(!rel||rel.relationType!=="TI")throw new Error("Selecione uma TI para remover.");ui.lastDeletedRelation={sourceId:rel.sourceId,targetId:rel.targetId};ui.prd43Undo={type:"delete-ti",relation:{sourceId:rel.sourceId,targetId:rel.targetId,lagDays:rel.lagDays,description:rel.description}};removeRelation(id);saveState();notify("Relação TI removida.");render();}
      catch(error){notify(error.message,"error");}
    },
    onPositions: (positions) => { ui.positions[layoutKey()] = positions; state.graphPositions = ui.positions; saveState(); },
    onZoom: (value) => { const label = document.querySelector("#zoomLabel"); if (label) label.textContent = `${value}%`; },
  });
  if (ui.graphHighlight || ui.graphOwnerHighlight) document.querySelectorAll("#graphCanvas [data-node]").forEach((element) => { const item=getItem(element.dataset.node); const signalMatches=!ui.graphHighlight || signalOf(item)===ui.graphHighlight; const ownerMatches=!ui.graphOwnerHighlight || item.ownerId===ui.graphOwnerHighlight; element.classList.toggle("dimmed",!signalMatches || !ownerMatches); });
  ui.graphKey = graphKey;
}

function openItem(id, keepTab = false) {
  if (!canViewItem(currentUser(), getItem(id))) return;
  returnFocus = document.activeElement;
  ui.selectedItemId = id; ui.panel = "item"; if (!keepTab) ui.panelTab = "details";
  graphInstance?.select(id);
  document.querySelectorAll("[data-row]").forEach((row) => row.classList.toggle("selected", row.dataset.row === id));
  document.querySelectorAll("[data-gantt-row]").forEach((row) => row.classList.toggle("selected", row.dataset.ganttRow === id));
  renderPanel();
}

function closePanel() {
  ui.panel = "";
  document.querySelector("#panelRoot").innerHTML = "";
  document.body.classList.remove("panel-open");
  if (returnFocus?.isConnected) returnFocus.focus();
}

function renderViewSettingsPanel() {
  const hidden = new Set(state.hiddenTableColumns || []);
  const canConfigureStatuses = canManageGpo(currentUser());
  return `${panelHeader("Preferências locais","Configurações de visualização")}
    <div class="drawer-body">
      <section class="panel-section">
        <h3>Tabela Sintética</h3>
        <p class="muted">As preferências são salvas neste navegador. O ajuste automático remove larguras manuais e permite que o conteúdo determine a largura das colunas.</p>
        <div class="column-settings" aria-label="Colunas visíveis">${tableColumnOptions.map(([key,label]) => `<label><input type="checkbox" data-setting-column="${key}" ${hidden.has(key) ? "" : "checked"} ${key === "name" ? "disabled" : ""}/> ${label}</label>`).join("")}</div>
        <div class="row-actions"><button type="button" class="button primary" data-action="settings-auto-fit">Ajustar colunas automaticamente</button><button type="button" class="button quiet" data-action="settings-reset-columns">Restaurar colunas padrão</button></div>
      </section>
      <section class="panel-section">
        <h3>Cores das linhas</h3>
        <p class="muted">Configure o preenchimento por nível hierárquico. A cor específica do projeto tem prioridade sobre a cor do nível.</p>
        <div class="column-settings">${[0,1,2,3].map((level)=>`<label>Nível ${level}<input type="color" data-row-fill-level="${level}" value="${escapeHtml(state.rowFillSettings?.levels?.[String(level)] || ["#ffffff","#f5f8fa","#edf3f6","#e4edf2"][level])}"/></label>`).join("")}</div>
        <div class="column-settings">${projectOptions().map((project)=>`<label>${escapeHtml(project.title)}<input type="color" data-row-fill-project="${escapeHtml(project.id)}" value="${escapeHtml(state.rowFillSettings?.projects?.[project.id] || state.rowFillSettings?.levels?.["0"] || "#ffffff")}"/></label>`).join("")}</div>
        <button type="button" class="button quiet" data-action="settings-reset-row-colors">Restaurar cores padrão</button>
      </section>
      <section class="panel-section">
        <h3>Preferências do grafo</h3>
        <p class="muted">A posição dos nós é preservada localmente. Use “Redefinir layout” na visão Analítica para descartar as posições salvas.</p>
        <button type="button" class="button quiet" data-action="settings-reset-graph">Restaurar layout do grafo</button>
      </section>
      ${canConfigureStatuses ? '<section class="panel-section"><h3>Estados e aparência</h3><p class="muted">As cores e os ícones dos estados são administrados na área Cadastros, aba Status.</p><button type="button" class="button quiet" data-action="settings-open-statuses">Abrir configurações de status</button></section>' : ""}
      <p class="muted">As configurações são locais e não sincronizam entre dispositivos. Não há backend neste escopo.</p>
    </div>`;
}

function bindDrawerResize(drawer) {
  const handle = drawer.querySelector(".drawer-resize-handle");
  if (!handle) return;
  const clampWidth = (value) => Math.max(320,Math.min(900,Math.round(value)));
  const applyWidth = (value,persist = false) => {
    const width = clampWidth(value);
    drawer.style.setProperty("--drawer-width",width+"px");
    if (persist) { state.drawerWidth = width; saveState(); }
    return width;
  };
  handle.addEventListener("pointerdown",(event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX, startWidth = drawer.getBoundingClientRect().width;
    const move = (nextEvent) => applyWidth(startWidth + startX - nextEvent.clientX);
    const finish = () => {
      applyWidth(drawer.getBoundingClientRect().width,true);
      document.removeEventListener("pointermove",move);
      document.removeEventListener("pointerup",finish);
      document.removeEventListener("pointercancel",finish);
    };
    document.addEventListener("pointermove",move);
    document.addEventListener("pointerup",finish);
    document.addEventListener("pointercancel",finish);
  });
  handle.addEventListener("keydown",(event) => {
    if (!["ArrowLeft","ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const width = drawer.getBoundingClientRect().width + (event.key === "ArrowLeft" ? 16 : -16);
    applyWidth(width,true);
  });
}

function renderPanel(focus = true) {
  const root = document.querySelector("#panelRoot");
  if (!root) return;
  if (!ui.panel) { root.innerHTML = ""; document.body.classList.remove("panel-open"); return; }
  let content = "";
  if (ui.panel === "settings") content = renderViewSettingsPanel();
  if (ui.panel === "create") content = renderCreatePanel();
  else if (ui.panel === "templates") content = renderTemplatesPanel();
  else if (ui.panel === "admin") content = renderAdmin();
  else if (ui.panel === "delete") content = renderDeletionPanel();
  else if (ui.panel === "item" && canViewItem(currentUser(), getItem(ui.selectedItemId))) content = renderItemPanel(getItem(ui.selectedItemId));
  if (!content) { closePanel(); return; }
  const drawerWidth = Math.max(320,Math.min(900,Number(state.drawerWidth) || 780));
  root.innerHTML = `<div class="panel-shade" data-action="close-panel"></div><aside class="drawer" style="--drawer-width:${drawerWidth}px" role="dialog" aria-modal="true" aria-labelledby="panelTitle" tabindex="-1"><span class="drawer-resize-handle" role="separator" aria-orientation="vertical" aria-label="Redimensionar painel" tabindex="0"></span>${content}</aside>`;
  document.body.classList.add("panel-open");
  bindPanel(); bindDrawerResize(root.querySelector(".drawer")); mountIcons();
  if (focus) root.querySelector(".drawer").focus();
}

function panelHeader(eyebrow, title, actions = "") {
  return `<header class="drawer-header"><div><span class="eyebrow">${escapeHtml(eyebrow)}</span><h2 id="panelTitle">${escapeHtml(title)}</h2></div><div class="drawer-header-actions">${actions}<button class="icon-button" data-action="close-panel" aria-label="Fechar painel">${icon("x")}</button></div></header><div id="panelError" class="panel-error" role="alert" hidden></div>`;
}

function editableOrganizations() {
  const user = currentUser();
  return state.organizations.filter((org) => gpoDecision(user, "create_item", { organizationId: org.id, state: org.state }) === true);
}

function ownerOptions(selected) {
  return option("", "Sem responsável", !selected) + state.users.filter((user) => !user.disabled || user.id === selected).map((user) => option(user.id,`${user.name} · ${orgName(user.organizationId)} / ${sectorName(user.sectorId)}`,user.id === selected)).join("");
}

function itemFormFields(item, create = false) {
  const user = currentUser();
  const completed = !create && completeStatus(item.status);
  const summaryGroup = !create && state.items.some(entry=>entry.parentId===item.id && !entry.archivedAt);
  const organizationId = item.organizationId || user.organizationId;
  const canChangeOwner = create || gpoDecision(user,"change_owner",item) === true;
  const canChangeDates = create || gpoDecision(user,"change_duration",item) === true;
  const targetStart = item.targetStartAt || item.baselineStartAt || item.plannedStartAt || today();
  const targetEnd = item.targetDueAt || item.baselineDueAt || item.dueAt || targetStart;
  const targetDuration = inclusiveDurationDays(targetStart,targetEnd);
  return `<label>Nome<input name="title" value="${escapeHtml(item.title||"")}" required maxlength="240" placeholder="Nome da atividade"/></label>
    <div class="form-row">
      <label>Tipo<select name="type">${itemTypes.map(type=>option(type.id,itemTypeConfig(type.id,organizationId).label,(item.type||"task")===type.id)).join("")}</select></label>
      ${create?"":`<label>Status${summaryGroup?" · calculado":""}<select name="status" ${item.type==="approval" || summaryGroup?"disabled":""}>${statusChoices(item.status||"backlog").map(status=>statusOption(status,(item.status||"backlog")===status.id)).join("")}</select></label>`}
    </div>
    <label>Responsável<select name="ownerId" required ${canChangeOwner?"":"disabled"}>${ownerOptions(create ? item.ownerId ?? user.id : item.ownerId)}</select>${canChangeOwner?"":'<small class="secondary">Seu perfil não permite alterar o responsável deste item.</small>'}</label>
    ${create ? `<label>Início esperado<input type="date" name="plannedStartAt" value="${escapeHtml(item.plannedStartAt||today())}" required/></label>` : `<div class="schedule-summary prd42-projection-summary">
      <span>Início projetado<strong>${dateCell(item.plannedStartAt)}</strong></span>
      <span>Término projetado<strong>${dateCell(item.dueAt)}</strong></span>
      <span>Baseline original<strong>${dateCell(item.baselineDueAt||item.dueAt)}</strong></span>
      <span>Progresso<strong>${Math.round(Number(item.progressPercent||0))}%</strong></span>
    </div>`}
    ${summaryGroup ? `<fieldset class="prd42-target-meta">
      <legend>Meta do item pai</legend>
      <p class="secondary">A meta é editável e independe da duração projetada dos filhos. A baseline original fica preservada no histórico.</p>
      <div class="form-row">
        <label>Início-meta vigente<input type="date" name="targetStartAt" value="${escapeHtml(targetStart)}" ${canChangeDates?"":"disabled"} required/></label>
        <label>Duração-meta (dias corridos)<input type="number" name="targetDurationDays" min="1" step="1" value="${Math.max(1,targetDuration)}" ${canChangeDates?"":"disabled"} required/></label>
      </div>
      <label>Término-meta vigente<input type="date" name="targetDueAt" value="${escapeHtml(targetEnd)}" ${canChangeDates?"":"disabled"} required/></label>
      ${canChangeDates?"":'<small class="secondary">Seu perfil não permite alterar metas neste escopo.</small>'}
    </fieldset>
    <div class="prd42-derived-note">Duração projetada pelos filhos: <strong>${item.plannedDurationDays||0} dias</strong>. Alterar a meta não modifica o cronograma dos descendentes.</div>
    <details class="form-details prd42-replan-details">
      <summary>Reprogramar a projeção dos filhos (avançado)</summary>
      <label>Nova data projetada de conclusão do grupo<input type="date" name="replannedDueAt" value="${escapeHtml(item.replannedDueAt||"")}" ${canChangeDates?"":"disabled"}/></label>
      <small>Operação diferente de editar a meta: esta repactuação desloca automaticamente as previsões dos filhos.</small>
    </details>` : `<label>Duração planejada (dias corridos)<input type="number" name="plannedDurationDays" min="0" step="1" value="${escapeHtml(create && item.plannedDurationDays===undefined ? "" : item.plannedDurationDays??0)}" ${completed||!canChangeDates?"disabled":""} ${create?"":"required"}/></label>`}
    ${!create&&!summaryGroup ? `<div class="form-row">
      <label>Peso da atividade<input type="number" name="weight" min="0.1" step="0.1" value="${escapeHtml(item.weight??1)}" ${gpoDecision(user,"change_weight",item)===true?"":"disabled"} required/></label>
      <label>Avanço (%)<input type="number" name="progressPercent" min="0" max="100" step="1" value="${escapeHtml(item.progressPercent??0)}"/></label>
    </div>` : ""}
    ${!create&&!summaryGroup ? `<label>Motivo do bloqueio (opcional)<input name="blockedReason" maxlength="240" value="${escapeHtml(item.blockedReason||"")}" placeholder="Informe o impedimento, se necessário"/></label>` : ""}
    <details class="form-details"><summary>Descrição e contexto</summary><label>Descrição<textarea name="description" rows="3">${escapeHtml(item.description||"")}</textarea></label></details>
    <details class="form-details"><summary>Anexos (opcional)</summary>${gpoDecision(user,"add_attachment",{...item,organizationId,state:item.state||user.state,createdBy:item.createdBy||user.id})===true ? '<label class="attachment-picker">Anexos<input type="file" name="attachments" multiple/><small class="attachment-limits">Até 256 KB por arquivo e 1 MB total.</small></label>' : '<small>Sem permissão para anexar.</small>'}</details>`;
}

function prd5ParseIndentedItems(text) {
  const lines = String(text || "").replace(/\r/g,"").split("\n");
  const nodes = [], ancestors = [];
  for (let lineIndex=0;lineIndex<lines.length;lineIndex++) {
    const raw = lines[lineIndex];
    if (!raw.trim()) continue;
    const indent = (raw.match(/^[\t ]*/) || [""])[0].replace(/ {4}/g,"\t");
    if (indent.includes(" ")) throw new Error("Use Tab (ou grupos de quatro espaços) para a hierarquia. Linha "+(lineIndex+1)+".");
    const depth = indent.length;
    if (!nodes.length && depth !== 0) throw new Error("O primeiro subitem deve começar sem indentação.");
    if (nodes.length && depth > nodes[nodes.length-1].depth+1) throw new Error("A linha "+(lineIndex+1)+" pulou um nível. Indente um nível por vez.");
    const title=raw.slice((raw.match(/^[\t ]*/) || [""])[0].length).trim();
    if (!title || title.length>240) throw new Error("Nome vazio ou maior que 240 caracteres na linha "+(lineIndex+1)+".");
    const parentIndex=depth ? ancestors[depth-1] : -1;
    if (depth && !Number.isInteger(parentIndex)) throw new Error("Hierarquia inválida na linha "+(lineIndex+1)+".");
    nodes.push({title,depth,parentIndex,lineIndex});
    ancestors[depth]=nodes.length-1;
    ancestors.length=depth+1;
    if(nodes.length>100)throw new Error("Limite de 100 subitens por operação.");
  }
  return nodes;
}

function prd5IndentKeydown(event){
  if(event.key!=="Tab"||event.altKey||event.ctrlKey||event.metaKey)return;
  event.preventDefault();
  const input=event.currentTarget,value=input.value,selectionStart=input.selectionStart,selectionEnd=input.selectionEnd;
  const from=value.lastIndexOf("\n",Math.max(0,selectionStart-1))+1;
  const endLine=value.indexOf("\n",selectionEnd);
  const to=endLine<0?value.length:endLine;
  const block=value.slice(from,to);
  const lines=block.split("\n");
  const adjusted=lines.map(line=>{
    if(!event.shiftKey)return "\t"+line;
    return line.startsWith("\t")?line.slice(1):line.startsWith("    ")?line.slice(4):line;
  }).join("\n");
  input.value=value.slice(0,from)+adjusted+value.slice(to);
  input.selectionStart=from+(selectionStart===selectionEnd?adjusted.length:0);
  input.selectionEnd=from+adjusted.length;
  input.dispatchEvent(new Event("input",{bubbles:true}));
}

function renderQuickStepRows(text) {
  const root=document.querySelector("#quickStepRows");if(!root)return;
  const previous=new Map([...root.querySelectorAll(".quick-step-row")].map(row=>[
    Number(row.dataset.stepIndex),
    {type:row.querySelector("[data-step-type]")?.value||"task",owner:row.querySelector("[data-step-owner]")?.value||""}
  ]));
  const summary=document.querySelector("#prd43StepCount"),sequence=document.querySelector("#prd43Sequence");
  let rows;
  try {rows=prd5ParseIndentedItems(text);}
  catch(error){
    root.innerHTML='<div class="prd5-indent-error" role="alert">'+escapeHtml(error.message)+"</div>";
    if(summary)summary.textContent="Corrija a indentação antes de salvar.";
    if(sequence){sequence.checked=false;sequence.disabled=true;}
    return;
  }
  const defaultOwner=document.querySelector('#createItemForm [name="ownerId"]')?.value||currentUser().id;
  root.innerHTML=rows.map((entry,index)=>{
    const saved=previous.get(index);
    const isParent=rows.some(node=>node.parentIndex===index);
    return `<div class="quick-step-row prd43-step-row prd5-step-row ${isParent?"has-children":""}" data-step-index="${index}" data-line-index="${entry.lineIndex}" data-step-depth="${entry.depth}" style="--step-depth:${Math.min(entry.depth,10)}">
      <span class="prd43-step-number" title="Nível ${entry.depth+1}">${entry.depth?"↳":""}${index+1}</span>
      <label class="prd5-step-name"><span class="sr-only">Nome do subitem ${index+1}</span><input name="stepTitle_${index}" data-step-title value="${escapeHtml(entry.title)}" maxlength="240" required aria-label="Nome do subitem ${index+1}, nível ${entry.depth+1}"/></label>
      <label><span class="sr-only">Tipo</span><select name="stepType_${index}" data-step-type aria-label="Tipo do subitem ${index+1}">${itemTypes.map(type=>option(type.id,type.label,(saved?.type||"task")===type.id)).join("")}</select></label>
      <label><span class="sr-only">Responsável</span><select name="stepOwner_${index}" data-step-owner aria-label="Responsável do subitem ${index+1}">${ownerOptions(saved?.owner||defaultOwner)}</select></label>
    </div>`;
  }).join("");
  const leaves=rows.filter((_,index)=>!rows.some(entry=>entry.parentIndex===index)).length;
  if(summary)summary.textContent=rows.length?`${rows.length} subitem(s), ${Math.max(...rows.map(row=>row.depth))+1} nível(is) · ${leaves} atividade(s) final(is)`:"Digite ou cole os subitens. Tab cria um nível; Shift+Tab retorna.";
  if(sequence)sequence.disabled=leaves<2;
}

function renderAttachments(item,editable) {
  const entries = (state.attachments || []).filter((attachment) => attachment.itemId === item.id);
  if (!entries.length) return '<section class="attachment-list"><h3>Anexos e evidências</h3><p class="secondary">Nenhum anexo neste item.</p></section>';
  return '<section class="attachment-list"><h3>Anexos e evidências (' + entries.length + ')</h3><div class="admin-list">' + entries.map((entry) => '<div class="admin-entry"><span><a class="attachment-link" href="' + escapeHtml(entry.dataUrl) + '" download="' + escapeHtml(entry.name) + '">' + icon("paperclip") + escapeHtml(entry.name) + '</a><small>' + escapeHtml(entry.type) + ' · ' + Math.ceil(Number(entry.size || 0) / 1024) + ' KB · ' + escapeHtml(userName(entry.createdBy)) + ' · ' + escapeHtml(formatDateTime(entry.createdAt)) + '</small></span>' + (editable && gpoDecision(currentUser(),"delete_attachment",item) === true ? '<button type="button" class="icon-button delete-icon" data-delete-kind="attachment" data-delete-id="' + escapeHtml(entry.id) + '" aria-label="Excluir anexo ' + escapeHtml(entry.name) + '">' + icon("trash-2") + '</button>' : '') + '</div>').join("") + '</div><p class="secondary">Os arquivos permanecem neste navegador e não são enviados a um serviço compartilhado.</p></section>';
}

function updateSchedulePreview() {
  const input=document.querySelector("#prd43PasteActivities");
  if(input)renderQuickStepRows(input.value);
}

function renderCreatePanel() {
  const requestedParent=getItem(ui.createParentId);
  const allowedParents=accessibleItems().filter(item=>
    canEditItem(currentUser(),item)&&canCreateItem(currentUser(),{...item,createdBy:currentUser().id})
    &&gpoDecision(currentUser(),"create_relation",item)===true);
  const parent=requestedParent&&allowedParents.some(item=>item.id===requestedParent.id)?requestedParent:null;
  const ownerId=parent?.ownerId||currentUser().id;
  const parentLabel=parent?"Subitem de: "+parent.title:"Item independente (nível principal)";
  const attachContext={...(parent||{}),organizationId:parent?.organizationId||currentUser().organizationId,state:parent?.state||currentUser().state,createdBy:currentUser().id};
  return `${panelHeader("Criar item",parent?"Novo subitem":"Novo item")}
    <form id="createItemForm" class="drawer-body form-stack prd42-create-form prd5-create-form">
      <div class="prd42-create-context">
        <strong id="prd42ParentHelp">${escapeHtml(parentLabel)}</strong>
        <label>Onde criar?<select name="parentId" id="prd42ParentSelect">
          ${option("","Nível principal — item independente",!parent)}
          ${allowedParents.map(item=>option(item.id,"Dentro de "+item.title,item.id===parent?.id)).join("")}
        </select></label>
      </div>
      <div class="prd5-create-top">
        <label class="prd5-root-name">Nome do item<input name="title" autocomplete="off" maxlength="240" placeholder="Nome do pacote ou atividade principal" required autofocus/></label>
        <label>Tipo<select name="type">${itemTypes.map(type=>option(type.id,itemTypeConfig(type.id,parent?.organizationId||currentUser().organizationId).label,type.id===(parent?"task":"project"))).join("")}</select></label>
        <label>Responsável<select name="ownerId" required>${ownerOptions(ownerId)}</select></label>
        <label>Início previsto<input type="date" name="plannedStartAt" value="${escapeHtml(parent?.baselineStartAt||parent?.plannedStartAt||today())}" required/></label>
        <input type="hidden" name="plannedDurationDays" value="1"/>
      </div>
      <section class="prd43-create-activities prd5-create-activities" aria-label="Cadastro hierárquico de subitens">
        <div class="prd43-activities-head"><strong>Subitens</strong><span id="prd43StepCount" class="secondary">Digite ou cole os subitens. Tab cria um nível; Shift+Tab retorna.</span></div>
        <label class="prd5-source-label">Digite a estrutura (um item por linha)
          <textarea name="quickSteps" id="prd43PasteActivities" rows="10" placeholder="Atividade 1&#10;Atividade 2&#10;    Subitem 2.1&#10;        Etapa 2.1.1&#10;Atividade 3" spellcheck="false" aria-describedby="prd5IndentHelp"></textarea>
          <small id="prd5IndentHelp">O texto é a origem da hierarquia. Pressione Tab no início da linha para criar subitem e Shift+Tab para voltar um nível.</small>
        </label>
        <div class="prd5-result-area"><span class="prd5-result-title">Resultado editável <small>Tipo e responsável por item</small></span>
          <div id="quickStepRows" class="prd43-steps-table" aria-live="polite"></div>
        </div>
        <label class="prd43-sequence-toggle"><input type="checkbox" name="autoSequence" value="1" id="prd43Sequence" disabled/>
          Criar sequência TI automaticamente <small>Somente entre atividades finais, na ordem digitada.</small>
        </label>
      </section>
      <details class="form-details prd42-create-extras prd5-create-details">
        <summary>Descrição e anexos (opcional)</summary>
        <label>Descrição<textarea name="description" rows="3" placeholder="Contexto ou critérios de conclusão"></textarea></label>
        ${gpoDecision(currentUser(),"add_attachment",attachContext)===true?'<label>Anexos<input type="file" name="attachments" multiple/><small>Armazenamento local do navegador.</small></label>':""}
      </details>
      <div class="drawer-actions prd42-create-actions"><span class="secondary prd43-one-save-hint">Um único salvamento cria toda a hierarquia.</span>
        <button class="button primary" type="submit">${icon("check")}Criar ${parent?"subitem":"item"}</button>
        <button class="button quiet" type="button" data-action="close-panel">Cancelar</button>
      </div>
    </form>`;
}

function historyEventsFor(rootItem) {
  const allowed = new Set(state.items.filter((item)=>canViewItem(currentUser(),item)).map((item)=>item.id));
  const descendants = new Set([rootItem.id]);
  let changed = true;
  while (changed) { changed=false; for (const item of state.items) { if (allowed.has(item.id) && item.parentId && descendants.has(item.parentId) && !descendants.has(item.id)) { descendants.add(item.id); changed=true; } } }
  return state.events.filter((event)=>descendants.has(event.itemId) && allowed.has(event.itemId));
}

function renderItemPanel(item) {
  const editable = canEditItem(currentUser(), item);
  const relations = relationsFor(accessibleItems()).filter((rel) => rel.sourceId === item.id || rel.targetId === item.id);
  const events = historyEventsFor(item);
  const tabs = [{id:"details",label:editable ? "Atualizar" : "Detalhes"},{id:"history",label:"Histórico (" + events.length + ")"}];
  if(ui.panelTab==="relations")ui.panelTab="details";
  if (item.type === "approval") tabs.push({id:"approval",label:"Aprovação"});
  const canAddChild = editable && canCreateItem(currentUser(),{...item,createdBy:currentUser().id}) && gpoDecision(currentUser(),"create_relation",item)===true;
  let html = panelHeader(shortId(item) + " · " + labelOf(itemTypes,item.type), item.title,
    (canAddChild ? '<button class="button quiet" data-action="new-subitem">' + icon("plus") + 'Criar subitem</button>' : "")
    + (editable ? '<button class="button quiet" data-action="archive-item">' + icon("archive") + 'Arquivar</button>' : "")
    + (canRemoveItem(currentUser(),item) ? deleteButton("item",item.id,item.title) : ""));
  html += '<div class="item-summary">' + statusBadge(item) + '<span>' + plannedLabel(item) + '</span>' + (prd43ProgressBasis(item)?'<small class="prd43-progress-basis">'+escapeHtml(prd43ProgressBasis(item))+' · '+Math.round(Number(item.progressPercent||0))+'% consolidado</small>':"") + '</div>';
  html += '<div class="panel-tabs" role="tablist" aria-label="Detalhes do item">' + tabs.map((tab) => '<button role="tab" aria-selected="' + (ui.panelTab === tab.id) + '" class="' + (ui.panelTab === tab.id ? "active" : "") + '" data-panel-tab="' + tab.id + '">' + tab.label + '</button>').join("") + '</div><div class="drawer-body">';
  if (ui.panelTab === "details") html += editable
    ? '<form id="updateItemForm" class="form-stack">' + itemFormFields(item) + '<details class="form-details prd42-update-log"><summary>Registro da atualização · data e comentário</summary><div class="change-box"><label>Data e hora da mudança<input type="datetime-local" name="effectiveAt" value="' + toLocalInput() + '" required/></label><label>Comentário da atualização<textarea name="comment" rows="2" placeholder="O que mudou? (opcional)"></textarea></label></div></details><div class="drawer-actions"><button class="button primary" type="submit">' + icon("check") + 'Salvar atualização</button></div></form>' + renderAttachments(item,true) + renderChildren(item)
    : renderReadOnly(item) + renderAttachments(item,false) + renderChildren(item);
  if (ui.panelTab === "details" && editable && ["project","process"].includes(item.type)) html += '<form id="templateSaveForm" class="form-stack"><h3>Reutilizar este fluxo</h3><label>Nome do modelo<input name="name" value="' + escapeHtml(item.title) + '" required maxlength="120"/></label><button class="button quiet" type="submit">' + icon("workflow") + 'Salvar como modelo</button></form>';

  if (ui.panelTab === "history") html += prd5HistoryPanel(events,item.id);
  if (ui.panelTab === "approval" && item.type === "approval") html += renderApprovalPanel(item);
  return html + '</div>';
}

function renderReadOnly(item) {
  const hasChildren=state.items.some(child=>child.parentId===item.id&&!child.archivedAt);
  const targetStart=item.targetStartAt||item.baselineStartAt||item.plannedStartAt;
  const targetDue=item.targetDueAt||item.baselineDueAt||item.dueAt;
  return `<dl class="item-facts"><dt>Responsável</dt><dd>${escapeHtml(userName(item.ownerId))}</dd>${hasChildren?`<dt>Início-meta</dt><dd>${dateCell(targetStart)}</dd><dt>Término-meta</dt><dd>${dateCell(targetDue)}</dd><dt>Duração-meta</dt><dd>${inclusiveDurationDays(targetStart,targetDue)} dias corridos</dd>`:""}<dt>Início projetado</dt><dd>${dateCell(item.plannedStartAt)}</dd><dt>Início real</dt><dd>${dateCell(item.actualStartAt,true)}</dd><dt>Liberada em</dt><dd>${dateCell(activityStartAt(item),true)}</dd><dt>Término projetado</dt><dd>${dateCell(item.dueAt)}</dd><dt>Término real</dt><dd>${dateCell(item.completedAt,true)}</dd><dt>Duração total</dt><dd>${elapsedLabel(item)}</dd><dt>Duração da atividade</dt><dd>${activityDurationLabel(item)}</dd><dt>Empresa / setor</dt><dd>${escapeHtml(orgName(item.organizationId))} / ${escapeHtml(sectorName(item.sectorId))}</dd><dt>Última mudança</dt><dd>${dateCell(item.lastChangeAt,true)}</dd></dl>${item.description ? `<p class="item-description">${escapeHtml(item.description)}</p>` : ""}<p class="read-only-note">Sua visualização é determinada pelo GPO.</p>`;
}

function renderChildren(item) {
  const children = childrenOf(item.id);
  return children.length ? `<section class="panel-section"><h3>Subitens <span>${children.length}</span></h3><div class="child-list">${children.map((child) => `<button data-select="${escapeHtml(child.id)}"><span class="signal ${signalOf(child)}"></span><span><strong>${escapeHtml(child.title)}</strong><small>${escapeHtml(userName(child.ownerId))} · ${dateCell(child.dueAt)}</small></span>${icon("chevron-right")}</button>`).join("")}</div></section>` : "";
}

function renderRelations(item, relations, editable) {
  const candidates = accessibleItems().filter((candidate) => candidate.id !== item.id && canEditItem(currentUser(),candidate));
  const editableCandidates = accessibleItems().filter((candidate) => canEditItem(currentUser(),candidate));
  return `<div class="relation-list">${relations.length ? relations.map((rel) => {
    const outgoing = rel.sourceId === item.id;
    const other = getItem(outgoing ? rel.targetId : rel.sourceId);
    const deleteRule = gpoDecision(currentUser(),"delete_relation",other);
    const remove = deleteRule === true && canEditItem(currentUser(),other);
    const canEditRelation = gpoDecision(currentUser(),"edit_relation",other) === true && canEditItem(currentUser(),getItem(rel.sourceId)) && canEditItem(currentUser(),getItem(rel.targetId));
    if (ui.relationEditId === rel.id && canEditRelation) return `<form id="relationUpdateForm" class="relation-edit-form"><strong>Editar relação</strong><label>Origem<select name="sourceId">${editableCandidates.map((candidate) => option(candidate.id,itemContextLabel(candidate),candidate.id === rel.sourceId)).join("")}</select></label><label>Destino<select name="targetId">${editableCandidates.map((candidate) => option(candidate.id,itemContextLabel(candidate),candidate.id === rel.targetId)).join("")}</select></label><div class="form-row"><label>Tipo<select name="relationType">${relationTypes.map((type) => option(type.id,type.label,type.id === rel.relationType)).join("")}</select></label><label>Defasagem<input name="lagDays" type="number" step="0.5" value="${escapeHtml(rel.lagDays || 0)}"/></label></div><label>Descrição<textarea name="description" rows="2">${escapeHtml(rel.description || "")}</textarea></label><div class="row-actions"><button class="button primary" type="submit">Salvar relação</button><button class="button quiet" type="button" data-action="cancel-relation-edit">Cancelar</button></div></form>`;
    return `<div class="relation-entry"><span class="relation-tag">${escapeHtml(labelOf(relationTypes,rel.relationType))}${rel.lagDays ? ` · ${rel.lagDays > 0 ? "+" : ""}${rel.lagDays}d` : ""}</span><span class="relation-direction">${outgoing ? "Este item →" : "→ Este item"}</span><button class="relation-item" data-select="${escapeHtml(other.id)}">${escapeHtml(itemContextLabel(other))}</button>${canEditRelation ? `<button class="button quiet" data-edit-relation="${escapeHtml(rel.id)}" title="Editar tipo da relação">${icon("pencil")}Editar</button>` : ""}${remove ? `<button class="icon-button" data-remove-relation="${escapeHtml(rel.id)}" title="Remover relação" aria-label="Remover relação">${icon("trash-2")}</button>` : ""}</div>`;
  }).join("") : '<p class="secondary">Nenhuma relação visível.</p>'}</div>
    ${editable && candidates.length && gpoDecision(currentUser(),"create_relation",item) === true ? `<section class="panel-section"><h3>Nova relação</h3><form id="relationForm" class="form-stack"><label>Direção<select name="direction">${option("out","Este item se relaciona com…")}${option("in","Outro item se relaciona com este…")}</select></label><label>Outro item<select name="otherId" required>${candidates.map((candidate) => option(candidate.id,itemContextLabel(candidate))).join("")}</select></label><div class="form-row"><label>Relação<select name="relationType">${relationTypes.map((type) => option(type.id,type.label,type.id === "TI")).join("")}</select></label><label>Defasagem (dias)<input name="lagDays" type="number" step="0.5" value="0"/></label></div><label>Descrição ou justificativa<textarea name="description" rows="2" placeholder="Opcional"></textarea></label><button class="button primary" type="submit">${icon("link-2")}Conectar itens</button></form><details class="form-details relation-help"><summary>O que significa cada dependência?</summary><p><strong>TI:</strong> o término do primeiro libera o início do segundo.</p><p><strong>II:</strong> o início do primeiro libera o início do segundo.</p><p><strong>TT:</strong> o término do primeiro libera o término do segundo.</p><p><strong>IF:</strong> o início do primeiro libera o término do segundo.</p><p>A defasagem acrescenta ou antecipa dias entre os eventos.</p></details></section>` : ""}`;
}

const eventLabels = { created:"Criação", status_changed:"Status", owner_changed:"Responsável", title_changed:"Nome", due_changed:"Término ideal", start_changed:"Início ideal original", duration_changed:"Duração planejada", replanned_due_changed:"Repactuação de término", description_changed:"Descrição", context_changed:"Contexto", type_changed:"Tipo", weight_changed:"Peso", progress_changed:"Progresso", comment:"Comentário", relation_created:"Relação criada", relation_removed:"Relação removida", reopened:"Reabertura", completed:"Conclusão", item_removed:"Item removido", archived:"Arquivamento", restored:"Restauração", parent_changed:"Item pai", approval_submitted:"Enviado para aprovação", approval_decided:"Decisão de aprovação", approval_revision_started:"Correção iniciada", approval_reopened:"Aprovação reaberta", attachment_added:"Anexo adicionado", attachment_removed:"Anexo removido", order_changed:"Ordem visual", started:"Início real", relation_updated:"Tipo da relação", relation_lag_changed:"Defasagem da relação", relation_description_changed:"Descrição da relação", relation_retargeted:"Relação redirecionada", blocked_set:"Bloqueio sinalizado", blocked_cleared:"Bloqueio removido", blocked_reason_changed:"Motivo do bloqueio" };

function eventValue(event, value) {
  if (!value) return "—";
  if (["status_changed","created","approval_submitted","approval_decided","approval_revision_started","approval_reopened"].includes(event.eventType)) { const item=getItem(event.itemId); if(item?.type==="approval" && value==="under_review") return "Aguardando decisão"; if(item?.type==="approval" && value==="correction") return "Correção solicitada"; return labelOf(statusCatalog,value); }
  if (event.eventType === "owner_changed") return userName(value);
  // R2-10: valores guardados como ids são exibidos pelo nome atual do registro.
  if (event.eventType === "context_changed") return state.organizations.find((entry) => entry.id === value)?.name || state.sectors.find((entry) => entry.id === value)?.name || value;
  if (["parent_changed","relation_retargeted"].includes(event.eventType)) return getItem(value)?.title || value;
  if (["relation_created","relation_removed","relation_updated"].includes(event.eventType)) return labelOf(relationTypes,value);
  if (event.eventType === "relation_lag_changed") return `${value} dias`;
  if (["started","archived"].includes(event.eventType) && Number.isFinite(new Date(value).getTime())) return formatDateTime(value);
  if (event.eventType === "reopened") return labelOf(statusCatalog,value);
  if (event.eventType === "type_changed") return labelOf(itemTypes,value);
  if (["due_changed","start_changed","replanned_due_changed"].includes(event.eventType)) return dateCell(value);
  if (event.eventType === "duration_changed") return `${value} dias corridos`;
  return value;
}

function renderHistory(events, rootItemId = "") {
  const sorted = [...events].sort((a,b) => new Date(b.effectiveAt) - new Date(a.effectiveAt) || new Date(b.createdAt) - new Date(a.createdAt));
  return `<ol class="event-timeline">${sorted.map((event) => `<li class="${event.eventType==='status_changed'?'prd43-event-status':''}" style="${event.eventType==='status_changed'?'--prd43-event-color:'+statusConfig(event.toValue).color:''}"><span class="event-dot"></span><div class="event-heading"><strong>${escapeHtml(eventLabels[event.eventType] || event.eventType)}</strong>${event.itemId !== rootItemId ? `<span class="event-origin">${escapeHtml(getItem(event.itemId)?.title || "Item arquivado")}</span>` : ""}<time>${formatDateTime(event.effectiveAt)}</time></div>${event.fromValue || event.toValue ? `<p class="event-values"><span><b>Antes:</b> ${escapeHtml(eventValue(event,event.fromValue))}</span><span>→</span><span><b>Depois:</b> ${escapeHtml(eventValue(event,event.toValue))}</span></p>` : ""}${event.comment ? `<p>${escapeHtml(event.comment)}</p>` : ""}<small>${escapeHtml(event.actorNameSnapshot || userName(event.userId))} · ${escapeHtml(event.organizationNameSnapshot || "Sem empresa")} / ${escapeHtml(event.sectorNameSnapshot || "Sem setor")} ${event.stateSnapshot ? "· " + escapeHtml(event.stateSnapshot) : ""} · Registrado ${formatDateTime(event.createdAt)}</small></li>`).join("")}</ol>`;
}

function prd5HistoryPanel(events,itemId){
  const current=ui.prd5HistoryFilters||{user:"",organization:"",sector:""};
  const matching=events.filter(e=>(!current.user||e.userId===current.user)&&(!current.organization||e.organizationIdSnapshot===current.organization)&&(!current.sector||e.sectorIdSnapshot===current.sector));
  const filters='<div class="prd5-history-filters"><label>Usuário<select id="prd5HistoryUser">'+option("","Todos",!current.user)+state.users.map(u=>option(u.id,u.name,current.user===u.id)).join("")+'</select></label><label>Empresa<select id="prd5HistoryOrganization">'+option("","Todas",!current.organization)+state.organizations.map(o=>option(o.id,o.name,current.organization===o.id)).join("")+'</select></label><label>Setor<select id="prd5HistorySector">'+option("","Todos",!current.sector)+state.sectors.filter(se=>!current.organization||se.organizationId===current.organization).map(se=>option(se.id,se.name,current.sector===se.id)).join("")+'</select></label></div>';
  return filters+(matching.length?renderHistory(matching,itemId):'<p class="secondary">Nenhuma movimentação para os filtros selecionados.</p>');
}
function renderApprovalPanel(item) {
  const gate = approvalGate(item);
  const user = currentUser();
  const canDecide = canDecideApproval(user,item);
  const canSubmit = canSubmitApproval(user,item);
  const requestId = item.approvalRequestId || item.id;
  const decisions = (state.approvalDecisions || []).filter((entry) => entry.requestId === requestId || entry.itemId === item.id).sort((left,right) => new Date(left.createdAt) - new Date(right.createdAt));
  const revision = item.supersededBy ? getItem(item.supersededBy) : state.items.find((entry) => entry.revisionOf === item.id);
  let html = '<section class="panel-section"><h3>Fluxo de aprovação</h3>';
  html += '<p>Rodada ' + (item.approvalRound || 1) + ' · Responsável pela decisão: <strong>' + escapeHtml(userName(item.approvalReviewerId || item.ownerId)) + '</strong></p>';
  if (!gate.released && !["done","correction","cancelled"].includes(item.status)) html += '<div class="change-box"><strong>Aguardando predecessoras</strong><ul>' + gate.blockers.map((blocker) => '<li>' + escapeHtml(blocker.title) + ' · ' + escapeHtml(statusDisplayLabel(blocker)) + '</li>').join("") + '</ul></div>';
  if (item.status === "under_review") {
    if (!gate.released) html += '<p class="muted">A decisão será liberada quando todas as predecessoras forem concluídas.</p>';
    else if (canDecide) {
      const correctionUsers = state.users.filter((entry) => !entry.disabled && entry.organizationId === item.organizationId);
      html += '<form id="approvalDecisionForm" class="form-stack"><input type="hidden" name="outcome" value="approved"/><div class="approval-choices" role="group" aria-label="Decisão"><button type="button" class="button quiet active" data-approval-outcome="approved" aria-pressed="true">' + icon("check") + 'Aprovar</button><button type="button" class="button quiet" data-approval-outcome="rejected" aria-pressed="false">' + icon("x") + 'Reprovar e solicitar correção</button></div><label>Responsável pela correção<select name="correctionOwnerId" data-correction-owner><option value="">Selecione o responsável ao reprovar</option>' + correctionUsers.map((entry) => option(entry.id,entry.name)).join("") + '</select></label><label>Motivo ou observação<textarea name="reason" rows="3" data-decision-reason placeholder="Obrigatório para reprovar"></textarea></label><button class="button primary" type="submit">' + icon("check") + 'Registrar decisão</button></form>';
    } else html += '<p class="muted">A decisão está atribuída a ' + escapeHtml(userName(item.approvalReviewerId || item.ownerId)) + '. As permissões são verificadas pelo GPO.</p>';
  } else if (item.status === "correction" && canSubmit && (item.correctionOwnerId === user.id || gpoDecision(user,"decide_approval",item) === true)) {
    html += '<p>Correção atribuída a <strong>' + escapeHtml(userName(item.correctionOwnerId)) + '</strong>.'+(item.correctionItemId && getItem(item.correctionItemId)?' <button class="button quiet" data-select="'+escapeHtml(item.correctionItemId)+'">Abrir correção</button>':'')+'</p>'+(!gate.released?'<p class="change-box">Conclua a tarefa de correção antes de reenviar.</p>':'<form id="approvalSubmitForm" class="form-stack"><label>Resumo da correção<textarea name="note" rows="3" placeholder="O que foi corrigido?"></textarea></label><button class="button primary" type="submit">' + icon("check") + 'Reenviar para aprovação</button></form>');
  } else if (item.status === "done") {
    if (canDecide) html += '<form id="approvalReopenForm" class="form-stack"><label>Motivo da reabertura<textarea name="note" rows="3" required placeholder="Descreva por que a decisão precisa ser revista"></textarea></label><label>Novo percentual de conclusão<input name="progressPercent" type="number" min="0" max="99" step="1" placeholder="0 a 99%" required/></label><button class="button quiet" type="submit">' + icon("rotate-ccw") + 'Reabrir aprovação</button></form>';
    else html += '<p>Decisão concluída. Uma nova rodada pode ser aberta por uma regra GPO autorizada.</p>';
  } else if (["backlog","ready","in_progress"].includes(item.status)) {
    if (!gate.released) html += '<p class="muted">A etapa ainda não está liberada para aprovação.</p>';
    else if (canSubmit) html += '<form id="approvalSubmitForm" class="form-stack"><label>Contexto para o aprovador<textarea name="note" rows="2" placeholder="Informação que acompanha a solicitação"></textarea></label><button class="button primary" type="submit">' + icon("check") + 'Enviar para aprovação</button></form>';
    else html += '<p class="muted">O GPO não permite enviar esta etapa.</p>';
  } else if (item.superseded && revision) {
    html += '<p class="change-box">Esta etapa foi reprovada e preservada no histórico. A revisão ativa é <strong>' + escapeHtml(revision.title) + '</strong>.</p><button type="button" class="button quiet" data-select="' + escapeHtml(revision.id) + '">Abrir revisão ' + (revision.approvalRound || "") + '</button>';
  }
  html += '</section><section class="panel-section"><h3>Decisões e rodadas</h3>';
  if (!decisions.length) html += '<p class="muted">Nenhuma decisão registrada ainda.</p>';
  else html += '<ol class="event-timeline">' + decisions.map((entry) => {
    const labels = {submitted:"Enviada para decisão",decision:entry.outcome === "approved" ? "Aprovada" : "Reprovada · correção vinculada",correction_started:"Correção iniciada",reopened:"Aprovação reaberta"};
    return '<li><span class="event-dot"></span><div class="event-heading"><strong>Rodada ' + entry.round + ' · ' + (labels[entry.kind] || entry.kind) + '</strong><time>' + formatDateTime(entry.createdAt) + '</time></div>' +
      (entry.reason ? '<p>' + escapeHtml(entry.reason) + '</p>' : '') +
      (entry.reviewerId ? '<small>Decisor: ' + escapeHtml(userName(entry.reviewerId)) + '</small>' : '') +
      (entry.correctionOwnerId ? '<small> · Correção: ' + escapeHtml(userName(entry.correctionOwnerId)) + '</small>' : '') +
      '<small> · Registrado por ' + escapeHtml(userName(entry.createdBy)) + '</small></li>';
  }).join("") + '</ol>';
  return html + '</section>';
}

function renderTemplatesPanel() {
  const user = currentUser();
  const templates = (state.templates || []).filter((entry) => gpoDecision(user,"view_item",{organizationId:entry.organizationId,state:state.organizations.find((org) => org.id === entry.organizationId)?.state}) === true);
  let html = panelHeader(ui.templateCreationMode ? "Criar conforme template" : "Modelos",ui.templateCreationMode ? "Escolha e revise um fluxo para criar novas instâncias" : "Fluxos reutilizáveis");
  html += '<div class="drawer-body"><p class="muted">' + (ui.templateCreationMode ? 'Selecione um modelo e revise seus dados antes de criar. O modelo original não será alterado.' : 'Gerencie, escolha e aplique um modelo diretamente neste painel.') + '</p>';
  if (!templates.length) html += '<p class="secondary">Nenhum modelo disponível para esta empresa. Abra um projeto ou processo editável e salve-o como modelo.</p>';
  else html += '<div class="admin-list">' + templates.map((entry) => '<div class="admin-entry"><span><strong>' + escapeHtml(entry.name) + '</strong><small>' + escapeHtml(orgName(entry.organizationId)) + ' · ' + entry.items.length + ' itens · ' + entry.relations.length + ' relações</small></span><button type="button" class="button quiet" data-apply-template="' + escapeHtml(entry.id) + '">' + 'Usar modelo' + '</button>' + ((!ui.templateCreationMode && (entry.createdBy === user.id || canManageGpo(user))) ? '<button type="button" class="icon-button delete-icon" data-remove-template="' + escapeHtml(entry.id) + '" aria-label="Excluir modelo">' + icon("trash-2") + '</button>' : '') + '</div>').join("") + '</div>';
  const selected = templates.find((entry) => entry.id === ui.templateId);
  if (selected) {
    const organizations = editableOrganizations();
    const organizationId = organizations.some((entry) => entry.id === user.organizationId) ? user.organizationId : organizations[0]?.id || "";
    const sectors = state.sectors.filter((entry) => entry.organizationId === organizationId);
    const itemRows = selected.items.map((entry) => {
      const initialStatus = entry.status === "rejected" ? "correction" : entry.status || "backlog";
      const owners = state.users.filter((candidate) => !candidate.disabled);
      const selectedOwner = owners.some((candidate) => candidate.id === entry.ownerId && candidate.organizationId === organizationId) ? entry.ownerId : user.id;
      return '<div class="template-review-row"><strong>' + escapeHtml(entry.title) + '<small>' + escapeHtml(labelOf(itemTypes,entry.type)) + '</small></strong><label>Status<select name="status_' + escapeHtml(entry.key) + '">' + statusCatalog.filter((status)=>!["under_review","correction"].includes(status.id)).map((status) => statusOption(status,status.id === initialStatus)).join("") + '</select></label><label>Responsável<select name="owner_' + escapeHtml(entry.key) + '">' + owners.map((candidate) => option(candidate.id,candidate.name + ' · ' + orgName(candidate.organizationId),candidate.id === selectedOwner)).join("") + '</select></label></div>';
    }).join("");
    html += '<section class="panel-section"><h3>Revisar aplicação</h3><p>O fluxo cria novas identidades e relações. Datas e dados organizacionais são ajustados para o workspace de destino.</p><form id="templateApplyForm" class="form-stack"><label>Nome do fluxo<input name="title" value="' + escapeHtml(selected.rootTitle) + '" required maxlength="240"/></label><div class="form-row"><label>Empresa<select name="organizationId" id="templateOrganization">' + organizations.map((entry) => option(entry.id,entry.name,entry.id === organizationId)).join("") + '</select></label><label>Setor<select name="sectorId" id="templateSector">' + sectors.map((entry) => option(entry.id,entry.name,entry.id === user.sectorId)).join("") + '</select></label></div><div class="form-row"><label>Estado (UF)<input name="state" value="' + escapeHtml(user.state) + '" maxlength="2" required/></label><label>Data inicial<input type="date" name="startDate" value="' + today() + '" required/></label></div><details class="form-details" open><summary>Itens, status e responsáveis (' + selected.items.length + ')</summary><div class="template-review-list">' + itemRows + '</div></details><button class="button primary" type="submit">' + icon("plus") + 'Criar fluxo a partir do modelo</button></form></section>';
  }
  return html + '</div>';
}

function renderArchivedItems() {
  const items=state.items.filter((item)=>item.archivedAt && canEditItem(currentUser(),item)).sort((a,b)=>new Date(b.archivedAt)-new Date(a.archivedAt));
  return `<section class="panel-section"><h3>Itens arquivados (${items.length})</h3><p class="muted">Arquivar preserva o histórico e a hierarquia. Restaurar um pai restaura também os descendentes arquivados.</p>${items.length ? `<div class="admin-list">${items.map((item)=>`<div class="admin-entry"><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(userName(item.archivedBy))} · ${formatDateTime(item.archivedAt)}</small></span><button class="button quiet" data-restore-item="${escapeHtml(item.id)}">${icon("rotate-ccw")}Restaurar</button></div>`).join("")}</div>` : `<p class="muted">Nenhum item arquivado.</p>`}</section>`;
}

function renderStatusSettings() {
  state.statusSettings ||= {};
  return `<section class="panel-section"><h3>Status operacionais</h3><p class="muted">Personalize o ícone e a cor exibidos para cada status. A mudança afeta a apresentação, não as regras de transição.</p><div class="type-settings-list">${statusCatalog.filter((status)=>!["under_review","correction"].includes(status.id)).map((status)=>{ const config=statusConfig(status.id); return `<form class="type-setting form-row" data-status-setting="${escapeHtml(status.id)}"><strong>${icon(config.icon)}${escapeHtml(status.label)}</strong><label>Ícone<select name="icon">${availableItemIcons.map((name)=>option(name,name,name===config.icon)).join("")}</select></label><label>Cor<input name="color" type="color" value="${escapeHtml(config.color)}" required/></label><button class="button quiet" type="submit">Salvar</button></form>`; }).join("")}</div></section>`;
}

function renderGpo() {
  const scopes = [{type:"global",id:"",label:"Toda a plataforma"}];
  [...new Set(state.organizations.map((entry) => entry.state).filter(Boolean))].forEach((stateCode) => scopes.push({type:"state",id:stateCode,label:"Estado · " + stateCode}));
  state.organizations.forEach((entry) => scopes.push({type:"organization",id:entry.id,label:"Empresa · " + entry.name}));
  state.sectors.forEach((entry) => scopes.push({type:"sector",id:entry.id,label:"Setor · " + orgName(entry.organizationId) + " / " + entry.name}));
  state.items.filter((entry) => entry.type === "project").forEach((entry) => scopes.push({type:"project",id:entry.id,label:"Projeto · " + itemContextLabel(entry)}));
  state.items.forEach((entry) => scopes.push({type:"item",id:entry.id,label:"Item · " + itemContextLabel(entry)}));
  let html = '<section class="panel-section"><h3>Gestão de Permissões Organizacionais</h3><p class="muted">O GPO é a única origem de autorização neste protótipo. Escopo mais específico prevalece; em empate, negar prevalece. Sem regra aplicável, o acesso é negado.</p>';

  html += '<form id="gpoRuleForm" class="form-stack"><label>Usuário ou perfil<select name="subject" required>';
  html += state.users.filter((entry) => !entry.disabled).map((entry) => '<option value="user:' + escapeHtml(entry.id) + '">' + escapeHtml(entry.name) + ' · ' + escapeHtml(orgName(entry.organizationId)) + '</option>').join("");
  html += (state.permissionProfiles || []).map((profile) => '<option value="profile:' + escapeHtml(profile.id) + '">Perfil · ' + escapeHtml(profile.name) + '</option>').join("");
  html += '</select></label><label>Operação<select name="operation" required>';
  html += Object.entries(permissionOperationLabels).map(([id,label]) => option(id,label)).join("");
  html += '</select></label><label>Escopo<select name="scope" required>';
  html += scopes.map((scope) => '<option value="' + scope.type + ':' + escapeHtml(scope.id || "*") + '">' + escapeHtml(scope.label) + '</option>').join("");
  html += '</select></label><label>Efeito<select name="effect"><option value="allow">Permitir</option><option value="deny">Negar</option></select></label><button class="button primary" type="submit">' + icon("plus") + 'Adicionar regra</button></form></section>';
  const rules = [...(state.permissionRules || [])].sort((a,b) => userName(a.subjectId).localeCompare(userName(b.subjectId)) || a.operation.localeCompare(b.operation));
  html += '<section class="panel-section"><h3>Regras aplicadas (' + rules.length + ')</h3>';
  if (!rules.length) html += '<p class="muted">Nenhuma regra GPO configurada. Os acessos ficam bloqueados.</p>';
  else html += '<div class="admin-list">' + rules.map((rule) => {
    const scope = rule.scopeId === "@user" ? "Empresa do usuário" : scopes.find((entry) => entry.type === rule.scopeType && entry.id === (rule.scopeId || ""))?.label || (rule.scopeType === "creator" ? "Itens criados pelo usuário" : "Escopo removido");
    return '<div class="admin-entry"><span><strong>' + escapeHtml(rule.subjectType === "profile" ? ((state.permissionProfiles || []).find((profile)=>profile.id===rule.subjectId)?.name || "Perfil removido") : userName(rule.subjectId)) + ' · ' + escapeHtml(permissionOperationLabels[rule.operation] || rule.operation) + '</strong><small>' + escapeHtml(scope) + (rule.createdBy === "migration" ? ' · migrada' : ' · ' + formatDateTime(rule.createdAt)) + '</small></span><span class="effect-tag">' + (rule.effect === "allow" ? "Permitido" : "Negado") + '</span><button type="button" class="icon-button delete-icon" data-remove-gpo-rule="' + escapeHtml(rule.id) + '" aria-label="Remover regra GPO">' + icon("trash-2") + '</button></div>';
  }).join("") + '</div>';
  return html + '</section>';
}

function renderUserEditForm() {
  const user = state.users.find((entry) => entry.id === ui.editUserId);
  if (!user || !canManageUsers(currentUser(),user.organizationId)) return "";
  const organizations = state.organizations.filter((org) => canManageUsers(currentUser(),org.id));
  const sectors = state.sectors.filter((sector) => sector.organizationId === user.organizationId);
  return `<section class="panel-section"><h3>Editar usuário</h3><form id="userEditForm" class="form-stack"><input type="hidden" name="userId" value="${escapeHtml(user.id)}"/><div class="form-row"><label>Nome<input name="name" value="${escapeHtml(user.name)}" required maxlength="160"/></label><label>E-mail<input name="email" type="email" value="${escapeHtml(user.email)}" required/></label></div><label>Perfil GPO<select name="profileId"><option value="">Permissões individuais</option>${(state.permissionProfiles || []).map((profile) => option(profile.id,profile.name,profile.id === user.profileId)).join("")}</select></label><div class="form-row"><label>Empresa<select name="organizationId" id="editUserOrganization">${organizations.map((org) => option(org.id,org.name,org.id === user.organizationId)).join("")}</select></label><label>Setor<select name="sectorId" id="editUserSector">${sectors.map((sector) => option(sector.id,sector.name,sector.id === user.sectorId)).join("")}</select></label></div><label>Estado (UF)<input name="state" value="${escapeHtml(user.state || "")}" maxlength="2" required/></label><div class="row-actions"><button class="button primary" type="submit">Salvar alterações</button><button class="button quiet" type="button" data-action="cancel-user-edit">Cancelar</button></div></form></section>`;
}

function renderAdmin() {
  const tabs = [];
  if (canManageAnyUsers(currentUser())) tabs.push({id:"users",label:"Usuários"});
  if (canManageAnyOrganization(currentUser()) || gpoDecision(currentUser(),"manage_organization",null) === true) tabs.push({id:"organizations",label:"Empresas e setores"});
  if (canManageGpo(currentUser())) { tabs.push({id:"gpo",label:"GPO"}); tabs.push({id:"statuses",label:"Status"}); }
  if (canManageGpo(currentUser()) || state.items.some((item)=>item.archivedAt && canEditItem(currentUser(),item))) tabs.push({id:"archive",label:"Arquivados"});
  if (canManageAnyOrganization(currentUser()) || canManageGpo(currentUser())) tabs.push({id:"types",label:"Tipos de item"});
  tabs.push({id:"preferences",label:"Preferências"});
  if(canManageAnyUsers(currentUser())||canManageAnyOrganization(currentUser())||canManageGpo(currentUser()))tabs.push({id:"history",label:"Histórico"});
  if (!tabs.some((tab) => tab.id === ui.adminTab)) ui.adminTab = tabs[0]?.id || "preferences";
  return `${panelHeader("Administração","Cadastros e permissões")}<div class="panel-tabs" role="tablist">${tabs.map((tab) => `<button role="tab" aria-selected="${ui.adminTab === tab.id}" data-admin-tab="${tab.id}" class="${ui.adminTab === tab.id ? "active" : ""}">${tab.label}</button>`).join("")}</div><div class="drawer-body">
    ${ui.adminTab === "users" ? `<div class="admin-list">${state.users.filter((user) => canManageUsers(currentUser(),user.organizationId)).map((user) => `<div class="admin-entry"><span><strong>${escapeHtml(user.name)}${user.disabled ? " (inativo)" : ""}</strong><small>${escapeHtml(orgName(user.organizationId))} · ${escapeHtml(sectorName(user.sectorId))} · Perfil: ${(state.permissionProfiles || []).find((profile)=>profile.id===user.profileId)?.name || "Individual"} · ${(state.permissionRules || []).filter((rule) => rule.subjectType === "user" && rule.subjectId === user.id).length} regras individuais</small></span><button type="button" class="button quiet" data-edit-user="${escapeHtml(user.id)}">Editar</button><label class="profile-assignment">Perfil<select data-user-profile="${escapeHtml(user.id)}"><option value="">Individual</option>${(state.permissionProfiles || []).map((profile)=>option(profile.id,profile.name,profile.id===user.profileId)).join("")}</select></label>${user.disabled ? `<button class="icon-button" data-toggle-user="${escapeHtml(user.id)}" aria-label="Reativar ${escapeHtml(user.name)}" title="Reativar usuário">${icon("rotate-ccw")}</button>` : ""}${deleteButton("user",user.id,user.name,user.id === currentUser().id,"Entre com outro administrador para excluir seu usuário.")}</div>`).join("")}</div>${ui.editUserId ? renderUserEditForm() : ""}<section class="panel-section"><h3>Novo usuário</h3><form id="userForm" class="form-stack"><div class="form-row"><label>Nome<input name="name" required/></label><label>E-mail<input name="email" type="email" required/></label></div><label>Perfil GPO<select name="profileId"><option value="">Permissões individuais</option>${(state.permissionProfiles || []).map((profile) => option(profile.id,profile.name,profile.id === "profile_editor")).join("")}</select></label><div class="form-row"><label>Empresa<select name="organizationId" id="userOrganization">${state.organizations.filter((org) => canManageUsers(currentUser(),org.id)).map((org) => option(org.id,org.name,org.id === currentUser().organizationId)).join("")}</select></label><label>Setor<select name="sectorId" id="userSector">${state.sectors.filter((sector) => sector.organizationId === currentUser().organizationId).map((sector) => option(sector.id,sector.name)).join("")}</select></label></div><label>Estado (UF)<input name="state" value="${escapeHtml(currentUser().state)}" maxlength="2" required/></label><p class="muted">Novos usuários começam com acesso de leitura e criação no workspace selecionado. Ajuste permissões na aba GPO.</p><button class="button primary" type="submit">${icon("plus")}Cadastrar usuário</button></form></section>` : ""}
    ${ui.adminTab === "organizations" ? `${renderOrganizationRegistry()}${gpoDecision(currentUser(),"manage_organization",null) === true ? `<section class="panel-section"><h3>Nova empresa</h3><form id="organizationForm" class="form-stack"><label>Nome<input name="name" required/></label><label>Estado (UF)<input name="state" maxlength="2" required/></label><button class="button primary" type="submit">${icon("plus")}Cadastrar empresa</button></form></section>` : ""}<section class="panel-section"><h3>Novo setor</h3><form id="sectorForm" class="form-stack"><label>Empresa<select name="organizationId">${state.organizations.filter((org) => canManageOrganization(currentUser(),org.id)).map((org) => option(org.id,org.name)).join("")}</select></label><label>Nome do setor<input name="name" required/></label><button class="button primary" type="submit">${icon("plus")}Cadastrar setor</button></form></section>` : ""}
    ${ui.adminTab === "gpo" && canManageGpo(currentUser()) ? renderGpo() : ""}
    ${ui.adminTab === "statuses" && canManageGpo(currentUser()) ? renderStatusSettings() : ""}
    ${ui.adminTab === "archive" && (canManageGpo(currentUser()) || state.items.some((item)=>item.archivedAt && canEditItem(currentUser(),item))) ? renderArchivedItems() : ""}
    ${ui.adminTab === "types" ? renderTypeSettings() : ""}
    ${ui.adminTab === "preferences" ? renderViewSettingsPanel().replace(/^.*?<div class="drawer-body">/s,"").replace(/<\/div>$/,"") : ""}
    ${ui.adminTab === "history" ? renderRegistryTimeline() : ""}
  </div>`;
}

function renderRegistryTimeline(){
 const ids=new Set(accessibleItems().map(item=>item.id)), userId=ui.historyUserId||"",orgId=ui.historyOrganizationId||"";
 const items=(state.events||[]).filter(e=>ids.has(e.itemId)&&(!userId||e.userId===userId)&&(!orgId||e.organizationIdSnapshot===orgId));
 const records=(state.registryEvents||[]).filter(e=>(!userId||e.userId===userId)&&(!orgId||e.entityId===orgId||state.users.find(u=>u.id===e.entityId)?.organizationId===orgId));
 const entries=[...items.map(e=>({date:e.effectiveAt||e.createdAt,name:eventLabels[e.eventType]||e.eventType,target:getItem(e.itemId)?.title||"Item arquivado",actor:e.actorNameSnapshot||userName(e.userId),before:eventValue(e,e.fromValue),after:eventValue(e,e.toValue),note:e.comment||""})),...records.map(e=>({date:e.createdAt,name:"Cadastro: "+e.entityType+" / "+e.eventType,target:e.name,actor:userName(e.userId),before:"",after:"",note:e.comment||""}))].sort((a,b)=>new Date(b.date)-new Date(a.date));
 return '<section class="panel-section"><h3>Histórico de movimentações</h3><div class="form-row"><label>Usuário<select id="historyUserFilter">'+option("","Todos",!userId)+state.users.map(u=>option(u.id,u.name,userId===u.id)).join("")+'</select></label><label>Empresa<select id="historyOrganizationFilter">'+option("","Todas",!orgId)+state.organizations.map(o=>option(o.id,o.name,orgId===o.id)).join("")+'</select></label></div><ol class="event-timeline">'+entries.map(e=>'<li><strong>'+escapeHtml(e.name)+'</strong><span class="event-origin">'+escapeHtml(e.target)+'</span><time>'+formatDateTime(e.date)+'</time>'+(e.before!=="—"||e.after!=="—"?'<p class="event-values"><b>Antes:</b> '+escapeHtml(e.before)+' <b>Depois:</b> '+escapeHtml(e.after)+'</p>':'')+(e.note?'<p>'+escapeHtml(e.note)+'</p>':'')+'<small>Por '+escapeHtml(e.actor)+'</small></li>').join("")+'</ol>'+(entries.length?'':'<p class="secondary">Nenhum registro encontrado.</p>')+'</section>';
}

function renderTypeSettings() {
  const organizations = state.organizations.filter((org) => canManageOrganization(currentUser(),org.id) || canManageGpo(currentUser()));
  if (!organizations.length) return '<p class="muted">O GPO não permite configurar tipos de item em nenhuma empresa.</p>';
  const organizationId = organizations.some((org) => org.id === ui.typeOrganizationId) ? ui.typeOrganizationId : currentUser().organizationId;
  ui.typeOrganizationId = organizations.some((org) => org.id === organizationId) ? organizationId : organizations[0].id;
  return `<section class="panel-section"><h3>Tipos de item</h3><p class="muted">Personalize ícones e cores para cada tipo e empresa neste navegador.</p><label>Empresa<select id="typeOrganization">${organizations.map((org) => option(org.id,org.name,org.id === ui.typeOrganizationId)).join("")}</select></label><div class="type-settings-list">${itemTypes.map((type) => { const configured = itemTypeConfig(type.id,ui.typeOrganizationId); return `<form class="type-setting form-row" data-type-setting="${escapeHtml(type.id)}"><input type="hidden" name="organizationId" value="${escapeHtml(ui.typeOrganizationId)}"/><strong>${icon(configured.icon)}${escapeHtml(configured.label)}</strong><label>Ícone<select name="icon">${availableItemIcons.map((name) => option(name,name,name === configured.icon)).join("")}</select></label><label>Cor<input name="color" type="color" value="${escapeHtml(configured.color)}" required/></label><button class="button quiet" type="submit">Salvar</button></form>`; }).join("")}</div></section>`;
}

function deleteButton(kind,id,name,disabled = false,reason = "") {
  return `<button type="button" class="icon-button delete-icon" data-delete-kind="${kind}" data-delete-id="${escapeHtml(id)}" ${disabled ? "disabled" : ""} title="${escapeHtml(disabled ? reason : `Excluir ${name}`)}" aria-label="Excluir ${escapeHtml(name)}">${icon("trash-2")}</button>`;
}

function renderOrganizationRegistry() {
  return `<div class="organization-registry">${state.organizations.filter((org) => canManageOrganization(currentUser(),org.id)).map((org) => {
    const sectors = state.sectors.filter((sector) => sector.organizationId === org.id);
    return `<section class="registry-company"><div class="admin-entry"><span><strong>${escapeHtml(org.name)}</strong><small>${escapeHtml(org.state)}</small></span>${deleteButton("organization",org.id,org.name,org.id === currentUser().organizationId,"Entre com um administrador de outra empresa para excluir esta empresa.")}</div><details class="registry-sectors"><summary>Setores (${sectors.length})</summary>${sectors.length ? sectors.map((sector) => `<div class="admin-entry"><span><strong>${escapeHtml(sector.name)}</strong><small>${state.items.filter((item) => item.sectorId === sector.id).length} itens · ${state.users.filter((user) => user.sectorId === sector.id).length} usuários</small></span>${deleteButton("sector",sector.id,sector.name)}</div>`).join("") : '<p class="secondary">Nenhum setor cadastrado.</p>'}</details></section>`;
  }).join("")}</div>`;
}

function prd43InlineDeletion(kind,id){
  if(!["item","relation","attachment"].includes(kind))return false;
  if(kind==="item"&&state.items.some(child=>child.parentId===id&&!child.archivedAt))return false;
  document.querySelectorAll(".prd43-inline-confirm").forEach(el=>el.remove());
  const button=[...document.querySelectorAll("[data-delete-kind]")].find(el=>el.dataset.deleteKind===kind&&el.dataset.deleteId===id);
  const where=button?.parentElement||document.querySelector("#noticeRoot");
  if(!where)return false;
  const title=kind==="item"?getItem(id)?.title:kind==="relation"?"a relação TI":"o anexo";
  const confirm=document.createElement("span");
  confirm.className="prd43-inline-confirm";confirm.setAttribute("role","group");confirm.setAttribute("aria-label","Confirmar exclusão");
  confirm.innerHTML=`<span>Excluir ${escapeHtml(title||"registro")}?</span>
    <button type="button" class="button danger" data-action="prd43-confirm-delete" data-delete-kind="${escapeHtml(kind)}" data-delete-id="${escapeHtml(id)}">Excluir</button>
    <button type="button" class="button quiet" data-action="prd43-cancel-delete">Cancelar</button>`;
  where.append(confirm);
  confirm.querySelector('[data-action="prd43-confirm-delete"]')?.focus();
  return true;
}
function prd43ConfirmInline(button){
  if(button.dataset.action==="prd43-cancel-delete"){
    document.querySelectorAll(".prd43-inline-confirm").forEach(el=>el.remove());return true;
  }
  if(button.dataset.action!=="prd43-confirm-delete")return false;
  const kind=button.dataset.deleteKind,id=button.dataset.deleteId;
  try{
    let message="Registro excluído.",undo=null;
    if(kind==="item"){const item=getItem(id);removeItem(id,{cascade:false,keepChildren:false});undo={type:"restore-item",itemId:id};message="Item excluído: "+item.title+".";}
    else if(kind==="relation"){const rel=state.relations.find(entry=>entry.id===id);
      if(!rel)throw new Error("Relação não encontrada.");
      undo=rel.relationType==="TI"?{type:"delete-ti",relation:{sourceId:rel.sourceId,targetId:rel.targetId,lagDays:rel.lagDays,description:rel.description}}:null;
      removeRelation(id);message="Relação removida.";}
    else if(kind==="attachment"){removeAttachment(id);message="Anexo removido.";}
    if(ui.selectedItemId===id){ui.selectedItemId="";ui.panel="";}
    saveState();ui.prd43Undo=undo;notify(message);render();
  }catch(error){notify(error.message,"error");}
  return true;
}

function openDeletion(kind,id) {
  try {
    if (kind === "item") requireDeletionPermission(getItem(id));
    else if (kind === "user") { const targetUser = state.users.find((entry) => entry.id === id); if (!targetUser || !canManageUsers(currentUser(),targetUser.organizationId)) throw new Error("O GPO não permite gerenciar este usuário."); }
    else if (kind === "organization") { if (!canManageOrganization(currentUser(),id)) throw new Error("O GPO não permite administrar esta empresa."); }
    else if (kind === "sector") {
      const sector = state.sectors.find((entry) => entry.id === id);
      if (!sector || !canManageOrganization(currentUser(),sector.organizationId)) throw new Error("O GPO não permite administrar este setor.");
    }
    else if (kind === "relation") {
      const relation = state.relations.find((entry) => entry.id === id);
      const target = relation && getItem(relation.targetId);
      const rule = target ? gpoDecision(currentUser(),"delete_relation",target) : false;
      if (rule !== true) throw new Error("O GPO não permite remover esta relação.");
    } else if (kind === "attachment") {
      const attachment = state.attachments?.find((entry) => entry.id === id);
      const item = attachment && getItem(attachment.itemId);
      if (!item || gpoDecision(currentUser(),"delete_attachment",item) !== true) throw new Error("O GPO não permite excluir este anexo.");
    } else throw new Error("Selecione um cadastro válido.");
    if(prd43InlineDeletion(kind,id))return;
    returnFocus = document.activeElement;
    ui.deletionReturn = {panel:ui.panel,selectedItemId:ui.selectedItemId,panelTab:ui.panelTab};
    ui.deletion = {kind,id,cascade:true}; ui.panel = "delete"; renderPanel();
  } catch (error) { if (ui.panel) panelFailure(error); else notify(error.message,"error"); }
}

function cancelDeletion() {
  const previous = ui.deletionReturn || {};
  ui.panel = previous.panel || ""; ui.selectedItemId = previous.selectedItemId || ""; ui.panelTab = previous.panelTab || "details";
  ui.deletion = null; renderPanel();
}

function renderDeletionPanel() {
  const {kind,id,cascade} = ui.deletion;
  let name = ""; let impact = ""; let fields = ""; let blocked = ""; let preview = [];
  const noun = {item:"item",user:"usuário",organization:"empresa",sector:"setor",relation:"relação",attachment:"anexo"}[kind];
  try {
    if (kind === "item") {
      const plan = itemRemovalPlan(id,cascade); name = plan.item.title; preview = plan.items.map((item) => item.title);
      if (plan.descendantCount) fields = `<label class="toggle-label"><input id="deleteCascade" name="cascade" type="checkbox" ${cascade ? "checked" : ""}/>Excluir também ${plan.descendantCount} ${plan.descendantCount === 1 ? "subitem" : "subitens"}</label>`;
      impact = `<li>${plan.items.length} ${plan.items.length === 1 ? "item será excluído" : "itens serão excluídos"}.</li><li>${plan.relations.length} ${plan.relations.length === 1 ? "relação será removida" : "relações serão removidas"}.</li>${!cascade && plan.descendantCount ? `<li>Os ${plan.descendantCount} subitens serão mantidos. Os filhos diretos passam a ser itens independentes.</li>` : ""}`;
    } else if (kind === "user") {
      const user = state.users.find((entry) => entry.id === id); if (!user) throw new Error("Usuário não encontrado.");
      name = user.name;
      if (id === currentUser().id) blocked = "Entre com outro administrador para excluir o usuário conectado.";
      const items = state.items.filter((item) => item.ownerId === id); preview = items.map((item) => item.title);
      impact = `<li>O usuário será retirado do cadastro e da seleção de login.</li><li>${items.length} ${items.length === 1 ? "item permanece" : "itens permanecem"} na operação; o histórico de autoria será preservado.</li>`;
      if (items.length) fields = `<label>Quem assume os itens?<select name="replacementId">${option("","Manter sem responsável")}${state.users.filter((entry) => entry.id !== id && !entry.disabled).map((entry) => option(entry.id,entry.name)).join("")}</select></label>`;
    } else if (kind === "sector") {
      const sector = state.sectors.find((entry) => entry.id === id); if (!sector) throw new Error("Setor não encontrado.");
      name = sector.name;
      const items = state.items.filter((item) => item.sectorId === id); const users = state.users.filter((user) => user.sectorId === id);
      const replacements = state.sectors.filter((entry) => entry.id !== id && entry.organizationId === sector.organizationId);
      impact = `<li>O setor será retirado do cadastro.</li><li>${items.length} itens e ${users.length} usuários serão mantidos e transferidos para o setor escolhido.</li>`;
      if (items.length || users.length) {
        if (!replacements.length) blocked = "Cadastre outro setor nesta empresa para receber os itens e usuários vinculados antes de excluir este setor.";
        else fields = `<label>Setor que recebe os vínculos<select name="replacementId" required>${replacements.map((entry) => option(entry.id,entry.name)).join("")}</select></label>`;
      }
    } else if (kind === "organization") {
      const plan = organizationRemovalPlan(id); name = plan.organization.name; preview = plan.items.map((item) => item.title);
      impact = `<li>A empresa, ${plan.sectors.length} setores e ${plan.users.length} usuários serão excluídos.</li><li>${plan.items.length} itens e ${plan.relations.length} relações serão retirados da operação.</li>${plan.externalDescendants.length ? `<li>Inclui ${plan.externalDescendants.length} subitens de outras empresas vinculados a esta estrutura.</li>` : ""}${plan.unassigned.length ? `<li>${plan.unassigned.length} demandas de outras empresas serão mantidas sem responsável, pois seus responsáveis pertencem à empresa excluída.</li>` : ""}`;
    } else if (kind === "relation") {
      const rel = state.relations.find((entry) => entry.id === id); if (!rel) throw new Error("Relação não encontrada.");
      name = labelOf(relationTypes,rel.relationType);
      impact = `<li>${escapeHtml(getItem(rel.sourceId)?.title)} → ${escapeHtml(getItem(rel.targetId)?.title)}</li><li>A conexão será removida e os dois itens serão mantidos.</li>${rel.relationType === "contains" ? "<li>O subitem passa a ser um item independente.</li>" : ""}`;
    } else if (kind === "attachment") {
      const attachment = state.attachments?.find((entry) => entry.id === id); if (!attachment) throw new Error("Anexo não encontrado.");
      name = attachment.name;
      impact = `<li>O anexo será retirado da lista ativa e preservado no histórico local.</li><li>Item: ${escapeHtml(getItem(attachment.itemId)?.title || "Item arquivado")}</li>`;
    } else throw new Error("Selecione o cadastro a excluir.");
  } catch (error) { blocked = error.message; }
  return `${panelHeader("Confirmar exclusão",`Excluir ${noun || "registro"}`)}<form id="deleteForm" class="drawer-body form-stack"><strong class="deletion-name">${escapeHtml(name)}</strong>${fields}<div class="deletion-impact"><h3>O que será alterado</h3><ul>${impact}</ul></div>${preview.length > 1 ? `<details class="form-details"><summary>Ver ${preview.length} itens afetados</summary><ul class="deletion-items">${preview.map((title) => `<li>${escapeHtml(title)}</li>`).join("")}</ul></details>` : ""}<p class="secondary">O histórico das alterações será preservado.</p>${blocked ? `<p class="deletion-blocked" role="alert">${escapeHtml(blocked)}</p>` : ""}<div class="drawer-actions"><button class="button danger solid" type="submit" ${blocked ? "disabled" : ""}>${icon("trash-2")}Confirmar exclusão</button><button class="button quiet" type="button" data-action="cancel-deletion">Cancelar</button></div></form>`;
}

function bindWorkspace() {
  app.onclick = (event) => {
    const button = event.target.closest("button,[data-action]");
    if (!button || button.closest("#panelRoot")) return;
    if(prd43ConfirmInline(button))return;
    if(button.dataset.prd4Focus){openItem(button.dataset.prd4Focus);return;}
    if (button.dataset.paneFocus) {
      prd41FocusedPane = prd41FocusedPane === button.dataset.paneFocus ? "" : button.dataset.paneFocus;
      prd41ApplyPaneLayout();
      requestAnimationFrame(prd43DrawGanttRelations);
      return;
    }
    if (button.dataset.action==="toggle-subitems") {ui.showSubitems=!ui.showSubitems;ui.collapsed=new Set();render();return;}
    if (button.dataset.action==="prd44-confirm-ti"){
      const targetId=document.querySelector("#prd44TiDestination")?.value;
      if(!prd44LinkSource||!targetId){notify("Selecione uma atividade de destino para a TI.","error");return;}
      try{
        const rel=createRelation(prd44LinkSource,targetId,"TI");
        saveState();ui.prd43Undo={type:"create-ti",relationId:rel.id};
        notify("TI criada: "+getItem(prd44LinkSource).title+" → "+getItem(targetId).title+".");
        prd44LinkSource="";render();
      }catch(error){notify(error.message,"error");}return;
    }
    if (button.dataset.action==="select-gantt-ti") {prd43ShowGanttRelation(button.dataset.ganttTi);return;}
    if (button.dataset.action==="prd43-close-ti") {prd43ShowGanttRelation("");return;}
    if (button.dataset.action==="prd43-update-ti") {
      const rel=state.relations.find(entry=>entry.id===prd43SelectedTiId);
      if(!rel){notify("Selecione uma relação TI.","error");return;}
      try{
        const origin=document.querySelector("#prd43TiSource")?.value,destination=document.querySelector("#prd43TiTarget")?.value;
        updateRelation(rel.id,{sourceId:origin,targetId:destination,relationType:"TI",lagDays:rel.lagDays,description:rel.description});
        saveState();ui.prd43Undo=null;notify("TI alterada: "+getItem(origin).title+" → "+getItem(destination).title+".");render();
      }catch(error){notify(error.message,"error");}return;
    }
    if (button.dataset.action==="prd43-delete-ti") {
      const rel=state.relations.find(entry=>entry.id===prd43SelectedTiId);
      if(!rel){notify("Selecione uma relação TI.","error");return;}
      try {
        const undo={type:"delete-ti",relation:{sourceId:rel.sourceId,targetId:rel.targetId,lagDays:rel.lagDays,description:rel.description}};
        removeRelation(rel.id);prd43SelectedTiId="";saveState();ui.prd43Undo=undo;notify("Relação TI removida.");render();
      }catch(error){notify(error.message,"error");}return;
    }
    if (button.dataset.action==="prd43-undo") {
      const undo=ui.prd43Undo;ui.prd43Undo=null;
      if(!undo){notify("Não há alteração para desfazer.","error");return;}
      try{
        if(undo.type==="create-ti") removeRelation(undo.relationId);
        else if(undo.type==="delete-ti")createRelation(undo.relation.sourceId,undo.relation.targetId,"TI",undo.relation.lagDays||0,undo.relation.description||"");
        else if(undo.type==="restore-item")restoreArchivedItem(undo.itemId);
        saveState();notify("Alteração desfeita.");render();
      }catch(error){notify(error.message,"error");}return;
    }
    if (button.dataset.createChild) {
      const parent = getItem(button.dataset.createChild);
      if (!parent || !canEditItem(currentUser(),parent) || gpoDecision(currentUser(),"create_relation",parent)!==true) { notify("Sem permissão para adicionar subitens neste item.","error"); return; }
      ui.createParentId=parent.id; ui.panel="create";returnFocus=button;renderPanel();return;
    }
    if (button.dataset.deleteKind) { openDeletion(button.dataset.deleteKind,button.dataset.deleteId); return; }
    if (button.dataset.view) { ui.overviewMode = button.dataset.view; closePanel(); saveState(); render(); return; }
    if (button.dataset.select) {
      if (button.classList.contains("graph-tree-item")) {
        const id = button.dataset.select;
        if (ui.graphTreeSelectedId === id) { ui.graphTreeSelectedId = ""; openItem(id); }
        else {
          ui.graphTreeSelectedId = id;
          document.querySelectorAll(".graph-tree-item").forEach((entry) => entry.classList.toggle("active", entry.dataset.select === id));
          const selected = [...(ui.graphTreeSelectedIds || new Set())];
          if (!selected.includes(id)) selected.push(id);
          graphInstance?.selectMany(selected);
        }
        return;
      }
      openItem(button.dataset.select); return;
    }
    if (button.dataset.treeToggle) {
      ui.treeCollapsed ||= new Set();
      const id = button.dataset.treeToggle;
      if (ui.treeCollapsed.has(id)) ui.treeCollapsed.delete(id); else ui.treeCollapsed.add(id);
      render(); return;
    }
    if (button.dataset.highlightSignal) {
      ui.graphHighlight = button.dataset.highlightSignal === "all" || ui.graphHighlight === button.dataset.highlightSignal ? "" : button.dataset.highlightSignal;
      render(); return;
    }
    if (button.dataset.highlightOwner !== undefined) { ui.graphOwnerHighlight = button.dataset.highlightOwner || ""; render(); return; }
    if (button.dataset.expand) {prd44ToggleHierarchy(button.dataset.expand);return;}
    const orderId = button.dataset.orderUp || button.dataset.orderDown;
    if (orderId) {
      try {
        const item = getItem(orderId);
        const siblings = state.items.filter((entry) => entry.parentId === item.parentId).sort((left,right) => Number(left.sortOrder ?? state.items.indexOf(left)) - Number(right.sortOrder ?? state.items.indexOf(right)));
        const index = siblings.findIndex((entry) => entry.id === item.id);
        const target = siblings[index + (button.dataset.orderUp ? -1 : 1)];
        if (target) reorderItem(item.id,target.id,!!button.dataset.orderDown);
        saveState(); render();
      } catch (error) { notify(error.message,"error"); }
      return;
    }
    const hierarchyId = button.dataset.indent || button.dataset.outdent;
    if (hierarchyId) {
      try {
        const item = getItem(hierarchyId);
        if (button.dataset.indent) {
          const siblings = state.items.filter((entry) => entry.parentId === item.parentId).sort((left,right) => Number(left.sortOrder ?? state.items.indexOf(left)) - Number(right.sortOrder ?? state.items.indexOf(right)));
          const previous = siblings[siblings.findIndex((entry) => entry.id === item.id) - 1];
          if (!previous) throw new Error("Não há item anterior para receber este subitem.");
          moveItemHierarchy(item.id,previous.id);
        } else {
          const parent = getItem(item.parentId);
          moveItemHierarchy(item.id,parent?.parentId || "");
        }
        saveState(); render();
      } catch (error) { notify(error.message,"error"); }
      return;
    }
    const action = button.dataset.action;
    if (action === "create") { returnFocus = button; ui.panel = "create"; ui.createParentId = ""; renderPanel(); }
    else if (action === "view-settings") { returnFocus = button; ui.panel = "admin"; ui.adminTab = "preferences"; renderPanel(); }
    else if (action === "settings-auto-fit") { state.tableColumnWidths = {}; saveState(); renderPanel(false); notify("Ajuste automático habilitado."); }
    else if (action === "settings-reset-columns") { state.hiddenTableColumns = []; state.tableColumnWidths = {}; saveState(); renderPanel(false); notify("Preferências de coluna restauradas."); }
    else if (action === "settings-reset-row-colors") { delete state.rowFillSettings; saveState(); render(); notify("Cores das linhas restauradas."); }
    else if (action === "settings-reset-graph") { ui.positions = {}; state.graphPositions = {}; ui.graphTransform = null; saveState(); notify("Posições do grafo restauradas."); render(); }
    else if (action === "settings-open-statuses") { ui.adminTab = "statuses"; ui.panel = "admin"; renderPanel(); }
    else if (action === "admin") { returnFocus = button; ui.panel = "admin"; renderPanel(); }
    else if (action === "configure-workspace") { returnFocus = button; ui.adminTab = "organizations"; ui.panel = "admin"; renderPanel(); }
    else if (action === "templates") { returnFocus = button; ui.templateId = ""; ui.templateCreationMode = false; ui.panel = "templates"; renderPanel(); }
    else if (action === "create-from-template") { returnFocus = button; ui.templateId = ""; ui.templateCreationMode = true; ui.panel = "templates"; renderPanel(); }
    else if (action === "columns") { ui.columnsOpen = !ui.columnsOpen; render(); }
    else if (action === "auto-fit-columns") { state.tableColumnWidths = {}; saveState(); render(); notify("Larguras manuais removidas; tabela ajustada automaticamente ao conteúdo."); }
    else if (action === "filters") { ui.filtersOpen = !ui.filtersOpen; render(); }
    else if (action === "clear-filters") { state.filters = {query:"",status:"all",type:"all",owner:"all",organization:"all",sector:"all",state:"all"}; saveState(); render(); }
    else if (action === "logout") { closePanel(); state.currentUserId = ""; saveState(); render(); }
    else if (action === "export") exportVisible();
    else if (action === "dismiss-notice") { ui.notice = "";ui.prd43Undo=null; document.querySelector("#noticeRoot").innerHTML = ""; }
    else if (action === "toggle-bulk") { ui.bulkOpen = !ui.bulkOpen; render(); }
    else if (action === "zoom-in") graphInstance?.zoom(1.2);
    else if (action === "zoom-out") graphInstance?.zoom(1/1.2);
    else if (action === "propagate") { const id=ui.selectedItemId || scopedItems().find(item=>!item.parentId)?.id || scopedItems()[0]?.id; if(!id||!graphInstance?.propagate(id,document.querySelector("#animationLayout")?.value||"sequential",document.querySelector("#animationMode")?.value==="blocker"))notify("Nenhum item disponível para animar.","error"); }
    else if(action==="undo-relation"){
      try{
        const old=ui.lastDeletedRelation;
        if(!old)throw new Error("Não há relação para recuperar.");
        createRelation(old.sourceId,old.targetId,"TI");ui.lastDeletedRelation=null;
        saveState();notify("Relação TI restaurada.");render();
      }catch(error){notify(error.message,"error");}
    }
    else if(action==="pause-animation")graphInstance?.pause();
    else if(action==="restart-animation")graphInstance?.restart();
    else if (action === "fit-graph") graphInstance?.fit();
    else if (action === "reset-layout") { delete ui.positions[layoutKey()]; state.graphPositions = ui.positions; ui.graphTransform = null; saveState(); render(); }
  };
  let dragSourceId = "";
  app.ondragstart = (event) => {
    const row = event.target.closest('[data-row-draggable="true"]');
    if (!row || !event.dataTransfer) { event.preventDefault(); return; }
    dragSourceId = row.dataset.row;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain",dragSourceId);
    row.classList.add("drag-source");
  };
  app.ondragover = (event) => {
    const row = event.target.closest("[data-row]");
    if (!dragSourceId || !row || row.dataset.row === dragSourceId) return;
    event.preventDefault();
    app.querySelectorAll(".drop-target").forEach((entry) => entry.classList.remove("drop-target"));
    row.classList.add("drop-target");
  };
  app.ondrop = (event) => {
    const row = event.target.closest("[data-row]");
    const sourceId = event.dataTransfer?.getData("text/plain") || dragSourceId;
    if (!sourceId || !row || sourceId === row.dataset.row) return;
    event.preventDefault();
    try {
      const bounds = row.getBoundingClientRect();
      const after = event.clientY > bounds.top + bounds.height / 2;
      reorderItem(sourceId,row.dataset.row,after);
      saveState(); render();
    } catch (error) { notify(error.message,"error"); }
  };
  app.ondragend = () => {
    dragSourceId = "";
    app.querySelectorAll(".drag-source,.drop-target").forEach((entry) => entry.classList.remove("drag-source","drop-target"));
  };
  document.querySelector('[name="quickSteps"]')?.addEventListener("input",(event) => renderQuickStepRows(event.target.value.split("\n")));
  const search = document.querySelector("#searchInput");
  search.addEventListener("input", () => {
    state.filters.query = search.value; saveState();
    const position = search.selectionStart; render();
    const next = document.querySelector("#searchInput"); next.focus(); try { next.setSelectionRange(position,position); } catch {}
  });
  document.querySelector("#scopeSelect").addEventListener("change", (event) => { ui.scopeId = event.target.value; ui.graphTransform = null; render(); });
  document.querySelectorAll("[data-filter]").forEach((select) => select.addEventListener("change", (event) => { state.filters[event.target.dataset.filter] = event.target.value; saveState(); render(); }));

  document.querySelector("#riskThresholdDays")?.addEventListener("change", (event) => {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 1 || value > 60) { notify("Defina o limite de risco entre 1 e 60 dias.","error"); render(); return; }
    state.riskThresholdDays = value; saveState(); render();
  });
  document.querySelector("#groupingSelect")?.addEventListener("change", (event) => { ui.grouping = event.target.value; ui.graphTransform = null; render(); });
  document.querySelector("#selectAllRows")?.addEventListener("change", (event) => {
    const visibleIds = tableRows(scopedItems()).map(({item}) => item.id);
    visibleIds.forEach((id) => event.target.checked ? ui.bulkSelected.add(id) : ui.bulkSelected.delete(id));
    render();
  });
  document.querySelectorAll("[data-bulk-item]").forEach((input) => input.addEventListener("change", () => {
    input.checked ? ui.bulkSelected.add(input.dataset.bulkItem) : ui.bulkSelected.delete(input.dataset.bulkItem);
    render();
  }));
  document.querySelectorAll("[data-graph-select-item]").forEach((input) => input.addEventListener("change", () => {
    ui.graphTreeSelectedIds ||= new Set();
    input.checked ? ui.graphTreeSelectedIds.add(input.dataset.graphSelectItem) : ui.graphTreeSelectedIds.delete(input.dataset.graphSelectItem);
    graphInstance?.selectMany([...ui.graphTreeSelectedIds]);
  }));
  submitHandler("bulkEditForm", applyBulkEdit);
  document.querySelectorAll("[data-status-setting]").forEach((form)=>form.addEventListener("submit",(event)=>{ event.preventDefault(); const data=new FormData(form); state.statusSettings ||= {}; state.statusSettings[form.dataset.statusSetting]={icon:String(data.get("icon")||"circle-help"),color:String(data.get("color")||"#687780")}; saveState(); renderPanel(false); notify("Apresentação do status atualizada."); }));

  document.querySelectorAll("[data-column-toggle]").forEach((input)=>input.addEventListener("change",()=>{ state.hiddenTableColumns ||= []; const key=input.dataset.columnToggle; state.hiddenTableColumns= input.checked ? state.hiddenTableColumns.filter((entry)=>entry!==key) : [...new Set([...state.hiddenTableColumns,key])]; saveState(); render(); }));
  applyTableColumnLayout();
  if (!window.__fluxosColumnResizeBound) {
    window.__fluxosColumnResizeBound=true;
    window.addEventListener("resize",()=>applyTableColumnLayout(),{passive:true});
  }
}

function panelFailure(error) {
  const target = document.querySelector("#panelError");
  if (target) { target.textContent = error.message; target.hidden = false; }
}

function submitHandler(id, handler) {
  document.querySelector(`#${id}`)?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { await handler(new FormData(event.currentTarget)); } catch (error) { if (document.querySelector("#panelError")) panelFailure(error); else notify(error.message, "error"); }
  });
}

function applyBulkEdit(form) {
  const selected = scopedItems().filter((item) => ui.bulkSelected.has(item.id));
  if (!selected.length) throw new Error("Selecione pelo menos um item visível.");
  const snapshot = JSON.stringify(state);
  const status = String(form.get("status") || "");
  const ownerId = String(form.get("ownerId") || "");
  const durationRaw = String(form.get("durationDays") || "").trim();
  const weightRaw = String(form.get("weight") || "").trim();
  const progressRaw = String(form.get("progressPercent") || "").trim();
  try {
    for (const item of selected) {
      const input = { ...item, status: status || item.status };
      if (ownerId) input.ownerId = ownerId;
      if (weightRaw) input.weight = Number(weightRaw);
      if (progressRaw) input.progressPercent = Number(progressRaw);
      if (durationRaw) {
        const days = Number(durationRaw);
        if (!Number.isFinite(days) || days < 0) throw new Error("Informe uma duração válida em dias.");
        const start = item.plannedStartAt || today();
        input.plannedStartAt = start;
        input.plannedDurationDays = days;
        input.dueAt = inclusiveFinishDate(start, days);
      }
      updateItem(item.id, input, nowIso());
    }
  } catch (error) {
    const restored = JSON.parse(snapshot);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, restored);
    throw error;
  }
  ui.bulkSelected.clear(); ui.bulkOpen = false;
  saveState(); notify(`Atualização em lote aplicada a ${selected.length} itens.`); render();
}

function bindPanel() {
  const root = document.querySelector("#panelRoot");
  root.querySelectorAll("#prd5HistoryUser,#prd5HistoryOrganization,#prd5HistorySector").forEach(input=>input.addEventListener("change",()=>{ui.prd5HistoryFilters={user:root.querySelector("#prd5HistoryUser")?.value||"",organization:root.querySelector("#prd5HistoryOrganization")?.value||"",sector:root.querySelector("#prd5HistorySector")?.value||""};if(input.id==="prd5HistoryOrganization")ui.prd5HistoryFilters.sector="";renderPanel(false);}));
  root.querySelectorAll("[data-setting-column]").forEach(input=>input.addEventListener("change",()=>{ state.hiddenTableColumns ||= [];state.tableColumnPinned ||= [];const key=input.dataset.settingColumn; state.hiddenTableColumns=input.checked ? state.hiddenTableColumns.filter(entry=>entry!==key) : [...new Set([...state.hiddenTableColumns,key])];state.tableColumnPinned=input.checked ? [...new Set([...state.tableColumnPinned,key])] : state.tableColumnPinned.filter(entry=>entry!==key);saveState();render(); }));
  root.onclick = (event) => {
    const button = event.target.closest("button,[data-action]"); if (!button) return;
    event.stopPropagation();
    const action = button.dataset.action;
    if(prd43ConfirmInline(button))return;
    if (action === "close-panel") { closePanel(); return; }
    if (action === "archive-item") { try { const count=archiveItem(ui.selectedItemId); ui.selectedItemId=""; ui.panel=""; ui.scopeId="all"; saveState(); notify(count + " item(ns) arquivado(s)."); render(); } catch(error) { panelFailure(error); } return; }
    if (button.dataset.restoreItem) { try { const count=restoreArchivedItem(button.dataset.restoreItem); saveState(); notify(count + " item(ns) restaurado(s)."); renderPanel(false); } catch(error) { panelFailure(error); } return; }
    if (action === "cancel-deletion") { cancelDeletion(); return; }
    if (button.dataset.deleteKind) { openDeletion(button.dataset.deleteKind,button.dataset.deleteId); return; }
    if (button.dataset.panelTab) { ui.panelTab = button.dataset.panelTab; renderPanel(false); return; }
    if (button.dataset.adminTab) { ui.adminTab = button.dataset.adminTab; renderPanel(false); return; }
    if (button.dataset.approvalOutcome) {
      const form = button.closest("#approvalDecisionForm");
      const outcome = button.dataset.approvalOutcome;
      form.querySelector('[name="outcome"]').value = outcome;
      form.querySelector('[name="correctionOwnerId"]').required = outcome === "rejected";
      form.querySelector('[name="reason"]').required = outcome === "rejected";
      form.querySelectorAll("[data-approval-outcome]").forEach((entry) => { const selected = entry.dataset.approvalOutcome === outcome; entry.classList.toggle("active",selected); entry.setAttribute("aria-pressed",String(selected)); });
      return;
    }
    if (button.dataset.editRelation) { ui.relationEditId = button.dataset.editRelation; renderPanel(false); return; }
    if (action === "cancel-relation-edit") { ui.relationEditId = ""; renderPanel(false); return; }
    if (button.dataset.select) { openItem(button.dataset.select); return; }
    if (action === "new-subitem") {
      const parent=getItem(ui.selectedItemId);
      if(!parent || !canEditItem(currentUser(),parent) || gpoDecision(currentUser(),"create_relation",parent)!==true) { panelFailure(new Error("Sem permissão para criar subitens neste item.")); return; }
      ui.createParentId=parent.id;ui.panel="create";renderPanel();
    }
    if (button.dataset.removeRelation) {
      openDeletion("relation",button.dataset.removeRelation);
    }
    if (button.dataset.applyTemplate) { ui.templateId = button.dataset.applyTemplate; renderPanel(false); return; }
    if (button.dataset.removeTemplate) {
      try { removeFlowTemplate(button.dataset.removeTemplate); saveState(); notify("Modelo removido."); renderPanel(false); }
      catch (error) { panelFailure(error); }
      return;
    }
    if (button.dataset.editUser) { const user = state.users.find((entry) => entry.id === button.dataset.editUser); if (!user || !canManageUsers(currentUser(),user.organizationId)) { panelFailure(new Error("O GPO não permite editar este usuário.")); return; } ui.editUserId = user.id; renderPanel(false); return; }
    if (action === "cancel-user-edit") { ui.editUserId = ""; renderPanel(false); return; }
    if (button.dataset.removeGpoRule) {
      try { removePermissionRule(button.dataset.removeGpoRule); saveState(); renderPanel(false); }
      catch (error) { panelFailure(error); }
      return;
    }
    if (button.dataset.toggleUser) {
      try {
        const user = state.users.find((entry) => entry.id === button.dataset.toggleUser);
        if (!user || !canManageUsers(currentUser(),user.organizationId)) throw new Error("O GPO não permite gerenciar este usuário.");
        if (user.id === currentUser().id) throw new Error("Você não pode inativar seu próprio acesso.");
        user.disabled = !user.disabled; saveState(); renderPanel(false);
      } catch (error) { panelFailure(error); }
    }
  };
  const prd5TextInput=root.querySelector("#prd43PasteActivities");
  prd5TextInput?.addEventListener("input",event=>renderQuickStepRows(event.target.value));
  prd5TextInput?.addEventListener("keydown",prd5IndentKeydown);
  root.querySelector("#quickStepRows")?.addEventListener("input",event=>{
    if(!event.target.matches("[data-step-title]")||!prd5TextInput)return;
    const row=event.target.closest("[data-line-index]");
    const index=Number(row?.dataset.lineIndex);
    const lines=prd5TextInput.value.split("\n");
    if(!Number.isInteger(index)||index<0||index>=lines.length)return;
    lines[index]=((lines[index].match(/^[\\t ]*/)||[""])[0])+event.target.value;
    prd5TextInput.value=lines.join("\n");
  });
  root.querySelector("#prd42ParentSelect")?.addEventListener("change",(event)=>{
    const parent = getItem(event.target.value);
    const hint = root.querySelector("#prd42ParentHelp");
    if(hint)hint.textContent=parent?"Subitem de: "+parent.title:"Item independente (nível principal)";
  });
  const metaForm=root.querySelector("#updateItemForm");
  metaForm?.querySelectorAll('[name="targetStartAt"],[name="targetDurationDays"],[name="targetDueAt"]').forEach(element=>element.addEventListener("change",(event)=>{
    const startInput=metaForm.querySelector('[name="targetStartAt"]');
    const daysInput=metaForm.querySelector('[name="targetDurationDays"]');
    const dueInput=metaForm.querySelector('[name="targetDueAt"]');
    if(!startInput?.value||!daysInput||!dueInput)return;
    if(event.target===dueInput){
      if(dueInput.value>=startInput.value)daysInput.value=String(inclusiveDurationDays(startInput.value,dueInput.value));
    }else{
      const days=Number(daysInput.value);
      if(Number.isInteger(days)&&days>=1)dueInput.value=inclusiveFinishDate(startInput.value,days);
    }
  }));
  document.querySelector("#editUserOrganization")?.addEventListener("change",(event)=>{ const sector=document.querySelector("#editUserSector"); if(!sector)return; sector.innerHTML=state.sectors.filter((entry)=>entry.organizationId===event.target.value).map((entry)=>option(entry.id,entry.name)).join(""); });
  root.querySelectorAll('#createItemForm [name="plannedStartAt"],#createItemForm [name="plannedDurationDays"],#createItemForm [name="sequence"]').forEach((input)=>input.addEventListener("input",updateSchedulePreview));
  root.addEventListener("input",(event)=>{ if(event.target.matches('[name^="stepDuration_"]')) updateSchedulePreview(); });
  root.addEventListener("change",(event)=>{ const input=event.target; if(input.matches("[data-row-fill-level]")) { state.rowFillSettings ||= {levels:{},projects:{}}; state.rowFillSettings.levels[input.dataset.rowFillLevel]=input.value; saveState(); render(); } else if(input.matches("[data-row-fill-project]")) { state.rowFillSettings ||= {levels:{},projects:{}}; state.rowFillSettings.projects[input.dataset.rowFillProject]=input.value; saveState(); render(); } });
  document.querySelector("#deleteCascade")?.addEventListener("change", (event) => { ui.deletion.cascade = event.target.checked; renderPanel(false); });
  submitHandler("deleteForm", (form) => {
    const {kind,id,cascade} = ui.deletion;
    const previous = ui.deletionReturn || {};
    let message = "";
    if (kind === "item") {
      const result = removeItem(id,{cascade,keepChildren:!cascade});
      message = `${result.items} ${result.items === 1 ? "item excluído" : "itens excluídos"}.`;
    } else if (kind === "user") { removeUser(id,{replacementId:String(form.get("replacementId") || "")}); message = "Usuário excluído."; }
    else if (kind === "sector") { removeSector(id,{replacementId:String(form.get("replacementId") || "")}); message = "Setor excluído. Os vínculos foram atualizados."; }
    else if (kind === "organization") { removeOrganization(id); message = "Empresa e cadastros vinculados excluídos."; }
    else if (kind === "relation") { removeRelation(id); message = "Relação excluída."; }
    else if (kind === "attachment") { removeAttachment(id); message = "Anexo removido e mantido no histórico local."; }
    else throw new Error("Selecione o registro a excluir.");
    if (ui.scopeId !== "all" && !getItem(ui.scopeId)) ui.scopeId = "all";
    ui.selectedItemId = getItem(previous.selectedItemId) ? previous.selectedItemId : "";
    ui.panel = previous.panel === "admin" ? "admin" : previous.panel === "item" && ui.selectedItemId ? "item" : "";
    ui.panelTab = previous.panelTab || "details"; ui.deletion = null; ui.deletionReturn = null;
    saveState(); notify(message); render();
  });
  submitHandler("createItemForm", async (form) => {
    const input=itemInput(form),steps=prd5ParseIndentedItems(String(form.get("quickSteps")||""));
    const sequence=form.get("autoSequence")==="1";
    const snapshot=JSON.stringify(state);
    let item;
    try{
      item=createItem(input);
      const created=[];
      for(let index=0;index<steps.length;index++){
        const step=steps[index];
        const ownerId=String(form.get(`stepOwner_${index}`)||input.ownerId);
        const owner=state.users.find(entry=>entry.id===ownerId&&!entry.disabled);
        const type=String(form.get(`stepType_${index}`)||"task");
        if(!owner)throw new Error("Selecione o responsável do subitem "+(index+1)+".");
        if(!itemTypes.some(entry=>entry.id===type))throw new Error("Tipo inválido no subitem "+(index+1)+".");
        const parentId=step.parentIndex<0?item.id:created[step.parentIndex]?.id;
        if(!parentId)throw new Error("A hierarquia do subitem "+(index+1)+" está incompleta.");
        const start=input.plannedStartAt||today();
        const child=createItem({...input,title:step.title,type,ownerId,organizationId:owner.organizationId,
          sectorId:owner.sectorId,state:owner.state,status:"backlog",weight:1,progressPercent:0,
          parentId,description:"",plannedStartAt:start,plannedDurationDays:1,
          dueAt:inclusiveFinishDate(start,1)});
        created.push(child);
      }
      if(sequence){
        const hasChildren=new Set(steps.map(entry=>entry.parentIndex).filter(index=>index>=0));
        const leaves=created.filter((_,index)=>!hasChildren.has(index));
        for(let index=1;index<leaves.length;index++)createRelation(leaves[index-1].id,leaves[index].id,"TI");
      }
      if(created.length){
        const parents=[item,...created].filter(entry=>state.items.some(child=>child.parentId===entry.id&&!child.archivedAt));
        for(const parent of parents.reverse())syncParentSummary(parent.id);
        item.baselineStartAt=item.plannedStartAt;
        item.baselineDueAt=item.dueAt;
      }
      await addAttachments(item.id,form.getAll("attachments"));
      if(created.length){
        ui.showSubitems=true;ui.collapsed||=new Set();
        for(const entry of [item,...created])ui.collapsed.delete(entry.id);
      }
    }catch(error){
      const restored=JSON.parse(snapshot);for(const key of Object.keys(state))delete state[key];Object.assign(state,restored);
      throw error;
    }
    ui.selectedItemId=item.id;ui.panel="item";ui.panelTab="details";saveState();
    notify("Criado: "+item.title+(steps.length?" + "+steps.length+" subitens":"")+(sequence?" · TI entre atividades finais":"")+".");
    render();
  });
  submitHandler("updateItemForm", async (form) => {
    const effective = new Date(form.get("effectiveAt"));
    if (!Number.isFinite(effective.getTime())) throw new Error("Informe a data e hora da mudança.");
    const snapshot = JSON.stringify(state);
    let changed;
    try {
      changed = updateItem(ui.selectedItemId,itemInput(form,ui.selectedItemId),effective.toISOString(),String(form.get("comment") || ""));
      await addAttachments(ui.selectedItemId,form.getAll("attachments"),effective.toISOString());
    } catch (error) {
      const restored = JSON.parse(snapshot);
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state,restored);
      throw error;
    }
    saveState(); notify(changed ? "Atualização registrada." : "Nenhuma alteração para salvar."); render();
  });
  submitHandler("relationForm", (form) => {
    const otherId = String(form.get("otherId")); const incoming = form.get("direction") === "in";
    createRelation(incoming ? otherId : ui.selectedItemId,incoming ? ui.selectedItemId : otherId,String(form.get("relationType")),Number(form.get("lagDays")),String(form.get("description") || ""));
    saveState(); notify("Relação criada."); render();
  });
  submitHandler("relationUpdateForm", (form) => {
    updateRelation(ui.relationEditId,{sourceId:String(form.get("sourceId")),targetId:String(form.get("targetId")),relationType:String(form.get("relationType")),lagDays:Number(form.get("lagDays")),description:String(form.get("description") || "")});
    ui.relationEditId = ""; saveState(); notify("Relação atualizada; histórico e identidade preservados."); render();
  });
  submitHandler("userForm", (form) => {
    const organizationId = String(form.get("organizationId"));
    if (!canManageUsers(currentUser(),organizationId)) throw new Error("O GPO não permite cadastrar usuários nesta empresa.");
    const email = String(form.get("email")).trim().toLowerCase(); const name = String(form.get("name")).trim();
    if (!name) throw new Error("Informe o nome.");
    if (state.users.some((user) => user.email.toLowerCase() === email)) throw new Error("Este e-mail já está cadastrado.");
    const sectorId = String(form.get("sectorId"));
    if (!state.sectors.some((sector) => sector.id === sectorId && sector.organizationId === organizationId)) throw new Error("Cadastre um setor para esta empresa.");
    const profileId=String(form.get("profileId") || "");
    const user = {id:uid("user"),name,email,organizationId,sectorId,state:String(form.get("state")).toUpperCase(),profileId};
    state.users.push(user);
    const createdBy = currentUser().id;
    if (!profileId) for (const [operation,scopeType,scopeId] of [["view_item","organization",organizationId],["create_item","organization",organizationId],["edit_item","creator",user.id],["create_relation","creator",user.id],["add_attachment","creator",user.id],["delete_attachment","creator",user.id]]) {
      state.permissionRules.push({id:uid("gpo"),subjectType:"user",subjectId:user.id,operation,scopeType,scopeId,effect:"allow",createdBy,createdAt:nowIso()});
    }
    saveState(); notify("Usuário cadastrado."); renderPanel(false);
  });
  submitHandler("userEditForm", (form) => {
    const userId = String(form.get("userId") || "");
    const user = state.users.find((entry) => entry.id === userId);
    if (!user || !canManageUsers(currentUser(),user.organizationId)) throw new Error("O GPO não permite editar este usuário.");
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const organizationId = String(form.get("organizationId") || "");
    const sectorId = String(form.get("sectorId") || "");
    const stateCode = String(form.get("state") || "").trim().toUpperCase();
    if (!name) throw new Error("Informe o nome.");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
    if (state.users.some((entry) => entry.id !== userId && entry.email.toLowerCase() === email)) throw new Error("Este e-mail já está cadastrado.");
    if (!canManageUsers(currentUser(),organizationId)) throw new Error("O GPO não permite transferir o usuário para esta empresa.");
    if (!state.sectors.some((sector) => sector.id === sectorId && sector.organizationId === organizationId)) throw new Error("Selecione um setor da empresa escolhida.");
    if (!/^[A-Z]{2}$/.test(stateCode)) throw new Error("Informe a UF com duas letras.");
    const previous = {name:user.name,email:user.email,organizationId:user.organizationId,sectorId:user.sectorId,state:user.state,profileId:user.profileId || ""};
    Object.assign(user,{name,email,organizationId,sectorId,state:stateCode,profileId:String(form.get("profileId") || "")});
    registryEvent("user",user,"Cadastro atualizado. Anterior: " + JSON.stringify(previous) + " | Novo: " + JSON.stringify({name,email,organizationId,sectorId,state:stateCode,profileId:user.profileId}), "updated");
    saveState(); ui.editUserId = ""; notify("Cadastro do usuário atualizado."); renderPanel(false);
  });
  submitHandler("organizationForm", (form) => {
    if (gpoDecision(currentUser(),"manage_organization",null) !== true) throw new Error("O GPO não permite cadastrar empresas.");
    const name = String(form.get("name")).trim(); if (!name) throw new Error("Informe o nome da empresa.");
    const organization={id:uid("org"),name,state:String(form.get("state")).toUpperCase()}; state.organizations.push(organization); if(!currentUser().organizationId){currentUser().organizationId=organization.id; currentUser().state=organization.state;} saveState(); notify("Empresa cadastrada."); render();
  });
  submitHandler("sectorForm", (form) => {
    const organizationId = String(form.get("organizationId"));
    if (!canManageOrganization(currentUser(),organizationId)) throw new Error("O GPO não permite cadastrar setores nesta empresa.");
    const name = String(form.get("name")).trim(); if (!name) throw new Error("Informe o nome do setor.");
    const sector={id:uid("sector"),name,organizationId}; state.sectors.push(sector); if(currentUser().organizationId===organizationId && !currentUser().sectorId) currentUser().sectorId=sector.id; saveState(); notify("Setor cadastrado."); render();
  });
  submitHandler("templateSaveForm", (form) => {
    const template = saveFlowTemplate(ui.selectedItemId,String(form.get("name") || ""));
    saveState(); notify("Modelo salvo: " + template.name); renderPanel(false);
  });
  submitHandler("templateApplyForm", (form) => {
    const selected = state.templates.find((entry) => entry.id === ui.templateId);
    const ownerSelections = Object.fromEntries((selected?.items || []).map((entry) => [entry.key,String(form.get(`owner_${entry.key}`) || "")]));
    const statusSelections = Object.fromEntries((selected?.items || []).map((entry) => [entry.key,String(form.get(`status_${entry.key}`) || entry.status || "backlog")]));
    const result = applyFlowTemplate(ui.templateId,{title:String(form.get("title") || ""),organizationId:String(form.get("organizationId") || ""),sectorId:String(form.get("sectorId") || ""),state:String(form.get("state") || "").toUpperCase(),startDate:String(form.get("startDate") || today()),ownerSelections,statusSelections});
    saveState(); ui.selectedItemId = result.items[0].id; ui.panel = "item"; ui.panelTab = "details"; ui.templateId = ""; notify("Fluxo criado com " + result.items.length + " itens."); render();
  });
  submitHandler("permissionProfileForm",(form)=>{ const name=String(form.get("name")||"").trim(); if(!name) throw new Error("Informe o nome do perfil."); if((state.permissionProfiles||[]).some((profile)=>profile.name.toLowerCase()===name.toLowerCase())) throw new Error("Já existe um perfil com este nome."); state.permissionProfiles ||= []; state.permissionProfiles.push({id:uid("profile"),name,createdBy:currentUser().id,createdAt:nowIso()}); saveState(); notify("Perfil GPO criado. Configure suas regras."); renderPanel(false); });
  submitHandler("gpoRuleForm", (form) => {
    if (!canManageGpo(currentUser())) throw new Error("Sem permissão para configurar o GPO.");
    const [subjectType,subjectId] = String(form.get("subject") || "").split(":");
    const [scopeType,rawScopeId] = String(form.get("scope") || "").split(":");
    createPermissionRule({subjectType,subjectId,operation:String(form.get("operation")),scopeType,scopeId:rawScopeId === "*" ? "" : rawScopeId,effect:String(form.get("effect"))});
    saveState(); notify("Regra GPO adicionada."); renderPanel(false);
  });
  submitHandler("approvalDecisionForm", (form) => {
    decideApproval(ui.selectedItemId,String(form.get("outcome")),String(form.get("reason") || ""),String(form.get("correctionOwnerId") || ""));
    saveState(); notify(form.get("outcome") === "rejected" ? "Correção vinculada à aprovação original." : "Decisão registrada no histórico."); render();
  });
  submitHandler("approvalSubmitForm", (form) => {
    submitApprovalForReview(ui.selectedItemId,String(form.get("note") || ""));
    saveState(); notify("Etapa enviada para aprovação."); renderPanel(false);
  });
  submitHandler("approvalReopenForm", (form) => {
    reopenApproval(ui.selectedItemId,String(form.get("note") || ""),Number(form.get("progressPercent")));
    saveState(); notify("Aprovação reaberta em nova rodada."); renderPanel(false);
  });
  root.querySelector('#createItemForm [name="quickSteps"]')?.addEventListener("input",event=>renderQuickStepRows(event.target.value.split("\n")));
  root.querySelector("#historyUserFilter")?.addEventListener("change",e=>{ui.historyUserId=e.target.value;renderPanel(false);});
  root.querySelector("#historyOrganizationFilter")?.addEventListener("change",e=>{ui.historyOrganizationId=e.target.value;renderPanel(false);});
  const parentSelect=root.querySelector('#createItemForm [name="parentId"]');
  const initialStart=root.querySelector('#createItemForm [name="plannedStartAt"]');
  initialStart?.addEventListener("change",()=>{ initialStart.dataset.touched="true"; });
  parentSelect?.addEventListener("change",()=>{ const parent=getItem(parentSelect.value); if(!parent) return; if(initialStart && !initialStart.dataset.touched) initialStart.value=parent.baselineStartAt || parent.plannedStartAt || today(); const owner=root.querySelector('#createItemForm [name="ownerId"]'); if(owner && parent.ownerId) owner.value=parent.ownerId; });
  bindOrganizationSelect("itemOrganization","itemSector");
  bindOrganizationSelect("userOrganization","userSector");
  bindOrganizationSelect("templateOrganization","templateSector");
  root.querySelectorAll("[data-user-profile]").forEach((select)=>select.addEventListener("change",()=>{ const user=state.users.find((entry)=>entry.id===select.dataset.userProfile); if(!user || !canManageUsers(currentUser(),user.organizationId)) { notify("O GPO não permite alterar o perfil deste usuário.","error"); renderPanel(false); return; } user.profileId=select.value || ""; registryEvent("user",user,"Perfil GPO alterado.","updated"); saveState(); notify("Perfil GPO atribuído."); renderPanel(false); }));
  root.querySelectorAll("[data-type-setting]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const typeId = form.dataset.typeSetting;
      const data = new FormData(form);
      const organizationId = String(data.get("organizationId") || "");
      if (!canManageOrganization(currentUser(),organizationId) && !canManageGpo(currentUser())) throw new Error("O GPO não permite configurar tipos de item nesta empresa.");
      const iconName = String(data.get("icon") || "").trim();
      const color = String(data.get("color") || "").trim();
      if (!availableItemIcons.includes(iconName)) throw new Error("Selecione um ícone disponível.");
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Selecione uma cor hexadecimal válida.");
      state.typeSettings ||= {};
      state.typeSettings[organizationId] ||= {};
      state.typeSettings[organizationId][typeId] = {icon:iconName,color};
      registryEvent("item-type",{id:typeId,organizationId,...state.typeSettings[organizationId][typeId]},"Ícone e cor do tipo atualizados.");
      saveState(); notify("Tipo de item atualizado."); renderPanel(false);
    } catch (error) { panelFailure(error); }
  }));
  document.querySelector("#typeOrganization")?.addEventListener("change", (event) => { ui.typeOrganizationId = event.target.value; renderPanel(false); });
  root.querySelector(".drawer").addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); closePanel(); }
    if (event.key === "Tab") {
      const focusable = [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary')].filter((element) => element.getClientRects().length);
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement.classList.contains("drawer"))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
}

function bindOrganizationSelect(orgId,sectorId) {
  const org = document.getElementById(orgId); const sector = document.getElementById(sectorId);
  org?.addEventListener("change", () => {
    const context = state.organizations.find((entry) => entry.id === org.value);
    const operation = orgId === "userOrganization" ? "manage_users" : "create_item";
    const allowed = context && gpoDecision(currentUser(),operation,{organizationId:context.id,state:context.state}) === true;
    sector.innerHTML = allowed ? state.sectors.filter((entry) => entry.organizationId === org.value).map((entry) => option(entry.id,entry.name)).join("") : "";
    const stateInput = org.closest("form").querySelector('[name="state"]');
    if (stateInput && !stateInput.readOnly && context && orgId !== "userOrganization") stateInput.value = context.state || "";
  });
}

function itemInput(form, existingId = "") {
  // O parametro e FormData, nao o elemento HTML. FormData nao possui .id.
  // Receber a identidade explicitamente evita tratar uma edicao como criacao.
  const existing = existingId ? getItem(existingId) : null;
  const ownerValue = form.has("ownerId") ? String(form.get("ownerId") || "") : String(existing?.ownerId || "");
  const owner = state.users.find((entry) => entry.id === ownerValue);
  const parentId = form.has("parentId") ? String(form.get("parentId")||"") : String(existing ? (existing.parentId||"") : (ui.createParentId||""));
  const parent = getItem(parentId);
  const result = {title:String(form.get("title") || "").trim(),type:String(form.get("type") || existing?.type || "task"),status:String(form.get("status") || existing?.status || "backlog"),ownerId:ownerValue,plannedStartAt:String(form.get("plannedStartAt") ?? existing?.plannedStartAt ?? (parent?.baselineStartAt || parent?.plannedStartAt || "")),dueAt:String(form.get("dueAt") ?? existing?.dueAt ?? ""),plannedDurationDays:Number(form.get("plannedDurationDays") ?? existing?.plannedDurationDays ?? 0),replannedDueAt:String(form.get("replannedDueAt") ?? existing?.replannedDueAt ?? ""),weight:Number(form.get("weight") ?? existing?.weight ?? 1),description:String(form.get("description") ?? existing?.description ?? ""),organizationId:owner?.organizationId || parent?.organizationId || existing?.organizationId || currentUser().organizationId,sectorId:owner?.sectorId || parent?.sectorId || existing?.sectorId || currentUser().sectorId,state:owner?.state || parent?.state || existing?.state || currentUser().state,parentId};
  if (existing) {
    if (form.has("blockedReason")) result.blockedReason = String(form.get("blockedReason") || "").trim();
    for (const [key,baselineField] of [["targetStartAt","baselineStartAt"],["targetDueAt","baselineDueAt"]]) {
      if (!form.has(key)) continue;
      const desired = String(form.get(key)||"");
      const prior = String(existing?.[key] || existing?.[baselineField] || (key==="targetStartAt" ? existing?.plannedStartAt : existing?.dueAt) || "");
      if (desired !== prior) result[key] = desired;
    }
  }
  const progress = form.get("progressPercent");
  if (progress !== null && String(progress).trim() !== "") result.progressPercent = Number(progress);
  else if (!existing) result.progressPercent = 0;
  // Pais têm progresso, status e cronograma derivados dos descendentes.
  // O formulário de metas e responsável não pode reenviar cópias defasadas
  // desses valores e ser confundido com uma tentativa de alteração manual.
  if (existing && state.items.some(child=>child.parentId===existing.id && !child.archivedAt)) {
    for (const field of ["progressPercent","plannedStartAt","dueAt","plannedDurationDays"]) delete result[field];
    result.status = existing.status; // preservar inclusive Concluido ao editar meta ou responsavel
  }
  return result;
}

function exportVisible() {
  const items = accessibleItems(); const ids = new Set(items.map((item) => item.id));
  const content = {version:state.version,calendarVersion:1,exportedAt:nowIso(),items,relations:relationsFor(items),events:state.events.filter((event) => ids.has(event.itemId)),approvalDecisions:(state.approvalDecisions || []).filter((entry) => ids.has(entry.itemId)),attachments:(state.attachments || []).filter((entry) => ids.has(entry.itemId))};
  if (canManageAnyUsers(currentUser()) || canManageGpo(currentUser())) Object.assign(content,{organizations:state.organizations,sectors:state.sectors,users:state.users,permissionRules:state.permissionRules || [],templates:state.templates || [],events:state.events,approvalDecisions:state.approvalDecisions || [],archivedItems:state.archivedItems || [],archivedRelations:state.archivedRelations || [],archivedAttachments:state.archivedAttachments || [],archivedUsers:state.archivedUsers || [],archivedOrganizations:state.archivedOrganizations || [],archivedSectors:state.archivedSectors || [],registryEvents:state.registryEvents || []});
  const url = URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:"application/json"}));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `fluxos-${today()}.json`; anchor.click(); URL.revokeObjectURL(url);
  notify("Dados visíveis exportados.");
}

render();
