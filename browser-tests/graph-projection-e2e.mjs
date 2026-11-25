import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fixture, TEST_PASSWORD, ADMIN, createItem } from '../tests/backend-support.mjs';

const cleanups = [];
const setup = await fixture({ after: callback => cleanups.push(callback) });
let browser;

try {
  const parent = await createItem(setup.admin, 'Projeto hierárquico');
  const child = await createItem(setup.admin, 'Subitem visível', { parentId: parent.id });
  const source = await createItem(setup.admin, 'Origem da relação');
  const target = await createItem(setup.admin, 'Destino da relação');
  await setup.admin.command('createRelation', [source.id, target.id, 'TI', 0]);
  const relation = (await setup.admin.projection()).state.relations.find(item => item.sourceId === source.id && item.targetId === target.id);
  assert.ok(relation);

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(setup.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#backendLoginForm [name="email"]').fill(ADMIN.email);
  await page.locator('#backendLoginForm [name="password"]').fill(TEST_PASSWORD);
  await page.locator('#backendLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => FluxosBackend.status.ready);

  const graph = page.locator('#graphCanvas');
  const parentNode = graph.locator(`[data-node="${parent.id}"]`);
  const childNode = graph.locator(`[data-node="${child.id}"]`);
  const edge = graph.locator(`[data-edge="${relation.id}"]`);
  await parentNode.waitFor();
  await graph.locator(`[data-node="${source.id}"]`).waitFor();
  await graph.locator(`[data-node="${target.id}"]`).waitFor();
  await edge.waitFor();
  assert.equal(await childNode.count(), 0, 'subitems start collapsed');

  await page.locator('#showSubitems').click();
  await childNode.waitFor();
  const hierarchyEdge = graph.locator(`.graph-edge.hierarchy[aria-label*="${parent.title}"][aria-label*="${child.title}"]`);
  await hierarchyEdge.waitFor();
  assert.match(await edge.getAttribute('aria-label'), /Origem da relação.*Destino da relação/);
  await edge.focus();
  await edge.press('Enter');
  await page.getByText(/Relação selecionada/).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: ['grafo mostra raízes e relações', 'expandir níveis apresenta filho e aresta hierárquica', 'aresta TI informa endpoints e responde a Enter'], browserErrors: errors }, null, 2));
} finally {
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
}
