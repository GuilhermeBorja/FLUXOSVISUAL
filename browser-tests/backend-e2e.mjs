import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { fixture, addWorkspaceUser, TEST_PASSWORD, ADMIN } from '../tests/backend-support.mjs';

const cleanups = [];
const setup = await fixture({ after: callback => cleanups.push(callback) });
let browser;
const errors = [];
const failures = [];

async function login(page, email = ADMIN.email) {
  await page.goto(setup.baseUrl, { waitUntil: 'networkidle' });
  const buildLabel = page.locator('[data-build-label]').first();
  await buildLabel.waitFor();
  assert.match(await buildLabel.innerText(), /Versão .+ · build [a-z0-9]+/);
  const form = page.locator('#backendLoginForm');
  await form.locator('[name="email"]').fill(email);
  await form.locator('[name="password"]').fill(TEST_PASSWORD);
  await form.locator('button[type="submit"]').click();
  await page.waitForFunction(() => window.FluxosBackend?.status.ready);
  await page.locator('.ops-shell').waitFor();
}

function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'warning' && /icon.*(missing|unknown|not found)|não.*ícone/i.test(message.text())) errors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 500) failures.push(`${response.status()} ${response.url()}`);
  });
}

async function expand(page, rootId) {
  const toggle = page.locator(`[data-gantt-row="${rootId}"] [data-expand="${rootId}"]`);
  if (await toggle.count() && (await toggle.getAttribute('aria-label')).startsWith('Expandir')) await toggle.click();
}

async function closePanel(page) {
  const button = page.locator('#panelRoot .drawer-header button[data-action="close-panel"]');
  if (await button.count()) await button.click();
}

function pastedHierarchySignature(state, rootId, childIds) {
  const indexById = new Map(childIds.map((id, index) => [id, index]));
  return {
    items: childIds.map(id => {
      const item = state.items.find(entry => entry.id === id);
      return { parentAssigned: item?.parentId === rootId, duration: item?.plannedDurationDays, start: item?.plannedStartAt, due: item?.dueAt };
    }),
    relations: state.relations
      .filter(relation => indexById.has(relation.sourceId) && indexById.has(relation.targetId))
      .map(relation => ({ source: indexById.get(relation.sourceId), target: indexById.get(relation.targetId), type: relation.relationType, lag: relation.lagDays }))
      .sort((a, b) => a.source - b.source || a.target - b.target),
  };
}

