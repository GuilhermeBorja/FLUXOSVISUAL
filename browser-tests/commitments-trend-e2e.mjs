import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fixture, addWorkspaceUser, TEST_PASSWORD, ADMIN, createItem } from '../tests/backend-support.mjs';

const cleanups = [];
const setup = await fixture({ after: callback => cleanups.push(callback) });
let browser;

async function login(page, email) {
  await page.goto(setup.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#backendLoginForm [name="email"]').fill(email);
  await page.locator('#backendLoginForm [name="password"]').fill(TEST_PASSWORD);
  await page.locator('#backendLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => window.FluxosBackend?.status.ready);
  await page.locator('.ops-shell').waitFor();
}

try {
  const owner = await addWorkspaceUser(setup, {
    id: 'u_commitment_owner',
    name: 'Responsável do acordo',
    email: 'commitment-owner@example.test',
    operations: ['view_item', 'manage_commitment', 'record_measurement'],
  });
  const item = await createItem(setup.admin, 'Atividade com acordo', {
    id: 'commitment_e2e_item',
    ownerId: owner.user.id,
    plannedStartAt: '2026-11-16',
    plannedDurationDays: 3,
  });
  await setup.admin.command('proposeCommitment', [item.id, {
    startAt: '2026-11-17',
    dueAt: '2026-11-19',
    scopeNote: 'Data confirmada com a diretoria.',
    requesterId: ADMIN.id,
    ownerId: owner.user.id,
  }]);
  const commitment = setup.app.storage.db.prepare("SELECT id FROM commitments WHERE workspace_id=? AND item_id=? AND status='proposed'").get('w_a', item.id);
  setup.app.storage.db.prepare('INSERT INTO commitment_acceptances(commitment_id,actor_id,role,accepted_at) VALUES(?,?,?,?)').run(commitment.id, ADMIN.id, 'requester', '2026-11-16T12:00:00.000Z');

  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  await login(page, owner.user.email);
  await page.locator('[data-action="toggle-operations"]').click();
  await page.locator('.my-actions').waitFor();
  assert.match(await page.locator('.my-actions').innerText(), /Aceitar compromisso/);
  assert.match(await page.locator('.my-actions').innerText(), /Data confirmada/);
  const backendState = await page.evaluate(() => ({ status: window.FluxosBackend.status, actions: state.actions }));
  assert.equal(backendState.status.ready, true);
  const acceptance = page.waitForResponse(response => response.url().endsWith('/commands') && response.request().method() === 'POST');
  await page.locator('[data-accept-commitment="' + commitment.id + '"]').click();
  const acceptanceResponse = await acceptance;
  if (acceptanceResponse.status() !== 200) console.error('acceptance response', acceptanceResponse.status(), acceptanceResponse.url(), await acceptanceResponse.text());
  assert.equal(acceptanceResponse.status(), 200);
  await page.waitForFunction(() => !document.querySelector('[data-accept-commitment]'));
  assert.equal(setup.app.storage.db.prepare('SELECT status FROM commitments WHERE id=?').get(commitment.id).status, 'active');

  await page.locator('.gantt-item[data-select="' + item.id + '"]').click();
  await page.locator('.gantt-history-inline').waitFor();
  assert.match(await page.locator('.gantt-history-inline').innerText(), /Acordo vigente/);
  assert.equal(await page.locator('#measurementForm input[name="percent"]').count(), 1);
  assert.equal(await page.locator('#updateItemForm input[name="progressPercent"]').count(), 0);
  const measurementDate = page.locator('#measurementForm input[name="effectiveAt"]');
  assert.ok(await measurementDate.getAttribute('max'), 'measurement date blocks future values');
  await measurementDate.fill('2026-11-18T12:00');
  await measurementDate.dispatchEvent('change');
  await page.waitForFunction(() => document.querySelector('[data-measurement-expected]')?.textContent !== 'calculando…');
  assert.match(await page.locator('[data-measurement-expected]').innerText(), /\d+%/);
  await page.locator('[data-gantt-layer="baseline"]').first().waitFor();
  await page.locator('[data-gantt-layer="agreement"]').first().waitFor();
  await page.locator('[data-gantt-layer="trend"]').first().waitFor();
  assert.equal(await page.locator('[data-gantt-layer="baseline"]').count(), 1);
  assert.equal(await page.locator('[data-gantt-layer="agreement"]').count(), 1);
  assert.equal(await page.locator('[data-gantt-layer="trend"]').count(), 1);
  assert.match(await page.locator('.gantt-commitment-legend').innerText(), /Baseline original/);
  assert.match(await page.locator('.gantt-commitment-legend').innerText(), /Compromisso vigente/);
  assert.match(await page.locator('.gantt-commitment-legend').innerText(), /Tendência atual/);
  console.log('Commitments Chromium: pending action, bilateral acceptance and selected Gantt history passed.');
} finally {
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
}
