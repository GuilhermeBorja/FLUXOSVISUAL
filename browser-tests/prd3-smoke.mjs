import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:8080", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const seeded = seedState();
    seeded.setupComplete = true;
    seeded.currentUserId = "u_luis";
    localStorage.setItem("fluxosVisualState.v2", JSON.stringify(seeded));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".ops-shell").waitFor();
  assert.match(await page.title(), /Fluxo Visual/);
  assert.equal(await page.getByRole("tab", { name: /Sintética/ }).count(), 1);
  assert.equal(await page.getByRole("tab", { name: /Analítica/ }).count(), 1);
  assert.equal(await page.getByRole("tab", { name: /Gantt/ }).count(), 1);

  await page.getByRole("tab", { name: /Gantt/ }).click();
  await page.locator(".gantt-card").waitFor();
  assert.equal(await page.locator(".gantt-axis").count(), 1);

  await page.getByRole("tab", { name: /Analítica/ }).click();
  await page.locator(".graph-svg").waitFor();
  assert.ok(await page.locator(".node-ideal-start").count() > 0);
  assert.ok(await page.locator(".node-ideal-end").count() > 0);
  assert.ok((await page.locator(".node-duration").first().textContent()).includes("Resp."));

  await page.getByRole("button", { name: /Configurações/ }).click();
  await page.locator('[data-row-fill-level="1"]').waitFor();
  await page.locator('[data-row-fill-level="1"]').evaluate((input) => {
    input.value = "#123456";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator(".ops-shell").waitFor();
  await page.locator('[data-action="close-panel"]').click();
  await page.getByRole("tab", { name: /Sintética/ }).click();
  const showSubitems = page.locator("#showSubitems");
  if (!(await showSubitems.isChecked())) await showSubitems.check();
  const childRow = page.locator('tr[data-depth="1"]').first();
  await childRow.waitFor();
  assert.equal(await childRow.evaluate((row) => getComputedStyle(row).getPropertyValue("--row-fill").trim()), "#123456");
  assert.equal(errors.length, 0, errors.join("\n"));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.equal(await page.locator(".ops-shell").isVisible(), true);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("PRD3 browser smoke passed: navigation, Gantt, graph dates, row color setting, mobile viewport.");
} finally {
  await browser.close();
}
