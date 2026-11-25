import assert from "node:assert/strict";
import { chromium } from "playwright";
import { fixture, createItem, addWorkspaceUser, ADMIN, TEST_PASSWORD } from "../tests/backend-support.mjs";

const cleanups = [];
const setup = await fixture({ after: callback => cleanups.push(callback) });
let browser;
try {
  const approver = await addWorkspaceUser(setup, {
    id: "u_multi_action_approver",
    email: "multi-action-approver@example.test",
    operations: ["view_item", "manage_commitment"],
  });
  const tasks = [];
  for (let index = 1; index <= 3; index++) {
    const item = await createItem(setup.admin, `Atividade ${index}`, { id: `multi_action_${index}` });
    await setup.admin.command("proposeCommitment", [item.id, { startAt: "2026-11-18", dueAt: `2026-11-${20 + index}` }]);
    tasks.push(item);
  }

  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(setup.baseUrl, { waitUntil: "networkidle" });
  await page.locator("#backendLoginForm [name=email]").fill(approver.user.email);
  await page.locator("#backendLoginForm [name=password]").fill(TEST_PASSWORD);
  await page.locator("#backendLoginForm button[type=submit]").click();
  await page.waitForFunction(() => window.FluxosBackend?.status.ready);
  await page.locator('[data-action="toggle-operations"]').click();

  const actions = page.locator("[data-accept-commitment]");
  await assert.equal(await actions.count(), tasks.length);
  assert.deepEqual(await page.locator(".my-actions article strong").allTextContents(), tasks.map(task => task.title));
  for (let index = 0; index < tasks.length; index++) {
    await actions.first().click({ timeout: 3000 });
    await page.waitForFunction(expected => document.querySelectorAll("[data-accept-commitment]").length === expected, tasks.length - index - 1);
  }
  assert.equal(await actions.count(), 0, "approver can accept each pending commitment");
} finally {
  await browser?.close();
  for (const cleanup of cleanups.reverse()) await cleanup();
}
