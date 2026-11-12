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

try {
  const { user } = await addWorkspaceUser(setup, { id: 'u_operator', name: 'Operador de teste', email: 'operator@example.test', operations: ['view_item', 'create_item', 'edit_item', 'create_relation', 'edit_relation', 'delete_relation', 'change_owner', 'change_weight', 'change_duration', 'change_hierarchy', 'add_attachment', 'delete_attachment', 'create_approval', 'decide_approval'] });
  browser = await chromium.launch({ headless: true });
  const ownerContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const operatorContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const owner = await ownerContext.newPage(); const operator = await operatorContext.newPage();
  watch(owner); watch(operator);
  await login(owner);
  assert.equal(await owner.locator('#loginForm select').count(), 0, 'production login does not offer impersonation');

  await owner.locator('.workspace-heading-actions [data-action="create"]').click();
  const form = owner.locator('#createItemForm');
  await form.locator('#prd43PasteActivities').fill('Projeto compartilhado\n\tAtividade compartilhada\n\tRevisão compartilhada');
  await form.locator('[name="stepOwner_1"]').selectOption(user.id);
  await form.locator('[name="stepOwner_2"]').selectOption(user.id);
  await form.locator('[name="stepDuration_1"]').fill('2');
  await form.locator('[name="stepDuration_2"]').fill('1');
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
  assert.ok(root && activity && successor);
  assert.equal(activity.parentId, root.id); assert.equal(successor.parentId, root.id);
  assert.equal(projection.state.relations.length, 1);
  assert.equal(successor.plannedStartAt, '2026-11-04');
  await closePanel(owner);

  for (const width of [1366, 1920]) {
    await owner.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
    const dimensions = await owner.locator('#prd43GanttScroll').evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
    assert.ok(dimensions.scroll <= dimensions.client + 3, `Gantt overflow at ${width}: ${JSON.stringify(dimensions)}`);
  }
  await owner.setViewportSize({ width: 1366, height: 768 });
  await login(operator, user.email);
  await expand(operator, root.id);
  await operator.locator(`.prd5-gantt-edit[data-select="${activity.id}"]`).click();
  const editor = operator.locator('#updateItemForm');
  await editor.locator('[name="status"]').selectOption('in_progress');
  await editor.locator('[name="progressPercent"]').fill('35');
  await editor.locator('button[type="submit"]').click();
  await operator.evaluate(() => FluxosBackend.flush());
  projection = await setup.admin.projection();
  assert.equal(projection.state.items.find(item => item.id === activity.id).progressPercent, 35);
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForFunction(id => state.items.find(item => item.id === id)?.progressPercent === 35, activity.id);
  assert.equal(await owner.evaluate(() => localStorage.getItem('fluxosVisualState.prd4')), null, 'workspace state is not persisted in browser storage');

  // Two concurrent forms keep separate revisions; an old save must preserve its draft.
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

  await anotherOwner.locator('[data-action="logout"]').click();
  await anotherOwner.locator('#backendLoginForm').waitFor();
  assert.deepEqual(errors, [], 'no uncaught exceptions or missing icons');
  assert.deepEqual(failures, [], 'no server errors in the user journeys');
  console.log('Backend Chromium: login, shared tree/TI, 2 users, confirmed save, stale-edit draft, attachment/download, user preferences, logout and 1366/1920 layouts passed.');
} finally {
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
}