try {
  const { user } = await addWorkspaceUser(setup, { id: 'u_operator', name: 'Operador de teste', email: 'operator@example.test', operations: ['view_item', 'create_item', 'edit_item', 'create_relation', 'edit_relation', 'delete_relation', 'change_owner', 'change_weight', 'change_duration', 'change_hierarchy', 'add_attachment', 'delete_attachment', 'create_approval', 'decide_approval', 'manage_commitment'] });
  const { user: executorUser } = await addWorkspaceUser(setup, { id: 'u_executor', name: 'Executor de teste', email: 'executor@example.test', operations: ['view_item', 'record_measurement'] });
  browser = await chromium.launch({ headless: true });
  const ownerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const operatorContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const executorContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const owner = await ownerContext.newPage(); const operator = await operatorContext.newPage(); const executor = await executorContext.newPage();
  watch(owner); watch(operator); watch(executor);
  await login(owner);
  const domainSchedule = await owner.evaluate(() => {
    if (typeof window.FluxosDomain?.analyzeSchedule !== 'function') return null;
    return window.FluxosDomain.analyzeSchedule(
      [{ id: 'browser-domain-task', status: 'backlog', plannedStartAt: '2026-11-02', plannedDurationDays: 1 }],
      [],
      { today: '2026-11-02' },
    );
  });
  assert.equal(domainSchedule?.finishDate, '2026-11-02', 'the browser loads and executes the shared source domain API');
  assert.equal(domainSchedule?.rows[0]?.critical, true);
  assert.equal(await owner.locator('#loginForm select').count(), 0, 'production login does not offer impersonation');

  await owner.locator('[data-action="admin"]').click();
  assert.ok(await owner.locator('[data-admin-tab="calendar"]').count(), 'calendar settings are visible to an authorized administrator');
  await owner.locator('[data-admin-tab="calendar"]').click();
  const calendarForm = owner.locator('#calendarForm');
  await calendarForm.waitFor();
  assert.match(await owner.locator('#panelRoot').innerText(), /Nenhum calendário de projeto configurado/);
  await calendarForm.locator('[name="kind"]').selectOption('working_time');
  await calendarForm.locator('[name="workingWeekdays"]').evaluateAll(elements => elements.forEach(element => { element.checked = false; }));
  const emptyWeekdayRequest = owner.waitForRequest(request => request.url().endsWith('/commands') && request.method() === 'POST', { timeout: 750 }).then(() => true).catch(() => false);
  await calendarForm.locator('button[type="submit"]').click();
  assert.equal(await emptyWeekdayRequest, false, 'a working-time calendar cannot be saved without any working day');
  assert.match(await owner.locator('#panelError').innerText(), /Selecione pelo menos um dia de trabalho/);
  await calendarForm.locator('[name="workingWeekdays"]').evaluateAll(elements => elements.forEach(element => { element.checked = [1, 2, 3, 4, 5, 6].includes(Number(element.value)); }));
  await calendarForm.locator('[name="holidays"]').fill('25/12/2026');
  const invalidCalendarResponse = owner.waitForResponse(response => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await calendarForm.locator('button[type="submit"]').click();
  assert.equal((await invalidCalendarResponse).status(), 422);
  assert.equal(await owner.locator('#panelError').isVisible(), true, 'backend calendar validation errors are shown in the panel');
  await calendarForm.locator('[name="holidays"]').fill('2026-12-25');
  const calendarResponse = owner.waitForResponse(response => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await calendarForm.locator('button[type="submit"]').click();
  assert.equal((await calendarResponse).status(), 200);
  assert.match(await owner.locator('#noticeRoot').innerText(), /Calendário atualizado/);
  assert.deepEqual({ ...setup.app.storage.db.prepare('SELECT id,kind,timezone,definition_json FROM project_calendars WHERE workspace_id=? AND id=?').get('w_a', 'project-calendar') }, {
    id: 'project-calendar', kind: 'working_time', timezone: 'America/Sao_Paulo',
    definition_json: JSON.stringify({ kind: 'working_time', workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: ['2026-12-25'] }),
  });
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(() => window.FluxosBackend?.status.ready);
  await owner.locator('[data-action="admin"]').click();
  await owner.locator('[data-admin-tab="calendar"]').click();
  await owner.locator('#calendarForm').waitFor();
  assert.equal(await owner.locator('#calendarForm [name="kind"]').inputValue(), 'working_time');
  assert.equal(await owner.locator('#calendarForm [name="workingWeekdays"][value="6"]').isChecked(), true);
  assert.equal(await owner.locator('#calendarForm [name="holidays"]').inputValue(), '2026-12-25');
  await closePanel(owner);

  await owner.locator('.workspace-heading-actions [data-action="create"]').click();
  const form = owner.locator('#createItemForm');
  await form.locator('#prd43PasteActivities').fill('Projeto compartilhado\n\tAtividade compartilhada\n\tRevisão compartilhada\n\tMarco independente');
  await form.locator('[name="stepOwner_1"]').selectOption(user.id);
  await form.locator('[name="stepOwner_2"]').selectOption(user.id);
  await form.locator('[name="stepOwner_3"]').selectOption(user.id);
  await form.locator('[name="stepDuration_1"]').fill('0');
  await form.locator('[name="stepDuration_2"]').fill('0.5');
  await form.locator('[name="stepDuration_3"]').fill('1');
  await form.locator('[name="plannedStartAt"]').fill('2026-11-02');
  await form.locator('#prd43Sequence').check();
  const createdResponse = owner.waitForResponse(response => response.url().endsWith('/sync') && response.request().method() === 'POST');
  await form.locator('button[type="submit"]').click();
  assert.equal((await createdResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  let projection = await setup.admin.projection();
  const root = projection.state.items.find(item => item.title === 'Projeto compartilhado');
  const activity = projection.state.items.find(item => item.title === 'Atividade compartilhada');
  const successor = projection.state.items.find(item => item.title === 'Revisão compartilhada');
  const milestone = projection.state.items.find(item => item.title === 'Marco independente');
  assert.ok(root && activity && successor && milestone);
  assert.equal(activity.parentId, root.id); assert.equal(successor.parentId, root.id);
  assert.equal(milestone.parentId, root.id);
  assert.equal(activity.plannedDurationDays, 0);
  assert.equal(successor.plannedDurationDays, 0.5);
  assert.equal(milestone.plannedDurationDays, 1);
  assert.equal(projection.state.relations.length, 2);
  assert.equal(successor.plannedStartAt, '2026-11-02');
  assert.equal(activity.dueAt, '2026-11-02', 'zero duration remains on its inclusive start date');
  const plainPasteSignature = pastedHierarchySignature(projection.state, root.id, [activity.id, successor.id, milestone.id]);
  await closePanel(owner);

  await owner.locator(`[data-gantt-handle="${activity.id}"]`).click();
  await owner.locator('#prd44TiDestination').selectOption(milestone.id);
  const createRelationResponse = owner.waitForResponse(response => response.url().endsWith('/sync') && response.request().method() === 'POST');
  await owner.locator('#prd43GanttRelationEditor [data-action="prd44-confirm-ti"]').click();
  assert.equal((await createRelationResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  let directRelation = projection.state.relations.find(relation => relation.sourceId === activity.id && relation.targetId === milestone.id);
  assert.ok(directRelation, 'creating a TI in the Gantt persists it in the backend');
  assert.equal(await owner.locator(`[data-gantt-bar="${activity.id}"]`).getAttribute('data-gantt-start'), '2026-11-02');
  assert.equal(await owner.locator(`[data-gantt-bar="${activity.id}"]`).getAttribute('data-gantt-end'), '2026-11-02');

  await owner.locator(`.prd43-ti-html-hit[data-gantt-ti="${directRelation.id}"]`).click();
  const relationEditor = owner.locator('#prd43GanttRelationEditor');
  await relationEditor.waitFor({ state: 'visible' });
  await relationEditor.locator('#prd43TiLag').fill('1');
  const updateRelationResponse = owner.waitForResponse(response => response.url().endsWith('/sync') && response.request().method() === 'POST');
  await relationEditor.locator('[data-action="prd43-update-ti"]').click();
  assert.equal((await updateRelationResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  directRelation = projection.state.relations.find(relation => relation.id === directRelation.id);
  assert.equal(directRelation.lagDays, 1);
  const milestoneAfterEdit = projection.state.items.find(item => item.id === milestone.id);
  assert.equal(milestoneAfterEdit.plannedStartAt, '2026-11-03');
  assert.equal(milestoneAfterEdit.baselineStartAt, '2026-11-02');
  assert.ok(projection.state.events.some(event => event.itemId === milestone.id && event.eventType === 'relation_lag_changed'));
  assert.match(await owner.locator(`[data-gantt-bar="${milestone.id}"]`).getAttribute('title'), /04\/11\/2026/);

  await owner.locator(`.prd43-ti-html-hit[data-gantt-ti="${directRelation.id}"]`).click();
  const deleteRelationResponse = owner.waitForResponse(response => response.url().endsWith('/sync') && response.request().method() === 'POST');
  await owner.locator('#prd43GanttRelationEditor [data-action="prd43-delete-ti"]').click();
  assert.equal((await deleteRelationResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  assert.equal(projection.state.relations.some(relation => relation.id === directRelation.id), false);
  assert.ok(projection.state.events.some(event => event.itemId === milestone.id && event.eventType === 'relation_removed'));

  await owner.locator(`.prd5-gantt-edit[data-select="${root.id}"]`).click();
  assert.equal(await owner.locator('#measurementForm').count(), 0, 'project groups do not accept their own measurement');
  assert.match(await owner.locator('#panelRoot').innerText(), /O avanço deste item é consolidado pelos subitens/);
  await closePanel(owner);

  await login(executor, executorUser.email);
  await expand(executor, root.id);
  await executor.locator(`.prd5-gantt-edit[data-select="${activity.id}"]`).click();
  const measurement = executor.locator('#measurementForm');
  await measurement.waitFor();
  assert.equal(await measurement.locator('[name="plannedDurationDays"]').count(), 0, 'executor cannot set duration');
  assert.equal(await measurement.locator('[name="dueAt"]').count(), 0, 'executor cannot set deadline');
  await measurement.locator('[name="percent"]').fill('25');
  const measurementResponse = executor.waitForResponse(response => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await measurement.locator('button[type="submit"]').click();
  assert.equal((await measurementResponse).status(), 200);
  assert.equal(setup.app.storage.db.prepare('SELECT percent FROM measurements WHERE workspace_id=? AND item_id=? ORDER BY effective_at DESC').get('w_a', activity.id).percent, 25);
  assert.match(await executor.locator('.latest-measurement').innerText(), /25%/, 'the saved measurement is shown immediately');
  await closePanel(executor);

  // The browser must render the immutable baseline and measured trend, and a Gantt
  // date drag must stage a commitment proposal without rewriting the plan.
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(() => window.FluxosBackend?.status.ready);
  await expand(owner, root.id);
  const trendItemId = milestone.id;
  await owner.locator(`.prd5-gantt-edit[data-select="${trendItemId}"]`).click();
  const planEditor = owner.locator('#updateItemForm');
  await planEditor.locator('[name="plannedDurationDays"]').fill('10');
  const planUpdateResponse = owner.waitForResponse(response => response.url().endsWith('/sync') && response.request().method() === 'POST');
  await planEditor.locator('button[type="submit"]').click();
  assert.equal((await planUpdateResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  let trendItem = projection.state.items.find(item => item.id === trendItemId);
  assert.equal(trendItem.plannedDurationDays, 10);
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(() => window.FluxosBackend?.status.ready);
  await expand(owner, root.id);
  await owner.locator(`.prd5-gantt-edit[data-select="${trendItem.id}"]`).click();
  const trendMeasurement = owner.locator('#measurementForm');
  await trendMeasurement.waitFor();
  await trendMeasurement.locator('[name="percent"]').fill('20');
  const trendMeasurementResponse = owner.waitForResponse(response => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await trendMeasurement.locator('button[type="submit"]').click();
  assert.equal((await trendMeasurementResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  trendItem = projection.state.items.find(item => item.id === trendItemId);
  await closePanel(owner);
  const activityRow = owner.locator(`[data-gantt-row="${trendItem.id}"]`);
  await activityRow.locator(`.prd5-gantt-edit[data-select="${trendItem.id}"]`).click();
  await owner.locator('#commitmentProposalForm').waitFor();
  assert.equal(await activityRow.locator('[data-gantt-layer="baseline"]').count(), 1, 'the original baseline is visible as a distinct Gantt layer');
  assert.equal(await activityRow.locator('[data-gantt-layer="trend"]').count(), 1, 'the measured trend is visible as a distinct Gantt layer');
  assert.match(await owner.locator('.gantt-commitment-legend').innerText(), /Baseline/);
  assert.match(await owner.locator('.gantt-commitment-legend').innerText(), /Tendência atual/);
  const trendBar = owner.locator(`[data-gantt-date-drag="${trendItem.id}"]`);
  const dayCount = Number(await trendBar.getAttribute('data-gantt-max-day'));
  assert.ok(dayCount > 0, 'the visible trend exposes a draggable date range');
  const dragStartAt = await trendBar.getAttribute('data-gantt-start');
  const dragDueAt = await trendBar.getAttribute('data-gantt-end');
  await closePanel(owner);
  const trendBarBox = await trendBar.boundingBox();
  const trackBox = await owner.locator(`[data-gantt-track="${trendItem.id}"]`).boundingBox();
  assert.ok(trendBarBox && trackBox, 'the trend bar and timeline are visible after closing the panel');
  const deltaX = trackBox.width / dayCount * 2;
  await owner.mouse.move(trendBarBox.x + trendBarBox.width / 2, trendBarBox.y + trendBarBox.height / 2);
  await owner.mouse.down();
  await owner.mouse.move(trendBarBox.x + trendBarBox.width / 2 + deltaX, trendBarBox.y + trendBarBox.height / 2, { steps: 4 });
  await owner.mouse.up();
  await owner.waitForTimeout(500);
  const proposalForm = owner.locator('#commitmentProposalForm');
  await proposalForm.waitFor({ timeout: 2500 });
  const draftedStartAt = await proposalForm.locator('[name="startAt"]').inputValue();
  const draftedDueAt = await proposalForm.locator('[name="dueAt"]').inputValue();
  assert.notEqual(draftedStartAt, dragStartAt, 'dragging the trend stages a shifted start date');
  assert.notEqual(draftedDueAt, dragDueAt, 'dragging the trend stages a shifted end date');
  projection = await setup.admin.projection();
  let activityAfterDraft = projection.state.items.find(item => item.id === trendItem.id);
  assert.equal(activityAfterDraft.plannedStartAt, trendItem.plannedStartAt, 'dragging does not rewrite planned start');
  assert.equal(activityAfterDraft.baselineStartAt, trendItem.baselineStartAt, 'dragging does not rewrite baseline start');
  await proposalForm.locator('[name="scopeNote"]').fill('E2E: replanejamento revisado antes de formalizar.');
  const proposeResponse = owner.waitForResponse(response => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await proposalForm.locator('button[type="submit"]').click();
  assert.equal((await proposeResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  const visibleProposal = projection.commitments.find(entry => entry.itemId === trendItem.id && entry.kind === 'agreement' && entry.status === 'proposed');
  assert.ok(visibleProposal, 'the visible form persists a pending commitment proposal');
  assert.equal(visibleProposal.startAt, draftedStartAt);
  assert.equal(visibleProposal.dueAt, draftedDueAt);
  activityAfterDraft = projection.state.items.find(item => item.id === trendItem.id);
  assert.equal(activityAfterDraft.plannedStartAt, trendItem.plannedStartAt, 'sending the proposal leaves planned start unchanged');
  assert.equal(activityAfterDraft.baselineStartAt, trendItem.baselineStartAt, 'sending the proposal leaves baseline unchanged');
  await owner.locator(`[data-gantt-row="${trendItem.id}"] [data-gantt-layer="proposal"]`).waitFor();
  assert.equal(await owner.locator(`[data-gantt-row="${trendItem.id}"] [data-gantt-layer="baseline"]`).count(), 1);
  assert.equal(await owner.locator(`[data-gantt-row="${trendItem.id}"] [data-gantt-layer="proposal"]`).count(), 1);
  assert.equal(await owner.locator(`[data-gantt-row="${trendItem.id}"] [data-gantt-layer="trend"]`).count(), 1);
  const visibleProposalId = visibleProposal.id;
  setup.app.storage.db.prepare('INSERT INTO commitment_acceptances(commitment_id,actor_id,role,accepted_at) VALUES(?,?,?,?)')
    .run(visibleProposalId, ADMIN.id, 'requester', '2026-11-25T12:00:00.000Z');
  await closePanel(owner);

  // A user who can see the Gantt but cannot edit relations must not persist a TI edit.
  await expand(executor, root.id);
  projection = await setup.admin.projection();
  const protectedRelation = projection.state.relations.find(relation => relation.sourceId === activity.id);
  assert.ok(protectedRelation, 'the visible sequential TI is available for the permission check');
  const protectedRelationBefore = structuredClone(protectedRelation);
  const eventCountBeforeDeniedEdit = projection.state.events.length;
  const revisionBeforeDeniedEdit = projection.revision;
  await executor.locator(`.prd43-ti-html-hit[data-gantt-ti="${protectedRelation.id}"]`).click();
  const protectedRelationEditor = executor.locator('#prd43GanttRelationEditor');
  await protectedRelationEditor.waitFor({ state: 'visible' });
  await protectedRelationEditor.locator('#prd43TiLag').fill('2');
  await protectedRelationEditor.locator('[data-action="prd43-update-ti"]').click();
  assert.match(await executor.locator('#noticeRoot').innerText(), /GPO|permite|permiss|negad|autoriz/i, 'the UI rejects a relation edit by a read-only executor');
  const serverDeniedEdit = await executor.evaluate(async ({ revision, relationId }) => {
    const session = await (await fetch('/api/auth/session', { credentials: 'same-origin' })).json();
    const response = await fetch('/api/workspaces/w_a/commands', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken },
      body: JSON.stringify({ expectedRevision: revision, commands: [{ type: 'updateRelation', args: [relationId, { lagDays: 2 }] }] }),
    });
    return { status: response.status, body: await response.json() };
  }, { revision: revisionBeforeDeniedEdit, relationId: protectedRelation.id });
  assert.equal(serverDeniedEdit.status, 403, 'the authenticated server rejects a direct relation edit without edit_relation permission');
  assert.notEqual(serverDeniedEdit.body.code || serverDeniedEdit.body.error?.code, 'INVALID_CSRF_TOKEN', 'the request passed CSRF and was rejected by authorization');
  projection = await setup.admin.projection();
  assert.equal(projection.revision, revisionBeforeDeniedEdit, 'a rejected edit does not advance the workspace revision');
  assert.equal(projection.state.events.length, eventCountBeforeDeniedEdit, 'a rejected edit writes no audit event');
  assert.deepEqual(projection.state.relations.find(relation => relation.id === protectedRelation.id), protectedRelationBefore);

  for (const width of [1366, 1920]) {
    await owner.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
    const dimensions = await owner.locator('#prd43GanttScroll').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    assert.ok(dimensions.scroll <= dimensions.client + 3, `Gantt overflow at ${width}: ${JSON.stringify(dimensions)}`);
  }
  await owner.setViewportSize({ width: 1366, height: 768 });
  await login(operator, user.email);
  await operator.locator('[data-action="toggle-operations"]').click();
  await operator.locator('.my-actions').waitFor();
  assert.match(await operator.locator('.my-actions').innerText(), /Aceitar compromisso/);
  const visibleAcceptance = operator.waitForResponse(response => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await operator.locator(`[data-accept-commitment="${visibleProposalId}"]`).click();
  assert.equal((await visibleAcceptance).status(), 200);
  await operator.waitForFunction(id => !document.querySelector(`[data-accept-commitment="${id}"]`), visibleProposalId);
  assert.equal(setup.app.storage.db.prepare('SELECT status FROM commitments WHERE id=?').get(visibleProposalId).status, 'active');
  const ownerAcceptance = setup.app.storage.db.prepare('SELECT role FROM commitment_acceptances WHERE commitment_id=? AND actor_id=?').get(visibleProposalId, user.id);
  assert.equal(ownerAcceptance.role, 'owner');
  await operator.locator('button[aria-label="Fechar Meu painel"]').click();
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(() => window.FluxosBackend?.status.ready);
  await expand(owner, root.id);
  const agreedRow = owner.locator(`[data-gantt-row="${trendItem.id}"]`);
  assert.equal(await agreedRow.locator('[data-gantt-layer="baseline"]').count(), 1);
  assert.equal(await agreedRow.locator('[data-gantt-layer="agreement"]').count(), 1, 'accepted commitment is rendered as an active Gantt layer');
  assert.equal(await agreedRow.locator('[data-gantt-layer="trend"]').count(), 1);
  await agreedRow.locator(`.gantt-item[data-select="${trendItem.id}"]`).click();
  assert.match(await owner.locator('.gantt-history-inline').innerText(), /Acordo vigente/);
  await closePanel(owner);
  await expand(operator, root.id);
  await operator.locator('[data-action="admin"]').click();
  assert.equal(await operator.locator('[data-admin-tab="calendar"]').count(), 0, 'calendar settings are hidden without manage_calendar permission');
  await operator.locator('#panelRoot button[data-action="close-panel"]').click();
  await expand(operator, root.id);
  await operator.locator(`.prd5-gantt-edit[data-select="${activity.id}"]`).click();
  assert.equal(await operator.locator('#measurementForm').count(), 0, 'users without measurement permission do not get an editable field');
  assert.match(await operator.locator('#panelRoot').innerText(), /Você não tem permissão para registrar avanço real/);
  const editor = operator.locator('#updateItemForm');
  await editor.locator('[name="title"]').fill('Atividade compartilhada editada');
  await editor.locator('button[type="submit"]').click();
  await operator.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  assert.equal(projection.state.items.find(item => item.id === activity.id).title, 'Atividade compartilhada editada');
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(id => state.items.find(item => item.id === id)?.title === 'Atividade compartilhada editada', activity.id);
  assert.equal(await owner.evaluate(() => localStorage.getItem('fluxosVisualState.prd4')), null, 'workspace state is not persisted in browser storage');

  // Two concurrent forms keep separate revisions; an old save must preserve its draft.
  await expand(owner, root.id);
  await owner.locator(`.prd5-gantt-edit[data-select="${activity.id}"]`).click();
  await owner.locator('#measurementForm [name="percent"]').waitFor();
  assert.equal(await owner.locator('#measurementForm [name="percent"]').inputValue(), '25', 'the last saved measurement is loaded when reopening the activity');
  await closePanel(owner);
  await expand(owner, root.id);
  await owner.locator(`.prd5-gantt-edit[data-select="${activity.id}"]`).click();
  await owner.locator('#updateItemForm [name="title"]').fill('Rascunho preservado');
  await operator.locator('#updateItemForm [name="title"]').fill('Nome confirmado pelo operador');
  await operator.locator('#updateItemForm button[type="submit"]').click();
  await operator.evaluate(() => FluxosBackend.flush());
  const conflict = owner.waitForResponse(response => response.url().endsWith('/sync') && response.status() === 409);
  await owner.locator('#updateItemForm button[type="submit"]').click();
  await conflict;
  await owner.locator('#backendDialog').waitFor();
  assert.match(await owner.locator('#backendDialogTitle').innerText(), /Outra pessoa/);
  await owner.locator('[data-backend-close]').click();
  assert.equal(await owner.locator('#updateItemForm [name="title"]').inputValue(), 'Rascunho preservado');
  projection = await setup.admin.projection();
  assert.equal(projection.state.items.find(item => item.id === activity.id).title, 'Nome confirmado pelo operador');
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(() => window.FluxosBackend?.status.ready);

  const attachmentBytes = Buffer.from('Evidência compartilhada entre sessões.\n', 'utf8');
  await operator.locator('#updateItemForm input[type="file"]').setInputFiles({ name: 'evidencia-compartilhada.txt', mimeType: 'text/plain', buffer: attachmentBytes });
  const uploadedResponse = operator.waitForResponse(response => /\/items\/[^/]+\/attachments$/.test(response.url()) && response.request().method() === 'POST');
  await operator.locator('#updateItemForm button[type="submit"]').click();
  assert.equal((await uploadedResponse).status(), 201);
  await operator.waitForFunction(() => !FluxosBackend.status.saving);
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(() => window.FluxosBackend?.status.ready);
  await expand(owner, root.id);
  await owner.locator(`.prd5-gantt-edit[data-select="${activity.id}"]`).click();
  const attachment = (await setup.admin.projection()).state.attachments.find(a => a.itemId === activity.id);
  assert.ok(attachment && attachment.hash || attachment?.sha256, 'server persists an attachment digest');
  const details = owner.locator('.prd5-panel-extras').filter({ has: owner.locator('[data-backend-download]') });
  if (await details.count()) await details.locator('summary').click();
  const downloaded = owner.waitForEvent('download');
  await owner.locator(`[data-backend-download="${attachment.id}"]`).click();
  const download = await downloaded;
  const destination = join(setup.dataDir, 'downloaded-evidence.txt'); await download.saveAs(destination);
  assert.deepEqual(await readFile(destination), attachmentBytes);
  await closePanel(owner);

  // Preference changes follow the person across devices, without changing another person's layout.
  const settings = owner.locator('.prd44-pane-options').filter({ has: owner.locator('summary[aria-label="Configurações do Gantt"]') });
  await settings.locator('summary').click();
  await owner.locator('[data-prd5-column="weight"]').check();
  await owner.evaluate(() => FluxosBackend.flushPreferences());
  const anotherOwnerContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const anotherOwner = await anotherOwnerContext.newPage(); watch(anotherOwner); await login(anotherOwner);
  await anotherOwner.locator('summary[aria-label="Configurações do Gantt"]').click();
  assert.equal(await anotherOwner.locator('[data-prd5-column="weight"]').isChecked(), true);
  await closePanel(operator);
  await operator.locator('summary[aria-label="Configurações do Gantt"]').click();
  assert.equal(await operator.locator('[data-prd5-column="weight"]').isChecked(), false);

  const escapedPaste = String.raw`Projeto escapado\n    Atividade escapada\n    Revisão escapada\n    Marco escapado`;
  assert.equal(escapedPaste.includes('\n'), false, 'the parity fixture carries literal escaped newlines');
  assert.equal(escapedPaste.split('\\n').length - 1, 3);
  await owner.locator('.workspace-heading-actions [data-action="create"]').click();
  const escapedForm = owner.locator('#createItemForm');
  await escapedForm.locator('#prd43PasteActivities').fill(escapedPaste);
  await escapedForm.locator('[name="stepOwner_1"]').selectOption(user.id);
  await escapedForm.locator('[name="stepOwner_2"]').selectOption(user.id);
  await escapedForm.locator('[name="stepOwner_3"]').selectOption(user.id);
  await escapedForm.locator('[name="stepDuration_1"]').fill('0');
  await escapedForm.locator('[name="stepDuration_2"]').fill('0.5');
  await escapedForm.locator('[name="stepDuration_3"]').fill('1');
  await escapedForm.locator('[name="plannedStartAt"]').fill('2026-11-02');
  await escapedForm.locator('#prd43Sequence').check();
  const escapedCreatedResponse = owner.waitForResponse(response => response.url().endsWith('/sync') && response.request().method() === 'POST');
  await escapedForm.locator('button[type="submit"]').click();
  assert.equal((await escapedCreatedResponse).status(), 200);
  await owner.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  const escapedRoot = projection.state.items.find(item => item.title === 'Projeto escapado');
  const escapedActivity = projection.state.items.find(item => item.title === 'Atividade escapada');
  const escapedSuccessor = projection.state.items.find(item => item.title === 'Revisão escapada');
  const escapedMilestone = projection.state.items.find(item => item.title === 'Marco escapado');
  assert.ok(escapedRoot && escapedActivity && escapedSuccessor && escapedMilestone, 'literal escaped text creates the same visible item set');
  assert.deepEqual(
    pastedHierarchySignature(projection.state, escapedRoot.id, [escapedActivity.id, escapedSuccessor.id, escapedMilestone.id]),
    plainPasteSignature,
    'literal escaped newline and indentation input persists the same parentage, durations, schedule dates, and sequential TIs as real newlines',
  );

  await anotherOwner.locator('[data-action="logout"]').click();
  await anotherOwner.locator('#backendLoginForm').waitFor();
  assert.deepEqual(errors, [], 'no uncaught exceptions or missing icons');
  assert.deepEqual(failures, [], 'no server errors in the user journeys');
  console.log('Backend Chromium: login, shared tree/TI, 2 users, confirmed save, stale-edit draft, attachment/download, user preferences, logout and 1366/1920 layouts passed.');
} finally {
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
}
