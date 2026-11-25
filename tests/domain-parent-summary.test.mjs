import assert from "node:assert/strict";
import test from "node:test";

async function loadParentSummary() {
  return import("../src/domain-parent-summary.mjs");
}

async function fixture(items) {
  const state = { items, events: [] };
  const calls = [];
  const { createParentSummary } = await loadParentSummary();
  const operations = createParentSummary({
    state,
    createEvent: (...args) => {
      calls.push(args);
      state.events.push(args);
    },
    nowIso: () => "2026-01-10T12:00:00.000Z",
    completeStatus: (status) => status === "done",
    inclusiveDurationDays: (start, finish) => Math.round((Date.parse(`${finish}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1,
  });
  return { state, calls, operations };
}

test("parent summary uses weighted leaf progress and spans active child dates", async () => {
  const { state, calls, operations } = await fixture([
    { id: "parent", parentId: "", status: "backlog", progressPercent: 0, weight: 1 },
    { id: "a", parentId: "parent", status: "in_progress", progressPercent: 50, weight: 1, plannedStartAt: "2026-01-03", dueAt: "2026-01-05", baselineStartAt: "2026-01-03", baselineDueAt: "2026-01-05" },
    { id: "b", parentId: "parent", status: "done", progressPercent: 100, weight: 3, plannedStartAt: "2026-01-01", dueAt: "2026-01-07", baselineStartAt: "2026-01-01", baselineDueAt: "2026-01-07", completedAt: "2026-01-08T00:00:00.000Z" },
  ]);

  operations.syncParentSummary("parent", "2026-01-09T10:00:00.000Z");

  const parent = state.items[0];
  assert.equal(parent.status, "in_progress");
  assert.equal(parent.progressPercent, 88);
  assert.equal(parent.plannedStartAt, "2026-01-01");
  assert.equal(parent.dueAt, "2026-01-07");
  assert.equal(parent.plannedDurationDays, 7);
  assert.equal(parent.baselineStartAt, "2026-01-01");
  assert.equal(parent.baselineDueAt, "2026-01-07");
  assert.equal(parent.updatedAt, "2026-01-10T12:00:00.000Z");
  assert.equal(parent.lastChangeAt, "2026-01-09T10:00:00.000Z");
  assert.equal(parent.completedAt, undefined);
  assert.deepEqual(calls.map(([, eventType]) => eventType), ["status_changed", "progress_changed", "duration_changed", "start_changed", "due_changed"]);
});

test("summary updates recursively through ancestors and captures completion time", async () => {
  const { state, calls, operations } = await fixture([
    { id: "root", parentId: "", status: "backlog", progressPercent: 0 },
    { id: "parent", parentId: "root", status: "backlog", progressPercent: 0 },
    { id: "leaf", parentId: "parent", status: "done", progressPercent: 100, weight: 1, plannedStartAt: "2026-01-01", dueAt: "2026-01-02", completedAt: "2026-01-04T00:00:00.000Z" },
  ]);

  operations.syncParentSummary("parent", "2026-01-09T10:00:00.000Z");

  assert.equal(state.items.find((item) => item.id === "parent").status, "done");
  assert.equal(state.items.find((item) => item.id === "parent").completedAt, "2026-01-04T00:00:00.000Z");
  assert.equal(state.items.find((item) => item.id === "root").status, "done");
  assert.equal(state.items.find((item) => item.id === "root").updatedAt, "2026-01-10T12:00:00.000Z");
  assert.deepEqual([...new Set(calls.map(([itemId]) => itemId))].sort(), ["parent", "root"]);
});
