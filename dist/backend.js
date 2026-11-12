/* PRD6 server adapter for the interface originating in PRD5. The static demonstration stays local.
 * The server validates every requested change, computes derived fields, and
 * returns the only state that this adapter presents as successfully saved.
 */
(() => {
  "use strict";
  const runtime = window.FLUXOS_BACKEND;
  if (!runtime) return;
  const apiBase = String(runtime.apiBase || "/api").replace(/\/$/, "");
  const preferenceKeys = ["filters", "graphPositions", "graphTransforms", "hiddenTableColumns", "tableColumnWidths", "tableColumnPinned", "prd5GanttColumnViews", "riskThresholdDays", "rowFillSettings", "drawerWidth", "paneWidths", "ganttWidth", "viewGrouping", "viewScopeId", "viewShowSubitems"];
  const domainKeys = ["workspaceName", "organizations", "sectors", "users", "items", "relations", "archivedItems", "archivedRelations", "archivedUsers", "archivedOrganizations", "archivedSectors", "permissionRules", "permissionProfiles", "typeSettings", "statusSettings", "templates"];
  const itemEditableFields = ["title", "type", "status", "ownerId", "organizationId", "sectorId", "state", "description", "plannedStartAt", "dueAt", "plannedDurationDays", "replannedDueAt", "targetStartAt", "targetDueAt", "weight", "progressPercent", "blockedReason"];
  let identity = null, workspaces = [], workspaceId = "", csrfToken = "";
  let confirmed = null, revision = 0, limits = { attachmentMaxBytes: 10 * 1024 * 1024 };
  let started = false, ready = false, saving = false, scheduled = false, refreshing = false, switching = false;
  let saveTimer = null, savePromise = null, saveResolve = null, saveReject = null;
  let preferencesTimer = null, preferencesPromise = Promise.resolve(), savedPreferences = "";
  let preferencesInFlight = 0, preferenceMessages = [];
  let pendingMessages = [], actions = [], approvalBase = null, pendingDeletes = [];
  let itemFieldHints = new Map(), itemMetadata = null;
  let passwordForNewEmail = new Map(), passwordResets = new Map();
  let formBeforeAction = null, uiBeforeAction = null, failedDraft = null;
  let pollTimer = null, lastContact = 0, networkStatus = "Carregando…";
  let graphPreferenceTimer = null;
  let originals;

  const clone = value => JSON.parse(JSON.stringify(value));
  const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const preferenceData = source => ({ ...Object.fromEntries(preferenceKeys.filter(key => source[key] !== undefined).map(key => [key, clone(source[key])])), rowFillSettings: clone(source.rowFillSettings || { levels: {}, projects: {} }) });
  const domainData = source => Object.fromEntries(domainKeys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
  const hasDomainChanges = () => !!confirmed && !equal(domainData(approvalBase || state), domainData(confirmed));
  const endpoint = suffix => `${apiBase}/workspaces/${encodeURIComponent(workspaceId)}${suffix}`;
  const isPending = () => saving || scheduled || switching;

  function safeDraft(source) {
    const value = clone(source);
    const scrub = object => {
      if (!object || typeof object !== "object") return;
      for (const key of Object.keys(object)) {
        if (/password|token|secret|dataUrl|dataBase64/i.test(key)) delete object[key];
        else scrub(object[key]);
      }
    };
    scrub(value);
    return value;
  }

  function desiredState() {
    const desired = clone(approvalBase || state);
    for (const key of ["events", "registryEvents", "approvalDecisions", "attachments", "archivedAttachments"]) delete desired[key];
    for (const key of preferenceKeys) delete desired[key];
    delete desired.currentUserId;
    for (const user of desired.users || []) {
      delete user.password;
      const password = passwordForNewEmail.get(String(user.email || "").toLowerCase());
      if (password && !confirmed.users.some(existing => existing.id === user.id)) user.password = password;
    }
    return desired;
  }

  async function request(url, { method = "GET", body, signal } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET" && method !== "HEAD" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    let response;
    try {
      response = await fetch(url, { method, credentials: "same-origin", cache: "no-store", headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
    } catch (cause) {
      const error = new Error("Sem conexão com o servidor. A gravação ainda não pôde ser confirmada.");
      error.code = "NETWORK_ERROR"; error.cause = cause; throw error;
    }
    let data;
    try { data = await response.json(); } catch { data = {}; }
    if (!response.ok) {
      const detail = typeof data.error === "object" ? data.error : data;
      const error = new Error(detail?.message || (typeof data.error === "string" ? data.error : "Não foi possível concluir a solicitação."));
      error.status = response.status; error.code = detail?.code || data.code; error.details = detail?.details || data.details;
      throw error;
    }
    lastContact = Date.now();
    return data;
  }

  function readFormDraft(form = document.querySelector("#panelRoot form")) {
    if (!form) return null;
    return {
      id: form.id,
      controls: [...form.querySelectorAll("input,textarea,select")].filter(element => element.name && !["password", "file"].includes(element.type)).map(element => ({ name: element.name, value: element.value, type: element.type, checked: element.checked })),
    };
  }

  function rememberAction(event) {
    if (!ready || isPending() || event.target.closest("[data-backend-surface]")) return;
    uiBeforeAction = { panel: ui.panel, panelTab: ui.panelTab, selectedItemId: ui.selectedItemId, createParentId: ui.createParentId, editUserId: ui.editUserId, templateId: ui.templateId, bulkOpen: ui.bulkOpen };
    formBeforeAction = readFormDraft(event.type === "submit" ? event.target : undefined);
  }

  function restoreForm(draft) {
    if (!draft?.id) return;
    const form = document.getElementById(draft.id);
    if (!form) return;
    for (const control of draft.controls || []) {
      const elements = [...form.elements].filter(element => element.name === control.name);
      for (const element of elements) {
        if (element.type === "password" || element.type === "file") continue;
        if (element.type === "checkbox" || element.type === "radio") element.checked = control.checked;
        else element.value = control.value;
        if (element.id === "prd43PasteActivities") element.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
  }

  function busyIndicator() {
    let indicator = document.getElementById("backendBusy");
    if (!isPending()) { indicator?.remove(); app.removeAttribute("aria-busy"); return; }
    app.setAttribute("aria-busy", "true");
    if (!indicator) {
      indicator = document.createElement("div");
      indicator.id = "backendBusy"; indicator.className = "backend-busy";
      indicator.innerHTML = '<div role="status" aria-live="polite"><span class="backend-spinner" aria-hidden="true"></span>' + (switching ? 'Carregando workspace…' : 'Salvando no servidor…') + '</div>';
      document.body.append(indicator);
    }
  }

  function decorate() {
    if (!ready || !identity) return;
    const header = document.querySelector(".header-actions");
    if (header && !header.querySelector("#backendWorkspace")) {
      const control = document.createElement("label");
      control.className = "backend-workspace";
      control.innerHTML = `<span class="sr-only">Workspace</span><select id="backendWorkspace" aria-label="Workspace">${workspaces.map(workspace => `<option value="${escapeHtml(workspace.id)}" ${workspace.id === workspaceId ? "selected" : ""}>${escapeHtml(workspace.name || workspace.title || workspace.id)}</option>`).join("")}</select>`;
      control.hidden = workspaces.length < 2;
      header.prepend(control);
      control.querySelector("select").addEventListener("change", async event => {
        const next = event.target.value;
        if (isPending()) { event.target.value = workspaceId; return; }
        try { await flushPreferences(); await openWorkspace(next); }
        catch (error) { event.target.value = workspaceId; originals.notify(error.message, "error"); }
      });
      const password = document.createElement("button");
      password.type = "button"; password.className = "icon-button";
      password.dataset.backendPassword = ""; password.title = "Alterar minha senha"; password.setAttribute("aria-label", "Alterar minha senha");
      password.innerHTML = icon("pencil"); password.addEventListener("click", showPasswordForm);
      header.insertBefore(password, header.querySelector('[data-action="logout"]'));
    }
    const footer = document.querySelector(".workspace-footer");
    if (footer) {
      let status = footer.querySelector("#backendStatus");
      if (!status) { status = document.createElement("span"); status.id = "backendStatus"; status.setAttribute("role", "status"); footer.append(status); }
      status.textContent = networkStatus;
      status.dataset.state = networkStatus.startsWith("Sem conexão") ? "offline" : "online";
    }
    const newUserForm = document.getElementById("userForm");
    if (newUserForm && !newUserForm.querySelector('[name="backendPassword"]')) {
      const label = document.createElement("label");
      label.innerHTML = 'Senha inicial<input name="backendPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required/><small>Use pelo menos 12 caracteres. O usuário poderá alterar a senha após entrar.</small>';
      newUserForm.insertBefore(label, newUserForm.querySelector('button[type="submit"]'));
      const note = newUserForm.querySelector("p.muted");
      if (note) note.textContent = "O perfil GPO define as operações disponíveis neste workspace.";
    }
    const editUserForm = document.getElementById("userEditForm");
    if (editUserForm && !editUserForm.querySelector('[name="backendPassword"]')) {
      const label = document.createElement("label");
      label.innerHTML = 'Nova senha (opcional)<input name="backendPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128"/><small>Preencha para redefinir a senha e encerrar as sessões existentes deste usuário.</small>';
      editUserForm.insertBefore(label, editUserForm.querySelector(".row-actions"));
    }
    document.querySelectorAll(".attachment-limits").forEach(element => { element.textContent = `Até ${Math.floor(limits.attachmentMaxBytes / 1048576)} MB por arquivo. Anexos compartilhados com acesso autorizado.`; });
    mountIcons();
  }

  function applyProjection(projection, { preservePreferences = false } = {}) {
    if (!projection?.state || !Number.isInteger(Number(projection.revision))) throw new Error("O servidor retornou uma projeção inválida.");
    const preferences = preservePreferences ? preferenceData(state) : null;
    state = Object.assign(emptyState(), projection.state);
    if (projection.preferences) Object.assign(state, projection.preferences);
    if (preferences) Object.assign(state, preferences);
    state.setupComplete = true; state.currentUserId = identity.id;
    if (!state.users.some(user => user.id === identity.id)) state.users.push(clone(identity));
    for (const user of state.users) delete user.password;
    revision = Number(projection.revision);
    if (projection.workspace) {
      const entry = workspaces.find(workspace => workspace.id === projection.workspace.id);
      if (entry) Object.assign(entry, projection.workspace);
    }
    if (projection.limits) Object.assign(limits, projection.limits);
    confirmed = clone(state);
    if (!preservePreferences) savedPreferences = JSON.stringify(preferenceData(state));
    ui.positions = state.graphPositions || {};
    ui.grouping = state.viewGrouping || ui.grouping || "project";
    ui.scopeId = state.viewScopeId || ui.scopeId || "all";
    if (state.viewShowSubitems !== undefined) ui.showSubitems = !!state.viewShowSubitems;
    if (state.graphTransforms?.[layoutKey()]) ui.graphTransform = state.graphTransforms[layoutKey()];
    networkStatus = "Conectado · dados compartilhados";
    ready = true;
  }

  async function openWorkspace(id) {
    if (!workspaces.some(workspace => workspace.id === id)) throw new Error("Workspace não autorizado.");
    const previous = workspaceId; workspaceId = id; switching = true; busyIndicator();
    try {
      const projection = await request(endpoint("/projection"));
      ui.scopeId = "all"; ui.selectedItemId = ""; ui.panel = ""; ui.graphTransform = null; ui.graphKey = "";
      ui.positions = {}; ui.bulkSelected = new Set(); ui.prd43Undo = null; prd41PaneUser = "";
      applyProjection(projection);
      switching = false; busyIndicator();
      originals.render(); decorate();
    } catch (error) { workspaceId = previous; throw error; }
    finally { switching = false; busyIndicator(); }
  }

  async function flushPreferences() {
    clearTimeout(preferencesTimer); preferencesTimer = null;
    if (!ready || !identity) return;
    const preferences = preferenceData(state), serialized = JSON.stringify(preferences);
    if (serialized === savedPreferences) {
      const message = preferenceMessages.at(-1); preferenceMessages = [];
      if (message) originals.notify(message.message, message.kind);
      return preferencesPromise;
    }
    const requestWorkspace = workspaceId, requestUser = identity.id;
    preferencesInFlight++;
    preferencesPromise = preferencesPromise.catch(() => {}).then(async () => {
      try {
        await request(`${apiBase}/workspaces/${encodeURIComponent(requestWorkspace)}/preferences`, { method: "PUT", body: { preferences } });
        if (workspaceId === requestWorkspace && identity?.id === requestUser) {
          savedPreferences = serialized;
          if (confirmed) Object.assign(confirmed, preferences);
          networkStatus = "Conectado · preferências salvas"; decorate();
          const message = preferenceMessages.at(-1); preferenceMessages = [];
          if (message) originals.notify(message.message, message.kind);
        }
      } finally { preferencesInFlight--; }
    });
    preferencesPromise.catch(error => {
      if (workspaceId !== requestWorkspace || identity?.id !== requestUser) return;
      preferenceMessages = [];
      networkStatus = "Sem conexão · preferências não salvas"; decorate();
      if (error.status === 401) expireSession();
    });
    return preferencesPromise;
  }

  function queuePreferences() {
    if (!ready) return Promise.resolve();
    clearTimeout(preferencesTimer);
    preferencesTimer = setTimeout(() => { flushPreferences().catch(() => {}); }, 220);
    return Promise.resolve();
  }

  function queueSave() {
    if (!ready || !identity) return Promise.resolve();
    state.currentUserId = identity.id;
    state.viewGrouping = ui.grouping; state.viewScopeId = ui.scopeId; state.viewShowSubitems = ui.showSubitems;
    if (!hasDomainChanges() && !actions.length && !itemFieldHints.size && !pendingDeletes.length && !passwordResets.size) return queuePreferences();
    if (savePromise) return savePromise;
    scheduled = true;
    savePromise = new Promise((resolve, reject) => { saveResolve = resolve; saveReject = reject; });
    // Most callers retain the prototype's synchronous signature. Register a
    // rejection handler here; explicit form flows still await this promise.
    savePromise.catch(() => {});
    saveTimer = setTimeout(commit, 0);
    busyIndicator();
    return savePromise;
  }

  function resetPending() {
    scheduled = false; saving = false; clearTimeout(saveTimer); saveTimer = null;
    savePromise = null; saveResolve = null; saveReject = null;
    pendingMessages = []; actions = []; approvalBase = null; pendingDeletes = [];
    itemFieldHints.clear(); itemMetadata = null;
    passwordForNewEmail.clear(); passwordResets.clear();
    busyIndicator();
  }

  async function commit() {
    if (!scheduled || saving) return;
    scheduled = false; saving = true;
    const resolve = saveResolve, reject = saveReject;
    const draft = safeDraft(state), beforeUi = uiBeforeAction, beforeForm = formBeforeAction;
    const deferredMessage = pendingMessages;
    const preferences = preferenceData(state);
    let confirmedPartial = false;
    try {
      if (hasDomainChanges() || actions.length || itemFieldHints.size) {
        const payload = { expectedRevision: revision, desiredState: desiredState(), actions: clone(actions), fieldHints: Object.fromEntries([...itemFieldHints].map(([id, fields]) => [id, [...fields]])) };
        // A recalculation may append automatic events after the user's edit.
        // Preserve the explicit comment/time instead of attributing those events
        // (or an older persisted comment) to the current request.
        const lastEvent = state.events?.at(-1);
        const newEvent = lastEvent && !confirmed.events?.some(event => event.id === lastEvent.id) ? lastEvent : null;
        const metadata = itemMetadata || newEvent;
        if (metadata?.comment) payload.comment = metadata.comment;
        if (metadata?.effectiveAt) payload.effectiveAt = metadata.effectiveAt;
        const projection = await request(endpoint("/sync"), { method: "POST", body: payload });
        applyProjection(projection, { preservePreferences: true });
        confirmedPartial = true;
      }
      for (const id of pendingDeletes) {
        const projection = await request(endpoint(`/attachments/${encodeURIComponent(id)}`), { method: "DELETE" });
        applyProjection(projection, { preservePreferences: true });
        confirmedPartial = true;
      }
      for (const [id, password] of passwordResets) await request(endpoint(`/users/${encodeURIComponent(id)}/password`), { method: "POST", body: { password } });
      Object.assign(state, preferences);
      const message = deferredMessage.at(-1);
      resetPending();
      queuePreferences();
      if (message) originals.notify(message.message, message.kind);
      originals.render(); decorate();
      resolve?.(state);
    } catch (error) {
      if (confirmedPartial) { error.partial = true; error.message = "Parte da operação já foi confirmada no servidor. " + error.message; }
      failedDraft = { state: draft, form: beforeForm, ui: beforeUi, revision, workspaceId, savedAt: new Date().toISOString() };
      if (confirmed) state = clone(confirmed);
      if (beforeUi) Object.assign(ui, beforeUi);
      resetPending();
      if (error.status === 401) expireSession();
      else {
        originals.render(); decorate(); restoreForm(beforeForm);
        showFailure(error);
      }
      reject?.(error);
    }
  }

  function modal(title, content) {
    document.getElementById("backendDialog")?.remove();
    const element = document.createElement("div");
    element.id = "backendDialog"; element.className = "backend-modal"; element.dataset.backendSurface = "";
    element.innerHTML = `<section role="dialog" aria-modal="true" aria-labelledby="backendDialogTitle" tabindex="-1"><h2 id="backendDialogTitle">${escapeHtml(title)}</h2>${content}</section>`;
    document.body.append(element);
    const dialog = element.querySelector("section"); dialog.focus();
    element.addEventListener("keydown", event => {
      if (event.key === "Escape") { element.remove(); return; }
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll("button,input,select,textarea,a[href]")].filter(control => !control.disabled && control.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === dialog)) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    });
    return element;
  }

  function downloadDraft() {
    if (!failedDraft) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(safeDraft(failedDraft), null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "fluxos-rascunho-nao-gravado.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function showFailure(error) {
    const conflict = error.status === 409 || error.status === 412;
    const uncertain = error.code === "NETWORK_ERROR";
    const dialog = modal(error.partial ? "Operação parcialmente concluída" : conflict ? "Outra pessoa atualizou os dados" : uncertain ? "Gravação não confirmada" : "Alteração não gravada", `
      <p role="alert">${escapeHtml(error.message)}</p>
      <p>${conflict ? "Seu rascunho foi preservado. Carregue os dados atuais e revise o formulário antes de salvar novamente." : uncertain ? "Seu rascunho foi preservado. Consulte o servidor para verificar a situação antes de repetir a operação." : "Os campos do formulário foram preservados para você corrigir a informação e tentar novamente."}</p>
      <div class="backend-modal-actions"><button type="button" class="button primary" data-backend-refresh>Atualizar e revisar</button><button type="button" class="button quiet" data-backend-draft>Baixar rascunho</button><button type="button" class="button quiet" data-backend-close>Voltar ao formulário</button></div><p class="backend-form-error" hidden></p>`);
    dialog.querySelector("[data-backend-draft]").addEventListener("click", downloadDraft);
    dialog.querySelector("[data-backend-close]").addEventListener("click", () => dialog.remove());
    dialog.querySelector("[data-backend-refresh]").addEventListener("click", async event => {
      event.target.disabled = true;
      try {
        const projection = await request(endpoint("/projection"));
        applyProjection(projection);
        if (failedDraft?.ui) Object.assign(ui, failedDraft.ui);
        originals.render(); decorate(); restoreForm(failedDraft?.form);
        dialog.remove(); originals.notify("Dados atuais carregados. Revise os campos antes de salvar.", "neutral");
      } catch (failure) {
        const field = dialog.querySelector(".backend-form-error"); field.hidden = false; field.textContent = failure.message;
      } finally { event.target.disabled = false; }
    });
  }

  function renderServerLogin(message = "") {
    if (graphInstance) { graphInstance.destroy(); graphInstance = null; }
    app.innerHTML = `<main class="login-screen"><section class="login-card">
      <div class="brand">${icon("workflow")}<span>FLUXO VISUAL</span></div><h1>Acesse sua operação</h1><p>Entre com o e-mail e a senha cadastrados.</p>
      <form id="backendLoginForm" class="form-stack" data-backend-surface><label>E-mail<input name="email" type="email" required autocomplete="username" maxlength="254" autofocus/></label><label>Senha<input name="password" type="password" required autocomplete="current-password" maxlength="128"/></label><p id="backendLoginError" class="backend-form-error" role="alert" ${message ? "" : "hidden"}>${escapeHtml(message)}</p><button class="button primary" type="submit">Entrar</button></form>
      <p class="build-label" data-build-label>${escapeHtml(buildLabel())}</p></section></main>`;
    mountIcons();
    document.getElementById("backendLoginForm").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget, button = form.querySelector("button"), data = new FormData(form);
      const errorField = document.getElementById("backendLoginError"); errorField.hidden = true; button.disabled = true; button.textContent = "Entrando…";
      try {
        const session = await request(`${apiBase}/auth/login`, { method: "POST", body: { email: String(data.get("email")).trim(), password: String(data.get("password")) } });
        form.querySelector('[name="password"]').value = "";
        await acceptSession(session);
      } catch (error) { errorField.textContent = error.message; errorField.hidden = false; }
      finally { if (button.isConnected) { button.disabled = false; button.textContent = "Entrar"; } }
    });
  }

  async function acceptSession(session) {
    if (!session.user?.id || !session.csrfToken || !Array.isArray(session.workspaces)) throw new Error("A sessão retornada pelo servidor é inválida.");
    identity = session.user; csrfToken = session.csrfToken; workspaces = session.workspaces;
    if (!workspaces.length) { ready = false; renderServerLogin("Seu usuário ainda não tem acesso a um workspace. Solicite o acesso ao administrador."); return; }
    const initialId = workspaces.some(workspace => workspace.id === workspaceId) ? workspaceId : session.workspaceId || workspaces[0].id;
    await openWorkspace(initialId);
    if (failedDraft) originals.notify("Há um rascunho não gravado desta sessão. Revise a operação antes de repeti-la.", "neutral");
  }

  function expireSession() {
    ready = false; identity = null; csrfToken = ""; confirmed = null;
    state = emptyState(); ui.panel = ""; ui.selectedItemId = ""; ui.positions = {};
    document.getElementById("backendDialog")?.remove();
    renderServerLogin("Sua sessão expirou. Entre novamente para continuar.");
  }

  async function logout() {
    if (isPending()) return;
    try {
      await flushPreferences();
      await request(`${apiBase}/auth/logout`, { method: "POST", body: {} });
      ready = false; identity = null; csrfToken = ""; confirmed = null; failedDraft = null;
      state = emptyState(); ui.panel = ""; ui.selectedItemId = ""; ui.positions = {}; ui.notice = "";
      renderServerLogin();
    } catch (error) { originals.notify("Não foi possível encerrar a sessão: " + error.message, "error"); }
  }

  function showPasswordForm() {
    const dialog = modal("Alterar minha senha", '<form id="backendPasswordForm" class="form-stack"><label>Senha atual<input name="currentPassword" type="password" autocomplete="current-password" required/></label><label>Nova senha<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required/></label><label>Confirme a nova senha<input name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required/></label><p class="backend-form-error" role="alert" hidden></p><div class="backend-modal-actions"><button type="submit" class="button primary">Salvar nova senha</button><button type="button" class="button quiet" data-close>Cancelar</button></div></form>');
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.remove());
    dialog.querySelector("form").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget, values = new FormData(form), errorField = form.querySelector(".backend-form-error");
      const button = form.querySelector('button[type="submit"]'); errorField.hidden = true;
      if (values.get("newPassword") !== values.get("confirmation")) { errorField.textContent = "As novas senhas não coincidem."; errorField.hidden = false; return; }
      button.disabled = true;
      try {
        const response = await request(`${apiBase}/auth/password`, { method: "POST", body: { currentPassword: values.get("currentPassword"), newPassword: values.get("newPassword") } });
        if (response.csrfToken) csrfToken = response.csrfToken;
        form.reset(); dialog.remove();
        // Password rotation invalidates existing sessions. Authenticate again
        // instead of assuming the current cookie remains accepted.
        expireSession(); document.getElementById("backendLoginError").textContent = "Senha alterada. Entre com a nova senha.";
      } catch (error) { errorField.textContent = error.message; errorField.hidden = false; }
      finally { button.disabled = false; }
    });
  }

  async function refreshWhenIdle() {
    if (!ready || isPending() || refreshing || document.hidden || ui.panel || document.querySelector("#backendDialog")) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    refreshing = true;
    const requestWorkspace = workspaceId, requestUser = identity.id;
    try {
      const projection = await request(endpoint("/projection"));
      if (workspaceId !== requestWorkspace || identity?.id !== requestUser) return;
      if (!isPending() && !ui.panel && Number(projection.revision) > revision) {
        applyProjection(projection, { preservePreferences: true }); originals.render();
      }
      networkStatus = "Conectado · dados compartilhados"; decorate();
    } catch (error) {
      if (workspaceId !== requestWorkspace || identity?.id !== requestUser) return;
      if (error.status === 401) expireSession();
      else { networkStatus = "Sem conexão · última leitura preservada"; decorate(); }
    } finally { refreshing = false; }
  }

  function renderServerAttachments(item, editable) {
    const attachments = (state.attachments || []).filter(attachment => attachment.itemId === item.id && !attachment.deletedAt);
    if (!attachments.length) return '<section class="attachment-list"><h3>Anexos e evidências</h3><p class="secondary">Nenhum anexo neste item.</p></section>';
    return '<section class="attachment-list"><h3>Anexos e evidências (' + attachments.length + ')</h3><div class="admin-list">' + attachments.map(attachment => `<div class="admin-entry"><span><button type="button" class="button quiet attachment-link" data-backend-download="${escapeHtml(attachment.id)}">${icon("paperclip")}${escapeHtml(attachment.name)}</button><small>${escapeHtml(attachment.mime || attachment.type || "application/octet-stream")} · ${Math.ceil(Number(attachment.size || 0) / 1024)} KB · ${escapeHtml(userName(attachment.createdBy))} · ${escapeHtml(formatDateTime(attachment.createdAt))}</small></span>${editable && gpoDecision(currentUser(), "delete_attachment", item) === true ? `<button type="button" class="icon-button delete-icon" data-delete-kind="attachment" data-delete-id="${escapeHtml(attachment.id)}" aria-label="Excluir anexo ${escapeHtml(attachment.name)}">${icon("trash-2")}</button>` : ""}</div>`).join("") + '</div><p class="secondary">Anexos compartilhados. Cada download exige acesso autorizado ao item.</p></section>';
  }

  function renderServerStatusSettings() {
    const organizations = state.organizations.filter(organization => canManageOrganization(currentUser(), organization.id));
    const selected = organizations.some(organization => organization.id === ui.backendStatusOrganization) ? ui.backendStatusOrganization : organizations.some(organization => organization.id === currentUser().organizationId) ? currentUser().organizationId : organizations[0]?.id || "";
    ui.backendStatusOrganization = selected;
    if (!selected) return '<section class="panel-section"><h3>Status operacionais</h3><p class="muted">Seu perfil não permite configurar os status de uma empresa.</p></section>';
    return `<section class="panel-section"><h3>Status operacionais</h3><label>Empresa<select id="backendStatusOrganization">${organizations.map(organization => option(organization.id, organization.name, organization.id === selected)).join("")}</select></label><p class="muted">Ícones e cores são compartilhados entre os usuários da empresa. Bloqueios e criticidade conservam seus indicadores próprios.</p><div class="type-settings-list">${statusCatalog.filter(status => !["under_review", "correction"].includes(status.id)).map(status => {
      const config = statusConfig(status.id, selected);
      return `<form class="type-setting form-row" data-status-setting="${escapeHtml(status.id)}" data-status-organization="${escapeHtml(selected)}"><strong>${icon(config.icon)}${escapeHtml(status.label)}</strong><label>Ícone<select name="icon">${availableItemIcons.map(name => option(name, name, name === config.icon)).join("")}</select></label><label>Cor<input name="color" type="color" value="${escapeHtml(config.color)}" required/></label><button class="button quiet" type="submit">Salvar</button></form>`;
    }).join("")}</div></section>`;
  }

  async function downloadAttachment(id) {
    try {
      const response = await request(endpoint(`/attachments/${encodeURIComponent(id)}/download-url`), { method: "POST", body: {} });
      const url = new URL(response.url, window.location.href);
      if (url.origin !== window.location.origin) throw new Error("Endereço de download inválido.");
      const anchor = document.createElement("a"); anchor.href = url.href;
      anchor.download = state.attachments.find(attachment => attachment.id === id)?.name || "anexo";
      document.body.append(anchor); anchor.click(); anchor.remove();
    } catch (error) { originals.notify(error.message, "error"); }
  }

  async function uploadAttachments(itemId, files) {
    const selected = [...(files || [])].filter(file => file?.size > 0);
    for (const file of selected) {
      if (file.size > limits.attachmentMaxBytes) throw new Error(`O arquivo ${file.name} excede o limite de ${Math.floor(limits.attachmentMaxBytes / 1048576)} MB.`);
    }
    const uploaded = [];
    for (const file of selected) {
      const dataUrl = await readAttachment(file);
      const projection = await request(endpoint(`/items/${encodeURIComponent(itemId)}/attachments`), { method: "POST", body: { name: file.name, mime: file.type || "application/octet-stream", dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) } });
      applyProjection(projection, { preservePreferences: true });
      uploaded.push(file.name);
    }
    return uploaded;
  }

  async function updateItemForm(form, itemId) {
    const effective = new Date(form.get("effectiveAt"));
    if (!Number.isFinite(effective.getTime())) throw new Error("Informe a data e hora da mudança.");
    const files = form.getAll("attachments").filter(file => file?.size > 0);
    for (const file of files) if (file.size > limits.attachmentMaxBytes) throw new Error(`O arquivo ${file.name} excede o limite de ${Math.floor(limits.attachmentMaxBytes / 1048576)} MB.`);
    const changed = updateItem(itemId, itemInput(form, itemId), effective.toISOString(), String(form.get("comment") || ""));
    if (changed) await queueSave();
    if (files.length) {
      saving = true; busyIndicator();
      try { await uploadAttachments(itemId, files); }
      catch (error) {
        // Item edits and each completed upload are already confirmed. Do not
        // roll them back locally if a later file fails.
        originals.notify((changed ? "A edição do item foi salva. " : "") + "O envio de um anexo não foi concluído: " + error.message, "error");
        return;
      } finally { saving = false; busyIndicator(); originals.render(); decorate(); }
    }
    if (changed || files.length) originals.notify(files.length ? "Atualização e anexos registrados no servidor." : "Atualização registrada no servidor.");
    else {
      const field = document.getElementById("panelError");
      if (field) { field.hidden = false; field.textContent = "Nenhuma informação foi modificada."; }
    }
  }

  function serverGpo(user, operation, item = null) {
    if (!user || user.disabled) return false;
    const ranks = { global: 1, state: 2, organization: 2, sector: 3, project: 4, item: 5, creator: 5 };
    const profile = (state.permissionProfiles || []).find(value => value.id === user.profileId && !value.inactive && value.active !== false);
    const matching = (state.permissionRules || []).filter(rule => {
      if (rule.active === false || rule.inactive || rule.operation !== operation) return false;
      if (!((rule.subjectType === "user" && rule.subjectId === user.id) || (rule.subjectType === "profile" && profile && rule.subjectId === profile.id))) return false;
      if (rule.scopeType === "global") return true;
      if (!item) return false;
      const scopeId = rule.scopeId === "@user" ? ({ organization: user.organizationId, sector: user.sectorId, state: user.state, creator: user.id }[rule.scopeType] || rule.scopeId) : rule.scopeId;
      return rule.scopeType === "state" ? item.state === scopeId : rule.scopeType === "organization" ? item.organizationId === scopeId : rule.scopeType === "sector" ? item.sectorId === scopeId : rule.scopeType === "item" ? item.id === scopeId : rule.scopeType === "creator" ? item.createdBy === scopeId : rule.scopeType === "project" ? projectRootId(item) === scopeId : false;
    });
    if (!matching.length) return false;
    matching.sort((left, right) => (ranks[right.scopeType] || 0) - (ranks[left.scopeType] || 0) || Number(left.effect === "allow") - Number(right.effect === "allow"));
    return matching[0].effect === "allow";
  }

  function install() {
    originals = { render, renderPanel, notify, submitHandler, renderAttachments, removeAttachment, renderViewSettingsPanel, renderTypeSettings, renderGpo, renderDeletionPanel };
    saveState = queueSave;
    render = function () { if (isPending()) { busyIndicator(); return; } if (!ready) return; state.currentUserId = identity.id; originals.render(); decorate(); };
    renderPanel = function (...args) { if (isPending() || !ready) return; originals.renderPanel(...args); decorate(); };
    renderLogin = renderServerLogin;
    renderMasterSetup = () => renderServerLogin("O administrador precisa concluir a configuração inicial do servidor.");
    notify = function (message, kind = "success") {
      message = String(message).replace("histórico local", "histórico");
      if (isPending() && kind !== "error") { pendingMessages.push({ message, kind }); return; }
      if ((preferencesTimer || preferencesInFlight) && kind !== "error") { preferenceMessages.push({ message, kind }); return; }
      originals.notify(message, kind);
    };
    submitHandler = function (id, handler) {
      originals.submitHandler(id, async form => {
        const password = String(form.get("backendPassword") || "");
        if (id === "userForm") {
          if (password.length < 12) throw new Error("A senha inicial precisa ter pelo menos 12 caracteres.");
          passwordForNewEmail.set(String(form.get("email") || "").trim().toLowerCase(), password);
        } else if (id === "userEditForm" && password) {
          if (password.length < 12) throw new Error("A nova senha precisa ter pelo menos 12 caracteres.");
          passwordResets.set(String(form.get("userId")), password);
        }
        try {
          await handler(form);
          if (savePromise) await savePromise;
        } catch (error) {
          if (!isPending()) { passwordForNewEmail.clear(); passwordResets.clear(); actions = []; approvalBase = null; itemFieldHints.clear(); itemMetadata = null; }
          throw error;
        }
      });
    };
    const originalUpdateItem = updateItem;
    updateItem = function (id, input, effectiveAt = nowIso(), comment = "") {
      const before = getItem(id);
      const requestedFields = itemEditableFields.filter(field => Object.hasOwn(input, field) && input[field] !== undefined && !equal(input[field], before?.[field]));
      // The prototype uses nullish fallback when applying edits. An explicit
      // empty duration must still remove the value in the local preview, so the
      // server receives the same nullable intention as the form.
      const previewInput = input.plannedDurationDays === null && before?.plannedDurationDays !== null ? { ...input, plannedDurationDays: "", dueAt: "" } : input;
      const changed = originalUpdateItem(id, previewInput, effectiveAt, comment);
      if (changed) {
        const fields = itemFieldHints.get(id) || new Set();
        requestedFields.forEach(field => fields.add(field));
        itemFieldHints.set(id, fields);
        itemMetadata = { comment: String(comment || ""), effectiveAt };
      }
      return changed;
    };
    const wrapApproval = (name, original) => function (...args) {
      const before = clone(state);
      const result = original(...args);
      approvalBase ||= before;
      actions.push({ type: name, args: clone(args) });
      return result;
    };
    submitApprovalForReview = wrapApproval("submitApprovalForReview", submitApprovalForReview);
    decideApproval = wrapApproval("decideApproval", decideApproval);
    reopenApproval = wrapApproval("reopenApproval", reopenApproval);
    gpoDecision = serverGpo;
    canCreateItem = (user, item = null) => !!user && !user.disabled && gpoDecision(user, "create_item", item ? { ...item, createdBy: item.createdBy || user.id } : { organizationId: user.organizationId, sectorId: user.sectorId, state: user.state, createdBy: user.id }) === true;
    canDecideApproval = (user, item) => !!user && !user.disabled && !!item && item.type === "approval" && canViewItem(user, item) && (item.approvalReviewerId || item.ownerId) === user.id && gpoDecision(user, "decide_approval", item) === true;
    renderAttachments = renderServerAttachments;
    statusConfig = function (id, organizationId = currentUser()?.organizationId) {
      const defaults = statusDefaults[id] || { icon: "circle-help", color: "#596872" };
      const configured = { ...defaults, ...(state.statusSettings?.[organizationId]?.[id] || {}) };
      if (!availableItemIcons.includes(configured.icon)) configured.icon = ({ ready: "square-check", correction: "pencil", cancelled: "ban" })[id] || "circle-help";
      return configured;
    };
    renderStatusSettings = renderServerStatusSettings;
    removeAttachment = function (id) { const result = originals.removeAttachment(id); pendingDeletes.push(id); return result; };
    addAttachments = async function (itemId, files) { if (hasDomainChanges()) await queueSave(); return uploadAttachments(itemId, files); };
    renderViewSettingsPanel = () => originals.renderViewSettingsPanel()
      .replace("Preferências locais", "Minhas preferências")
      .replace("As preferências são salvas neste navegador.", "As preferências são salvas na sua conta para este workspace.")
      .replace("A posição dos nós é preservada localmente.", "A posição dos nós é preservada na sua conta por agrupamento.")
      .replace("As configurações são locais e não sincronizam entre dispositivos. Não há backend neste escopo.", "Suas preferências ficam disponíveis ao entrar neste workspace em outro dispositivo.");
    renderTypeSettings = () => originals.renderTypeSettings().replace("para cada tipo e empresa neste navegador.", "para cada tipo e empresa. As configurações são compartilhadas no workspace.");
    renderGpo = () => originals.renderGpo().replace("neste protótipo", "neste workspace");
    renderDeletionPanel = () => originals.renderDeletionPanel().replace("histórico local", "histórico");
    prd41LoadPaneWidths = () => state.paneWidths || { table: 0, graph: 38, gantt: 62 };
    prd41SavePaneWidths = () => { state.paneWidths = clone(prd41PaneWidths); state.ganttWidth = prd5GanttWidth; queuePreferences(); };
    prd5RestorePaneWidth = () => { const width = Number(state.ganttWidth); if (Number.isFinite(width) && width >= 35 && width <= 80) prd5GanttWidth = width; };
    prd5ResizePanes = delta => {
      const element = document.querySelector(".prd5-two-pane"); if (!element || prd41FocusedPane) return false;
      const width = element.getBoundingClientRect().width; if (width < 200) return false;
      prd5GanttWidth = Math.max(35, Math.min(80, prd5GanttWidth + delta / width * 100));
      element.style.setProperty("--prd5-gantt-width", prd5GanttWidth + "%"); state.ganttWidth = prd5GanttWidth;
      return true;
    };
    for (const type of ["click", "submit", "change", "keydown"]) document.addEventListener(type, event => {
      if (!isPending() || event.target.closest("[data-backend-surface]")) return;
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    document.addEventListener("submit", rememberAction, true);
    document.addEventListener("submit", event => {
      const form = event.target;
      if (!ready || !form.matches("[data-status-setting]")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const values = new FormData(form), organizationId = form.dataset.statusOrganization;
      if (!canManageOrganization(currentUser(), organizationId)) { originals.notify("O GPO não permite configurar status nesta empresa.", "error"); return; }
      state.statusSettings ||= {}; state.statusSettings[organizationId] ||= {};
      state.statusSettings[organizationId][form.dataset.statusSetting] = { icon: String(values.get("icon")), color: String(values.get("color")) };
      queueSave(); notify("Apresentação do status atualizada."); renderPanel(false);
    }, true);
    document.addEventListener("change", rememberAction, true);
    document.addEventListener("click", event => {
      const download = event.target.closest("[data-backend-download]");
      if (download) { event.preventDefault(); event.stopImmediatePropagation(); downloadAttachment(download.dataset.backendDownload); return; }
      if (event.target.closest('[data-action="logout"]')) { event.preventDefault(); event.stopImmediatePropagation(); logout(); return; }
      if (event.target.closest('[data-action="toggle-subitems"]')) setTimeout(() => { if (ready) { state.viewShowSubitems = ui.showSubitems; queuePreferences(); } }, 0);
      rememberAction(event);
    }, true);
    document.addEventListener("change", event => {
      if (!ready) return;
      if (event.target.id === "backendStatusOrganization") { ui.backendStatusOrganization = event.target.value; renderPanel(false); return; }
      if (event.target.id === "groupingSelect" || event.target.id === "scopeSelect") setTimeout(() => {
        state.viewGrouping = ui.grouping; state.viewScopeId = ui.scopeId; queuePreferences();
      }, 0);
    });
    const persistGraphView = () => {
      clearTimeout(graphPreferenceTimer);
      graphPreferenceTimer = setTimeout(() => {
        if (!ready || !graphInstance || isPending()) return;
        state.graphTransforms ||= {}; state.graphTransforms[layoutKey()] = graphInstance.getTransform(); queuePreferences();
      }, 120);
    };
    document.addEventListener("pointerup", persistGraphView);
    document.addEventListener("wheel", event => { if (event.target.closest("#graphCanvas")) persistGraphView(); }, { passive: true });
    window.addEventListener("beforeunload", event => {
      if (!isPending()) return;
      event.preventDefault(); event.returnValue = "";
    });
    window.addEventListener("online", refreshWhenIdle);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshWhenIdle(); });
  }

  async function start() {
    if (started) return; started = true;
    install();
    app.innerHTML = '<main class="login-screen"><section class="login-card" role="status"><h1>Fluxo Visual</h1><p>Conectando ao workspace…</p></section></main>';
    try { await acceptSession(await request(`${apiBase}/auth/session`)); }
    catch (error) { renderServerLogin(error.status === 401 ? "" : error.message); }
    pollTimer = setInterval(refreshWhenIdle, 12000);
  }

  window.FluxosBackend = Object.freeze({ enabled: true, start, updateItemForm, refresh: refreshWhenIdle, flush: () => savePromise || queueSave(), flushPreferences, downloadDraft, get status() { return { ready, saving: isPending(), revision, workspaceId, lastContact }; } });
})();
