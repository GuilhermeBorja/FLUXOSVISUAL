import assert from "node:assert/strict";
import test from "node:test";

async function loadOperations() {
  return import("../src/domain-schedule-operations.mjs");
}

function scheduleState() {
  return {
    currentUserId: "actor",
    organizations: [],
    sectors: [],
    users: [{ id: "actor", name: "Actor" }],
    events: [],
    items: [
      { id: "a", status: "ready", parentId: "", plannedStartAt: "2026-01-01", dueAt: "2026-01-04", plannedDurationDays: 4 },
      { id: "b", status: "ready", parentId: "", plannedStartAt: "2026-01-01", dueAt: "2026-01-02", plannedDurationDays: 2 },
    ],
    relations: [{ id: "ab", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 1 }],
  };
}

function dependencies(state) {
  return {
    state,
    authorize: () => true,
    id: (prefix) => `${prefix}_${state.events.length + 1}`,
    nowIso: () => "2026-01-01T00:00:00.000Z",
  };
}

test("schedule analysis is exposed as a source operation and identifies critical activities", async () => {
  const { createScheduleOperations } = await loadOperations();
  const state = scheduleState();
  const { scheduleAnalysis } = createScheduleOperations(dependencies(state));

  const result = scheduleAnalysis(state.items);
  assert.equal(result.valid, true);
  assert.equal(result.durationDays, 7);
  assert.deepEqual(result.rows.filter((row) => row.critical).map((row) => row.item.id), ["a", "b"]);
});

test("planned dates follow TI constraints and a cycle leaves the state unchanged", async () => {
  const { createScheduleOperations } = await loadOperations();
  const state = scheduleState();
  const { recalculatePlannedDates } = createScheduleOperations(dependencies(state));

  assert.deepEqual(recalculatePlannedDates(), { valid: true });
  assert.equal(state.items.find((item) => item.id === "b").plannedStartAt, "2026-01-06");
  assert.equal(state.items.find((item) => item.id === "b").dueAt, "2026-01-07");

  const before = structuredClone(state.items);
  state.relations.push({ id: "ba", sourceId: "b", targetId: "a", relationType: "TI", lagDays: 0 });
  assert.equal(recalculatePlannedDates().valid, false);
  assert.deepEqual(state.items, before);
});

test("a zero-duration TI predecessor releases its successor on the same day", async () => {
  const { createScheduleOperations } = await loadOperations();
  const state = scheduleState();
  state.items = [
    { id: "milestone", status: "ready", parentId: "", plannedStartAt: "2026-01-01", dueAt: "2026-01-01", plannedDurationDays: 0 },
    { id: "successor", status: "ready", parentId: "", plannedStartAt: "2026-01-01", dueAt: "2026-01-01", plannedDurationDays: 1 },
  ];
  state.relations = [{ id: "milestone-successor", sourceId: "milestone", targetId: "successor", relationType: "TI", lagDays: 0 }];
  const { recalculatePlannedDates } = createScheduleOperations(dependencies(state));

  assert.deepEqual(recalculatePlannedDates(), { valid: true });
  assert.equal(state.items[0].dueAt, "2026-01-01");
  assert.equal(state.items[1].plannedStartAt, "2026-01-01");
});

test("TI scheduling derives inclusive duration from an existing date range", async () => {
  const { createScheduleOperations } = await loadOperations();
  const state = scheduleState();
  state.items[0].plannedDurationDays = null;
  state.items[0].dueAt = "2026-01-02";
  state.items[1].plannedDurationDays = 1;
  state.items[1].dueAt = "2026-01-01";
  state.relations[0].lagDays = 0;
  const { recalculatePlannedDates } = createScheduleOperations(dependencies(state));

  assert.deepEqual(recalculatePlannedDates(), { valid: true });
  assert.equal(state.items[1].plannedStartAt, "2026-01-03");
  assert.equal(state.items[1].dueAt, "2026-01-03");
});

test("cancelled TI predecessor does not move the successor or rewrite its baseline", async () => {
  const { createScheduleOperations } = await loadOperations();
  const state = scheduleState();
  state.items[0].status = "cancelled";
  state.items[1].plannedDurationDays = 1;
  state.items[1].dueAt = "2026-01-01";
  state.items[1].baselineStartAt = "2025-12-20";
  state.items[1].baselineDueAt = "2025-12-21";
  state.relations[0].lagDays = 0;
  const { recalculatePlannedDates } = createScheduleOperations(dependencies(state));

  assert.deepEqual(recalculatePlannedDates(), { valid: true });
  assert.equal(state.items[1].plannedStartAt, "2026-01-01");
  assert.equal(state.items[1].baselineStartAt, "2025-12-20");
  assert.equal(state.items[1].baselineDueAt, "2025-12-21");
});

test("manual blockers propagate through TI dependencies and restore prior status when cleared", async () => {
  const { createScheduleOperations } = await loadOperations();
  const state = scheduleState();
  state.items[0].status = "blocked";
  state.items[0].blockedReason = "Fornecedor";
  state.items.push({ id: "c", status: "backlog", parentId: "" });
  state.relations.push({ id: "bc", sourceId: "b", targetId: "c", relationType: "TI", lagDays: 0 });
  const { recalculateBlocking } = createScheduleOperations(dependencies(state));

  recalculateBlocking("2026-01-01T00:00:00.000Z");
  assert.equal(state.items.find((item) => item.id === "b").status, "blocked");
  assert.equal(state.items.find((item) => item.id === "c").status, "blocked");
  assert.deepEqual(state.items.find((item) => item.id === "c").inheritedBlockedFrom, ["a"]);

  state.items[0].status = "ready";
  recalculateBlocking("2026-01-02T00:00:00.000Z");
  assert.equal(state.items.find((item) => item.id === "b").status, "ready");
  assert.equal(state.items.find((item) => item.id === "c").status, "backlog");
});
