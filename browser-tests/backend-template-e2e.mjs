import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fixture, itemInput, ADMIN, TEST_PASSWORD } from '../tests/backend-support.mjs';

const cleanups = [], errors = [], checks = [];
const setup = await fixture({ after: callback => cleanups.push(callback) });
let browser;

async function save(page, selector) {
  const pending = page.waitForResponse(response => response.url().endsWith('/sync') && response.request().method() === 'POST');
  await page.locator(selector).click();
  const response = await pending;
  assert.equal(response.status(), 200, await response.text());
  await page.evaluate(() => FluxosBackend.flush());
  return response.request().postDataJSON();
}
async function reload(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => FluxosBackend.status.ready);
}
async function closePanel(page) {
  const close = page.locator('#panelRoot button[data-action="close-panel"]');
  if (await close.count()) await close.click();
}
async function edit(page, itemId, parentId = '') {
  await closePanel(page);
  if (parentId) {
    const toggle = page.locator(`[data-gantt-row="${parentId}"] [data-expand="${parentId}"]`);
    if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
  }
  await page.locator(`.prd5-gantt-edit[data-select="${itemId}"]`).click();
}

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(setup.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#backendLoginForm [name="email"]').fill(ADMIN.email);
  await page.locator('#backendLoginForm [name="password"]').fill(TEST_PASSWORD);
  await page.locator('#backendLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => FluxosBackend.status.ready);

  await page.locator('.workspace-heading-actions [data-action="create"]').click();
  const form = page.locator('#createItemForm');
  await form.locator('#prd43PasteActivities').fill('Modelo original\n\tFolha sem duração\n\tFolha três dias\n\tAprovação final\n\tGrupo posterior');
  await form.locator('[name="stepType_0"]').selectOption('project');
  await form.locator('[name="stepType_3"]').selectOption('approval');
  await form.locator('[name="stepType_4"]').selectOption('process');
  await form.locator('[name="stepDuration_1"]').fill('');
  await form.locator('[name="stepDuration_2"]').fill('3');
  await form.locator('[name="plannedStartAt"]').fill('2026-11-02');
  const creation = await save(page, '#createItemForm button[type="submit"]');
  assert.deepEqual(creation.fieldHints, {}, 'a new tree does not claim automatic values as manual edits');
  let projection = await setup.admin.projection();
  const root = projection.state.items.find(item => item.title === 'Modelo original');
  const undated = projection.state.items.find(item => item.title === 'Folha sem duração');
  const threeDays = projection.state.items.find(item => item.title === 'Folha três dias');
  const approval = projection.state.items.find(item => item.title === 'Aprovação final');
  const laterGroup = projection.state.items.find(item => item.title === 'Grupo posterior');
  assert.equal(undated.plannedDurationDays, null);
  assert.equal(threeDays.plannedDurationDays, 3);

  await edit(page, approval.id, root.id);
  await page.locator('[data-panel-tab="approval"]').click();
  await page.locator('#approvalSubmitForm [name="note"]').fill('Decisão do fluxo original');
  await save(page, '#approvalSubmitForm button[type="submit"]');
  await page.locator('#approvalDecisionForm [name="reason"]').fill('Original aprovado');
  await save(page, '#approvalDecisionForm button[type="submit"]');
  assert.equal((await setup.admin.projection()).state.items.find(item => item.id === approval.id).status, 'done');

  // Arrange a hierarchy whose child record predates its parent record. Saving
  // and applying this existing tree must use hierarchy order, not array order.
  await setup.admin.command('moveItemHierarchy', [undated.id, laterGroup.id]);
  await reload(page);
  await edit(page, root.id);
  await page.locator('#templateSaveForm [name="name"]').fill('Modelo com duração e aprovação');
  await save(page, '#templateSaveForm button[type="submit"]');
  projection = await setup.admin.projection();
  const template = projection.state.templates.find(value => value.name === 'Modelo com duração e aprovação');
  assert.ok(template);
  assert.equal(template.items.find(item => item.key === undated.id).plannedDurationDays, null);
  assert.equal(template.items.find(item => item.key === threeDays.id).plannedDurationDays, 3);
  assert.ok(template.items.findIndex(item => item.key === laterGroup.id) < template.items.findIndex(item => item.key === undated.id));
  checks.push('Modelo salvo remotamente preserva duração nula, duração explícita e pais antes dos filhos');

  await reload(page);
  await page.locator('.workspace-heading-actions [data-action="templates"]').click();
  await page.locator(`[data-apply-template="${template.id}"]`).click();
  const apply = page.locator('#templateApplyForm');
  await apply.locator('[name="title"]').fill('Cópia do modelo');
  await apply.locator('[name="startDate"]').fill('2026-12-01');
  assert.deepEqual(await apply.locator(`[name="status_${approval.id}"] option`).evaluateAll(options => options.map(option => option.value)), ['backlog']);
  await save(page, '#templateApplyForm button[type="submit"]');
  projection = await setup.admin.projection();
  const copy = projection.state.items.find(item => item.title === 'Cópia do modelo');
  const groupCopy = projection.state.items.find(item => item.parentId === copy.id && item.title === laterGroup.title);
  const nullCopy = projection.state.items.find(item => item.parentId === groupCopy.id && item.title === undated.title);
  const durationCopy = projection.state.items.find(item => item.parentId === copy.id && item.title === threeDays.title);
  const approvalCopy = projection.state.items.find(item => item.parentId === copy.id && item.title === approval.title);
  assert.equal(nullCopy.plannedDurationDays, null); assert.equal(nullCopy.dueAt, '');
  assert.equal(durationCopy.plannedDurationDays, 3); assert.equal(durationCopy.dueAt, '2026-12-03');
  assert.equal(approvalCopy.status, 'backlog'); assert.equal(approvalCopy.approvalRound, 1);
  assert.ok(!projection.state.approvalDecisions.some(decision => decision.itemId === approvalCopy.id));
  assert.ok([copy.id, groupCopy.id, nullCopy.id, durationCopy.id, approvalCopy.id].every(id => !template.items.some(item => item.key === id)));
  checks.push('Aplicação pela UI preserva duração nula e cria aprovação pendente, com novas identidades e sem copiar decisões');

  // A dependent created before its source is the regression case for diff
  // ordering. An item-scoped denial proves that derived changes never become
  // an extra manual update on the dependent.
  await setup.admin.command('createItem', [itemInput('Dependente anterior', { id: 'earlier_dependent' })]);
  await setup.admin.command('createItem', [itemInput('Origem posterior', { id: 'later_source' })]);
  await setup.admin.command('createRelation', ['later_source', 'earlier_dependent', 'TI', 0, '']);
  await setup.admin.sync(state => state.permissionRules.push({ id: 'deny_manual_dependent', subjectType: 'user', subjectId: ADMIN.id, operation: 'change_duration', scopeType: 'item', scopeId: 'earlier_dependent', effect: 'deny' }));
  await reload(page);
  await edit(page, 'later_source');
  await page.locator('#updateItemForm [name="plannedDurationDays"]').fill('5');
  const updatePayload = await save(page, '#updateItemForm button[type="submit"]');
  assert.ok(updatePayload.fieldHints.later_source.includes('plannedDurationDays'));
  assert.equal(updatePayload.fieldHints.earlier_dependent, undefined);
  projection = await setup.admin.projection();
  assert.equal(projection.state.items.find(item => item.id === 'later_source').plannedDurationDays, 5);
  assert.equal(projection.state.items.find(item => item.id === 'earlier_dependent').plannedStartAt, '2026-11-07');
  checks.push('Datas TI derivadas são recalculadas sem edição manual do dependente criado antes da origem');

  await page.locator('#updateItemForm [name="plannedDurationDays"]').fill('');
  await save(page, '#updateItemForm button[type="submit"]');
  projection = await setup.admin.projection();
  assert.equal(projection.state.items.find(item => item.id === 'later_source').plannedDurationDays, null);
  assert.equal(projection.state.items.find(item => item.id === 'later_source').dueAt, '');
  checks.push('Limpar duração pela UI conserva null no servidor');

  await page.locator('#updateItemForm .prd42-update-log > summary').click();
  await page.locator('#updateItemForm [name="comment"]').fill('Registro sem alterar campos do item');
  const commentPayload = await save(page, '#updateItemForm button[type="submit"]');
  assert.deepEqual(commentPayload.fieldHints.later_source, []);
  assert.equal(commentPayload.comment, 'Registro sem alterar campos do item');
  projection = await setup.admin.projection();
  assert.ok(projection.state.events.some(event => event.itemId === 'later_source' && event.eventType === 'comment' && event.comment === commentPayload.comment));
  checks.push('Comentário isolado é confirmado e auditado sem fabricar alteração de campo');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, browserErrors: errors }, null, 2));
} finally {
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
}
