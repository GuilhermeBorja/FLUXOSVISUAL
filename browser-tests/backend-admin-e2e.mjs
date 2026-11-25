import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fixture, TEST_PASSWORD, ADMIN, createItem } from '../tests/backend-support.mjs';

const cleanups = [], errors = [], checks = [];
const setup = await fixture({ after: callback => cleanups.push(callback) });
let browser;

async function login(page, email, password = TEST_PASSWORD) {
  await page.goto(setup.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#backendLoginForm [name="email"]').fill(email);
  await page.locator('#backendLoginForm [name="password"]').fill(password);
  await page.locator('#backendLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => window.FluxosBackend?.status.ready);
}
async function save(page, selector, operation = 'click') {
  const response = page.waitForResponse(result => result.url().endsWith('/sync') && result.request().method() === 'POST');
  if (operation === 'click') await page.locator(selector).click();
  else await page.locator(selector).selectOption(operation);
  const result = await response;
  assert.equal(result.status(), 200, await result.text());
  await page.evaluate(() => FluxosBackend.flush());
}
async function tab(page, name) {
  if (!await page.locator('[data-admin-tab]').count()) await page.locator('[data-action="admin"]').click();
  await page.locator(`[data-admin-tab="${name}"]`).click();
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const readerContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage(), reader = await readerContext.newPage();
  for (const active of [page, reader]) {
    active.setDefaultTimeout(10000);
    active.on('pageerror', error => errors.push(error.message));
    active.on('console', message => { if (message.type() === 'warning' && /icon/i.test(message.text())) errors.push(message.text()); });
  }
  await login(page, ADMIN.email);
  await tab(page, 'users');
  const userForm = page.locator('#userForm');
  await userForm.locator('[name="name"]').fill('Fiscal de teste');
  await userForm.locator('[name="email"]').fill('fiscal@example.test');
  await userForm.locator('[name="profileId"]').selectOption('profile_reader');
  await userForm.locator('[name="backendPassword"]').fill(TEST_PASSWORD);
  await save(page, '#userForm button[type="submit"]');
  let projection = await setup.admin.projection();
  const fiscal = projection.state.users.find(user => user.email === 'fiscal@example.test');
  assert.ok(fiscal); assert.equal(fiscal.password, undefined);
  assert.equal(await page.evaluate(() => localStorage.getItem('fluxosVisualState.prd4')), null);
  checks.push('Cadastro de usuário com senha real, sem credencial no estado ou localStorage');

  await login(reader, fiscal.email);
  assert.equal(await reader.locator('.workspace-heading-actions [data-action="create"]').isDisabled(), true);
  await save(page, `[data-user-profile="${fiscal.id}"]`, 'profile_editor');
  await reader.reload({ waitUntil: 'networkidle' });
  await reader.waitForFunction(() => FluxosBackend.status.ready);
  assert.equal(await reader.locator('.workspace-heading-actions [data-action="create"]').isEnabled(), true);
  checks.push('Alteração de perfil GPO reflete no outro usuário após nova leitura');

  await tab(page, 'organizations');
  await page.locator('#organizationForm [name="name"]').fill('Empresa de execução');
  await page.locator('#organizationForm [name="state"]').fill('SP');
  await save(page, '#organizationForm button[type="submit"]');
  projection = await setup.admin.projection();
  const company = projection.state.organizations.find(organization => organization.name === 'Empresa de execução');
  assert.ok(company);
  await page.locator('#sectorForm [name="organizationId"]').selectOption(company.id);
  await page.locator('#sectorForm [name="name"]').fill('Fiscalização');
  await save(page, '#sectorForm button[type="submit"]');
  projection = await setup.admin.projection();
  const sector = projection.state.sectors.find(value => value.organizationId === company.id && value.name === 'Fiscalização');
  assert.ok(sector);
  checks.push('Empresas e setores persistidos por seus cadastros');

  await tab(page, 'statuses');
  await page.locator('#backendStatusOrganization').selectOption(company.id);
  await page.locator('[data-status-setting="ready"] [name="icon"]').selectOption('square-check');
  await page.locator('[data-status-setting="ready"] [name="color"]').fill('#174b7a');
  await save(page, '[data-status-setting="ready"] button[type="submit"]');
  await page.locator('[data-status-setting="blocked"] [name="color"]').fill('#174b7a');
  await save(page, '[data-status-setting="blocked"] button[type="submit"]');
  projection = await setup.admin.projection();
  assert.deepEqual(projection.state.statusSettings[company.id].ready, { icon: 'square-check', color: '#174b7a' });
  assert.deepEqual(projection.state.statusSettings[company.id].blocked, { icon: 'ban', color: '#174b7a' });
  assert.equal(projection.state.statusSettings[ADMIN.organizationId]?.ready, undefined);
  checks.push('Status e ícones configuráveis por empresa sem afetar outra empresa');

  await tab(page, 'types');
  await page.locator('#typeOrganization').selectOption(company.id);
  await page.locator('[data-type-setting="task"] [name="icon"]').selectOption('layers-2');
  await page.locator('[data-type-setting="task"] [name="color"]').fill('#174b7a');
  await save(page, '[data-type-setting="task"] button[type="submit"]');
  projection = await setup.admin.projection();
  assert.deepEqual(projection.state.typeSettings[company.id].task, { icon: 'layers-2', color: '#174b7a' });
  checks.push('Tipo de item personalizado e salvo no servidor');

  await tab(page, 'gpo');
  await page.locator('#permissionProfileForm [name="name"]').fill('Fiscalização QA');
  await save(page, '#permissionProfileForm button[type="submit"]');
  projection = await setup.admin.projection();
  const profile = projection.state.permissionProfiles.find(value => value.name === 'Fiscalização QA');
  assert.ok(profile);
  const ruleForm = page.locator('#gpoRuleForm');
  await ruleForm.locator('[name="subject"]').selectOption(`profile:${profile.id}`);
  await ruleForm.locator('[name="operation"]').selectOption('view_item');
  await ruleForm.locator('[name="scope"]').selectOption(`organization:${company.id}`);
  await ruleForm.locator('[name="effect"]').selectOption('allow');
  await save(page, '#gpoRuleForm button[type="submit"]');
  projection = await setup.admin.projection();
  assert.ok(projection.state.permissionRules.some(rule => rule.subjectId === profile.id && rule.scopeId === company.id && rule.effect === 'allow'));
  checks.push('Perfil reutilizável e regra GPO criados pela administração');

  await tab(page, 'users');
  await page.locator(`[data-edit-user="${fiscal.id}"]`).click();
  const edit = page.locator('#userEditForm');
  await edit.locator('[name="organizationId"]').selectOption(company.id);
  await edit.locator('[name="sectorId"]').selectOption(sector.id);
  await edit.locator('[name="state"]').fill('SP');
  await edit.locator('[name="profileId"]').selectOption(profile.id);
  await save(page, '#userEditForm button[type="submit"]');
  projection = await setup.admin.projection();
  assert.equal(projection.state.users.find(user => user.id === fiscal.id).organizationId, company.id);
  checks.push('Alteração de empresa, setor e perfil preserva identidade do usuário');

  const companyRoot = await createItem(setup.admin, 'Grafo empresa raiz', { ownerId: fiscal.id, organizationId: company.id, sectorId: sector.id, state: 'SP', status: 'ready', plannedStartAt: '2026-09-01', dueAt: '2026-10-01' });
  const companyChild = await createItem(setup.admin, 'Grafo empresa bloqueado', { ownerId: fiscal.id, organizationId: company.id, sectorId: sector.id, state: 'SP', status: 'blocked', blockedReason: 'Aguardando liberação', parentId: companyRoot.id, plannedStartAt: '2026-09-01', dueAt: '2026-10-01' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => FluxosBackend.status.ready);
  await page.locator('#showSubitems').click();
  const graph = page.locator('#graphCanvas');
  const childNode = graph.locator(`[data-node="${companyChild.id}"]`);
  await childNode.waitFor();
  assert.equal(await childNode.locator('.node-circle').getAttribute('stroke'), '#174b7a');
  assert.match(await childNode.getAttribute('aria-label'), /bloqueado/i);
  assert.match(await childNode.locator('title').textContent(), /Bloqueios: Bloqueio próprio/);
  await childNode.focus();
  await childNode.press('Enter');
  await page.getByRole('heading', { name: 'Grafo empresa bloqueado', exact: true }).waitFor();
  const detailStatus = page.locator('#panelRoot .status-badge');
  assert.match(await detailStatus.getAttribute('title'), /bloquead/i);
  assert.equal(await detailStatus.evaluate(el => getComputedStyle(el).getPropertyValue('--status-color').trim()), '#174b7a');
  assert.match(await page.locator('#panelRoot .prd43-status-alert').textContent(), /atraso/i);
  await page.locator('#panelRoot [data-action="close-panel"]').last().click();
  checks.push('Grafo mostra o item bloqueado e abre seus detalhes por teclado');

  const splitter = page.locator('[data-pane-split="gantt-graph"]');
  const focusGraph = page.locator('[data-pane-focus="graph"]');
  assert.equal(await splitter.getAttribute('aria-valuemin'), '35');
  assert.equal(await splitter.getAttribute('aria-valuemax'), '80');
  const paneWidthBefore = await page.locator('.prd5-two-pane').evaluate(el => getComputedStyle(el).getPropertyValue('--prd5-gantt-width'));
  await splitter.focus();
  await splitter.press('ArrowRight');
  const paneWidthAfter = await page.locator('.prd5-two-pane').evaluate(el => getComputedStyle(el).getPropertyValue('--prd5-gantt-width'));
  assert.notEqual(paneWidthAfter, paneWidthBefore);
  assert.ok(Number(await splitter.getAttribute('aria-valuenow')) > Number(await splitter.getAttribute('aria-valuemin')));
  await focusGraph.click();
  assert.equal(await focusGraph.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.prd5-two-pane').getAttribute('data-focus'), 'graph');
  await focusGraph.click();
  assert.equal(await page.locator('.prd5-two-pane').getAttribute('data-focus'), 'all');
  checks.push('Splitter anuncia limites/valor, redimensiona por teclado e foco do painel pode ser ativado/restaurado');

  await tab(page, 'users');
  await page.locator(`[data-edit-user="${fiscal.id}"]`).click();
  const resetPassword = 'Another local acceptance password 2026!';
  await page.locator('#userEditForm [name="backendPassword"]').fill(resetPassword);
  const passwordResponse = page.waitForResponse(result => result.url().endsWith(`/users/${fiscal.id}/password`) && result.request().method() === 'POST');
  await page.locator('#userEditForm button[type="submit"]').click();
  const reset = await passwordResponse;
  assert.equal(reset.status(), 200, await reset.text());
  await page.evaluate(() => FluxosBackend.flush());
  await reader.reload({ waitUntil: 'networkidle' });
  await reader.locator('#backendLoginForm').waitFor();
  await login(reader, fiscal.email, resetPassword);
  checks.push('Redefinição de senha invalida a sessão anterior e permite o novo login');

  await reader.locator('[data-backend-password]').click();
  await reader.locator('#backendPasswordForm [name="currentPassword"]').fill(resetPassword);
  await reader.locator('#backendPasswordForm [name="newPassword"]').fill(TEST_PASSWORD);
  await reader.locator('#backendPasswordForm [name="confirmation"]').fill(TEST_PASSWORD);
  await reader.locator('#backendPasswordForm button[type="submit"]').click();
  await reader.locator('#backendLoginForm').waitFor();
  await login(reader, fiscal.email, TEST_PASSWORD);
  checks.push('Usuário altera a própria senha e autentica novamente');

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks, browserErrors: errors }, null, 2));
} finally {
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
}
