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

  // P0 regression: the same newly created item must remain available in all
  // three views after a real state mutation, without changing its identity.
  const crossViewItem = await page.evaluate(() => {
    const item = createItem({
      title: "P0 cross-view consistency probe",
      type: "task",
      status: "in_progress",
      ownerId: "u_luis",
      organizationId: "org_castro",
      sectorId: "sec_pmo",
      state: "PE",
      plannedStartAt: "2026-10-20",
      dueAt: "2026-10-22",
      plannedDurationDays: 2,
      weight: 1,
    });
    render();
    return { id: item.id, title: item.title };
  });
  await page.locator(`tr[data-row="${crossViewItem.id}"]`).waitFor();

  await page.getByRole("tab", { name: /Analítica/ }).click();
  await page.locator(`.graph-node[data-node="${crossViewItem.id}"]`).waitFor();

  await page.getByRole("tab", { name: /Gantt/ }).click();
  await page.locator(`.gantt-item[data-select="${crossViewItem.id}"]`).waitFor();

  await page.getByRole("tab", { name: /Sintética/ }).click();

  // P0 regression: an edit must be reflected consistently by every view too.
  await page.evaluate((id) => {
    const item = getItem(id);
    updateItem(id, { ...item, title: "P0 cross-view consistency edited", progressPercent: 45 }, nowIso(), "Smoke test mutation");
    render();
  }, crossViewItem.id);
  await page.locator(`tr[data-row="${crossViewItem.id}"] .item-title`).getByText("P0 cross-view consistency edited").waitFor();

  await page.getByRole("tab", { name: /Analítica/ }).click();
  const editedNode = page.locator(`.graph-node[data-node="${crossViewItem.id}"]`);
  await editedNode.waitFor();
  assert.match(await editedNode.getAttribute("aria-label"), /P0 cross-view consistency edited/);

  await page.getByRole("tab", { name: /Gantt/ }).click();
  await page.locator(`.gantt-item[data-select="${crossViewItem.id}"]`).getByText("P0 cross-view consistency edited").waitFor();

  // P0 M-02: verify identity survives relation creation, reordering, completion,
  // archiving and restoration in all three views.
  const mutationPeerId = await page.evaluate(() => {
    const peer = createItem({
      title: "P0 cross-view mutation peer",
      type: "task",
      status: "in_progress",
      ownerId: "u_luis",
      organizationId: "org_castro",
      sectorId: "sec_pmo",
      state: "PE",
      plannedStartAt: "2026-10-20",
      dueAt: "2026-10-23",
      plannedDurationDays: 3,
      weight: 1,
    });
    render();
    return peer.id;
  });
  await page.evaluate(({ id, peerId }) => {
    createRelation(id, peerId, "blocks");
    reorderItem(id, peerId, true);
    const item = getItem(id);
    updateItem(id, { ...item, status: "done", progressPercent: 100 }, nowIso(), "P0 M-02 completion mutation");
    render();
  }, { id: crossViewItem.id, peerId: mutationPeerId });

  const assertCrossViewPresence = async (present) => {
    await page.getByRole("tab", { name: /Sintética/ }).click();
    const row = page.locator(`tr[data-row="${crossViewItem.id}"]`);
    if (present) await row.waitFor();
    else await row.waitFor({ state: "detached" });

    await page.getByRole("tab", { name: /Analítica/ }).click();
    const node = page.locator(`.graph-node[data-node="${crossViewItem.id}"]`);
    if (present) await node.waitFor();
    else await node.waitFor({ state: "detached" });

    await page.getByRole("tab", { name: /Gantt/ }).click();
    const bar = page.locator(`.gantt-item[data-select="${crossViewItem.id}"]`);
    if (present) await bar.waitFor();
    else await bar.waitFor({ state: "detached" });
  };
  await assertCrossViewPresence(true);

  await page.evaluate((id) => { archiveItem(id); render(); }, crossViewItem.id);
  await assertCrossViewPresence(false);
  await page.evaluate((id) => { restoreArchivedItem(id); render(); }, crossViewItem.id);
  await assertCrossViewPresence(true);

  await page.getByRole("tab", { name: /Sintética/ }).click();

  // P0 R2-25: opening an item exposes the schedule/baseline fields and duration.
  await page.locator(`button[data-select="${crossViewItem.id}"]`).first().click();
  await page.locator("#updateItemForm").waitFor();
  const itemScheduleSummary = await page.locator("#updateItemForm .schedule-summary").innerText();
  assert.match(itemScheduleSummary, /Início previsto/);
  assert.match(itemScheduleSummary, /Término previsto/);
  assert.match(itemScheduleSummary, /Início baseline/);
  assert.match(itemScheduleSummary, /Término baseline/);
  assert.equal(await page.locator('#updateItemForm [name="plannedDurationDays"]').inputValue(), "2");
  await page.getByRole("button", { name: /Fechar painel/ }).click();
  await page.locator(".drawer").waitFor({ state: "detached" });

  await page.getByRole("tab", { name: /Gantt/ }).click();
  await page.locator(".gantt-card").waitFor();
  assert.equal(await page.locator(".gantt-axis").count(), 1);

  await page.getByRole("tab", { name: /Analítica/ }).click();
  await page.locator(".graph-svg").waitFor();
  assert.ok(await page.locator(".node-ideal-start").count() > 0);
  assert.ok(await page.locator(".node-ideal-end").count() > 0);
  assert.ok((await page.locator(".node-duration").first().textContent()).includes("Resp."));

  await page.getByRole("button", { name: /Configurações/ }).click();
  const drawer = page.locator(".drawer");
  await drawer.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });
  const drawerWidthBefore = await drawer.evaluate((element) => element.getBoundingClientRect().width);
  const drawerHandle = page.locator(".drawer-resize-handle");
  const drawerHandleBox = await drawerHandle.boundingBox();
  assert.ok(drawerHandleBox);
  await page.mouse.move(drawerHandleBox.x + 4, drawerHandleBox.y + drawerHandleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(drawerHandleBox.x - 36, drawerHandleBox.y + drawerHandleBox.height / 2);
  await page.mouse.up();
  const drawerWidthAfter = await drawer.evaluate((element) => element.getBoundingClientRect().width);
  assert.ok(drawerWidthAfter >= drawerWidthBefore + 20, `drawer width did not increase: ${drawerWidthBefore} -> ${drawerWidthAfter}`);
  await page.locator('[data-row-fill-level="1"]').waitFor();
  await page.locator('[data-row-fill-level="1"]').evaluate((input) => {
    input.value = "#123456";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator(".ops-shell").waitFor();
  await page.getByRole("button", { name: /Fechar painel/ }).click();
  await page.locator(".drawer").waitFor({ state: "detached" });
  await page.getByRole("tab", { name: /Sintética/ }).click();
  const showSubitems = page.locator("#showSubitems");
  if (!(await showSubitems.isChecked())) await showSubitems.check();
  const childRow = page.locator('tr[data-depth="1"]').first();
  await childRow.waitFor();
  assert.equal(await childRow.evaluate((row) => getComputedStyle(row).getPropertyValue("--row-fill").trim()), "#123456");

  await page.getByRole("button", { name: /Colunas/ }).click();
  const weightToggle = page.locator('[data-column-toggle="weight"]');
  await weightToggle.uncheck();
  const weightHeader = page.locator('th[data-column-key="weight"]');
  assert.equal(await weightHeader.evaluate((header) => header.classList.contains("column-hidden")), true);
  assert.equal(await weightHeader.locator(".column-resize-handle").count(), 1);
  await weightToggle.check();
  const visibleWeightHeader = page.locator('th[data-column-key="weight"]');
  await visibleWeightHeader.scrollIntoViewIfNeeded();
  const widthBefore = await visibleWeightHeader.evaluate((header) => header.getBoundingClientRect().width);
  const handleBox = await visibleWeightHeader.locator(".column-resize-handle").boundingBox();
  assert.ok(handleBox);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 24, handleBox.y + handleBox.height / 2);
  await page.mouse.up();
  const widthAfter = await visibleWeightHeader.evaluate((header) => header.getBoundingClientRect().width);
  assert.ok(widthAfter >= widthBefore + 10, `column width did not increase: ${widthBefore} -> ${widthAfter}`);
  await visibleWeightHeader.locator(".column-resize-handle").focus();
  await page.keyboard.press("ArrowRight");
  const widthAfterKeyboard = await visibleWeightHeader.evaluate((header) => header.getBoundingClientRect().width);
  assert.ok(widthAfterKeyboard > widthAfter, `keyboard column resize did not increase width: ${widthAfter} -> ${widthAfterKeyboard}`);

  await page.locator('button[data-select="item_adm"]').first().click();
  await page.locator('[data-action="new-subitem"]').click();
  await page.locator("#createItemForm").waitFor();
  assert.equal(await page.locator('#createItemForm [name="plannedStartAt"]').count(), 0);
  assert.equal(await page.locator('#createItemForm [name="plannedDurationDays"]').inputValue(), "");
  await page.getByRole("button", { name: /Fechar painel/ }).click();
  await page.locator(".drawer").waitFor({ state: "detached" });

  // P0 regression: subitem preview must use the parent's baseline start, not today.
  await page.locator(`button[data-select="${crossViewItem.id}"]`).first().click();
  await page.locator('[data-action="new-subitem"]').click();
  await page.locator("#createItemForm").waitFor();
  const expectedSubitemFinish = await page.evaluate((id) => {
    const parent = getItem(id);
    return formatDate(datePlusDays(parent.baselineStartAt || parent.plannedStartAt, 3));
  }, crossViewItem.id);
  await page.locator('#createItemForm [name="plannedDurationDays"]').fill("3");
  const previewText = await page.locator("#schedulePreview").textContent();
  assert.ok(previewText.includes(expectedSubitemFinish), `subitem preview ignored parent baseline start: expected ${expectedSubitemFinish}, got ${previewText}`);
  await page.getByRole("button", { name: /Fechar painel/ }).click();
  await page.locator(".drawer").waitFor({ state: "detached" });

  assert.equal(errors.length, 0, errors.join("\n"));

  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".ops-shell").isVisible(), true, `app shell not visible at ${viewport.width}px`);
    assert.equal(await page.locator("#workspaceView").isVisible(), true, `workspace not visible at ${viewport.width}px`);
    assert.equal(await page.locator(".drawer:visible").count(), 0, `unexpected visible drawer at ${viewport.width}px`);
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    assert.ok(documentWidth <= viewportWidth + 2, `page-level horizontal overflow at ${viewport.width}px: ${documentWidth} > ${viewportWidth}`);
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("PRD3 browser smoke passed: navigation, Gantt, graph dates, row color setting, mouse/keyboard resizing, and 1920/1366/1024/768/390px viewports.");
} finally {
  await browser.close();
}
