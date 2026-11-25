import assert from "node:assert/strict";
import test from "node:test";

async function loadDomain() {
  try {
    return await import("../src/domain.mjs");
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") {
      assert.fail("the authored domain module is not available");
    }
    throw error;
  }
}

function permissionState() {
  const item = {
    id: "task_a",
    type: "task",
    parentId: "",
    state: "PE",
    organizationId: "org_a",
    sectorId: "sector_a",
    createdBy: "actor_a",
  };
  return {
    items: [item],
    relations: [],
    users: [{ id: "actor_a", organizationId: "org_a", sectorId: "sector_a" }],
    permissionProfiles: [],
    permissionRules: [
      {
        id: "rule_view_task_a",
        subjectType: "user",
        subjectId: "actor_a",
        operation: "view_item",
        scopeType: "item",
        scopeId: "task_a",
        effect: "allow",
      },
    ],
  };
}

test("the source domain creates an empty workspace without browser assets", async () => {
  const { createDomain } = await loadDomain();
  const domain = createDomain(null, "actor_a");

  assert.ok(Array.isArray(domain.state.items));
  assert.ok(Array.isArray(domain.state.relations));
  assert.equal(domain.state.items.length, 0);
  assert.equal(domain.state.currentUserId, "actor_a");
  assert.equal(typeof domain.functions.emptyState, "function");
  assert.equal(domain.functions.emptyState().items.length, 0);
});

test("domain authorization reports allowed and denied decisions to the caller", async () => {
  const { createDomain } = await loadDomain();
  const decisions = [];
  const domain = createDomain(permissionState(), "actor_a", (decision) => decisions.push(decision));

  const item = domain.state.items[0];
  assert.equal(domain.authorize("view_item", item).allowed, true);
  assert.throws(
    () => domain.authorize("delete_item", item),
    (error) => error.status === 403 && error.code === "FORBIDDEN",
  );
  assert.deepEqual(decisions.map((decision) => [decision.operation, decision.allowed]), [
    ["view_item", true],
    ["delete_item", false],
  ]);
});

test("the source schedule analyzer calculates a critical path and rejects cycles", async () => {
  const { analyzeSchedule } = await loadDomain();
  const items = [
    { id: "a", parentId: "", plannedStartAt: "2026-01-01", dueAt: "2026-01-05", plannedDurationDays: 4 },
    { id: "b", parentId: "", plannedStartAt: "2026-01-01", dueAt: "2026-01-03", plannedDurationDays: 2 },
    { id: "c", parentId: "", plannedStartAt: "2026-01-01", dueAt: "2026-01-04", plannedDurationDays: 3 },
  ];
  const options = { today: "2026-01-01" };
  const analysis = analyzeSchedule(
    items,
    [{ id: "ab", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 1 }],
    options,
  );

  assert.equal(analysis.valid, true);
  assert.equal(analysis.reliable, true);
  assert.equal(analysis.durationDays, 7);
  assert.equal(analysis.rows.find((row) => row.item.id === "b").startOffset, 5);
  assert.equal(analysis.rows.find((row) => row.item.id === "a").critical, true);
  assert.equal(analysis.rows.find((row) => row.item.id === "b").critical, true);
  assert.equal(analysis.rows.find((row) => row.item.id === "c").critical, false);

  const cycle = analyzeSchedule(items, [
    { id: "ab", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 0 },
    { id: "ba", sourceId: "b", targetId: "a", relationType: "TI", lagDays: 0 },
  ], options);
  assert.equal(cycle.valid, false);
  assert.match(cycle.message, /ciclo/i);
});

test("the source validates state and rejects duplicate entity identifiers", async () => {
  const { emptyState, validateState } = await loadDomain();
  const state = emptyState();
  state.organizations = [{ id: "org_1" }, { id: "org_1" }];

  assert.throws(() => validateState(state), { code: "DUPLICATE_ID", status: 422 });
});

test("the source rejects legacy temporal relation types outside the persisted TI contract", async () => {
  const { emptyState, validateState } = await loadDomain();
  for (const relationType of ["II", "TT", "IF"]) {
    const state = emptyState();
    state.relations = [{ id: "relation_1", sourceId: "a", targetId: "b", relationType, lagDays: 0 }];
    assert.throws(() => validateState(state), { code: "RELATION_TYPE", status: 422 }, relationType);
  }
});

test("createDomain exposes schedule operations through its public call API", async () => {
  const { createDomain } = await loadDomain();
  const state = {
    items: [{ id: "a", parentId: "", status: "ready", plannedStartAt: "2026-01-01", plannedDurationDays: 1 }],
    relations: [], users: [], events: [], organizations: [], sectors: [],
  };
  const domain = createDomain(state, "actor_a");

  assert.equal(domain.functions.scheduleAnalysis().valid, true);
  assert.equal(domain.call("recalculatePlannedDates").valid, true);
  assert.throws(() => domain.call("unknownOperation"), { code: "UNKNOWN_COMMAND", status: 422 });
});

test("createDomain exposes source event and tree helpers against its own state", async () => {
  const { createDomain, emptyState } = await loadDomain();
  const initial = emptyState();
  initial.users = [{ id: "actor_a", name: "Ana" }];
  initial.items = [{ id: "root", parentId: "" }, { id: "child", parentId: "root" }];
  const domain = createDomain(initial, "actor_a");

  assert.deepEqual([...domain.functions.itemTreeIds(new Set(["root"]))], ["root", "child"]);
  const event = domain.functions.createEvent("child", "created", "", "ready", "");
  assert.equal(domain.state.events.at(-1), event);
  assert.equal(event.userId, "actor_a");
});

test("createDomain exposes GPO decisions and filters items through source policy", async () => {
  const { createDomain, emptyState } = await loadDomain();
  const initial = emptyState();
  initial.users = [{ id: "actor_a", name: "Ana", organizationId: "org_a", sectorId: "sector_a" }];
  initial.organizations = [{ id: "org_a", name: "Empresa A" }];
  initial.sectors = [{ id: "sector_a", name: "Setor A", organizationId: "org_a" }];
  initial.items = [{ id: "task_a", title: "Tarefa", type: "task", status: "ready", ownerId: "actor_a", organizationId: "org_a", sectorId: "sector_a", state: "PB" }];
  initial.items.push({ id: "task_late", title: "Atrasada", type: "task", status: "ready", ownerId: "actor_a", organizationId: "org_a", sectorId: "sector_a", state: "PB", dueAt: "2020-01-01" });
  initial.permissionRules = [
    { id: "rule_view", subjectType: "user", subjectId: "actor_a", operation: "view_item", scopeType: "item", scopeId: "task_a", effect: "allow" },
    { id: "rule_view_late", subjectType: "user", subjectId: "actor_a", operation: "view_item", scopeType: "item", scopeId: "task_late", effect: "allow" },
  ];
  const domain = createDomain(initial, "actor_a");
  const actor = domain.state.users[0];

  assert.equal(domain.functions.gpoDecision(actor, "view_item", domain.state.items[0]), true);
  assert.equal(domain.functions.gpoDecision(actor, "edit_item", domain.state.items[0]), false);
  assert.deepEqual(domain.functions.visibleItems().map((item) => item.id), ["task_a", "task_late"]);
  domain.state.filters.indicator = "overdue";
  assert.deepEqual(domain.functions.visibleItems().map((item) => item.id), ["task_late"]);
});

test("createDomain preserves forced item IDs and deferred schedule validation", async () => {
  const { createDomain, emptyState } = await loadDomain();
  const initial = emptyState();
  initial.items = [
    { id: "a", parentId: "", status: "ready", plannedStartAt: "2026-01-01", plannedDurationDays: 1 },
    { id: "b", parentId: "", status: "ready", plannedStartAt: "2026-01-01", plannedDurationDays: 1 },
  ];
  initial.relations = [
    { id: "ab", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 0 },
    { id: "ba", sourceId: "b", targetId: "a", relationType: "TI", lagDays: 0 },
  ];
  const domain = createDomain(initial, "actor_a");

  domain.forceItemId("service_item_id");
  domain.deferSchedule(true);
  assert.deepEqual(domain.call("recalculatePlannedDates"), { valid: true });
});

test("createDomain composes parent summary and records derived changes", async () => {
  const { createDomain, emptyState } = await loadDomain();
  const initial = emptyState();
  initial.items = [
    { id: "parent", parentId: "", status: "backlog", progressPercent: 0 },
    { id: "child", parentId: "parent", status: "done", progressPercent: 100, plannedStartAt: "2026-01-01", dueAt: "2026-01-02", weight: 1, completedAt: "2026-01-03T00:00:00.000Z" },
  ];
  const domain = createDomain(initial, "actor_a");

  domain.call("syncParentSummary", "parent", "2026-01-04T00:00:00.000Z");
  assert.equal(domain.state.items[0].status, "done");
  assert.equal(domain.state.items[0].progressPercent, 100);
  assert.ok(domain.state.events.some((event) => event.itemId === "parent" && event.eventType === "status_changed"));
});

test("createDomain exposes archive and removal operations with GPO checks", async () => {
  const { createDomain, emptyState } = await loadDomain();
  const initial = emptyState();
  initial.users = [{ id: "actor_a", name: "Ana" }];
  initial.items = [{ id: "task_a", title: "Tarefa", parentId: "", status: "ready" }];
  initial.permissionRules = [
    { id: "edit", subjectType: "user", subjectId: "actor_a", operation: "edit_item", scopeType: "global", scopeId: "", effect: "allow" },
    { id: "delete", subjectType: "user", subjectId: "actor_a", operation: "delete_item", scopeType: "global", scopeId: "", effect: "allow" },
  ];
  const domain = createDomain(initial, "actor_a");

  assert.equal(domain.call("archiveItem", "task_a"), 1);
  assert.ok(domain.state.items[0].archivedAt);
  assert.equal(domain.call("restoreArchivedItem", "task_a"), 1);
  assert.equal(domain.state.items[0].archivedAt, "");
  assert.equal(domain.call("removeItem", "task_a").items, 1);
  assert.deepEqual(domain.state.items, []);
});

test("createDomain creates and updates items with forced IDs and granular GPO", async () => {
  const { createDomain, emptyState } = await loadDomain();
  const initial = emptyState();
  initial.users = [{ id: "actor_a", name: "Ana", organizationId: "org_a", sectorId: "sector_a", state: "PB" }];
  initial.organizations = [{ id: "org_a", name: "Empresa A", state: "PB" }];
  initial.sectors = [{ id: "sector_a", name: "Setor A", organizationId: "org_a" }];
  initial.permissionRules = [
    { id: "create", subjectType: "user", subjectId: "actor_a", operation: "create_item", scopeType: "global", scopeId: "", effect: "allow" },
    { id: "edit", subjectType: "user", subjectId: "actor_a", operation: "edit_item", scopeType: "global", scopeId: "", effect: "allow" },
  ];
  const domain = createDomain(initial, "actor_a");
  domain.forceItemId("new_item");

  const item = domain.call("createItem", {
    type: "task", title: "Tarefa nova", ownerId: "actor_a", organizationId: "org_a",
    sectorId: "sector_a", state: "PB", plannedDurationDays: 0,
  });
  assert.equal(item.id, "new_item");
  assert.equal(item.createdBy, "actor_a");
  assert.equal(item.plannedDurationDays, 0);
  assert.equal(domain.call("updateItem", item.id, { ...item, title: "Tarefa revisada" }), true);
  assert.equal(domain.state.items[0].title, "Tarefa revisada");
});

test("createDomain routes approval lifecycle through source policy and history", async () => {
  const { createDomain, emptyState } = await loadDomain();
  const initial = emptyState();
  initial.users = [{ id: "actor_a", name: "Ana", organizationId: "org_a", sectorId: "sector_a", state: "PB" }];
  initial.items = [{ id: "approval_a", title: "Aprovar", type: "approval", status: "backlog", ownerId: "actor_a", approvalReviewerId: "actor_a", organizationId: "org_a", sectorId: "sector_a", state: "PB", parentId: "", plannedStartAt: "2026-01-01" }];
  initial.permissionRules = ["view_item", "create_approval", "decide_approval"].map((operation) => ({
    id: operation, subjectType: "user", subjectId: "actor_a", operation, scopeType: "global", scopeId: "", effect: "allow",
  }));
  const domain = createDomain(initial, "actor_a");

  const submission = domain.call("submitApprovalForReview", "approval_a", "Enviar");
  assert.equal(submission.outcome, "under_review");
  const decision = domain.call("decideApproval", "approval_a", "approved", "Aprovado");
  assert.equal(decision.outcome, "approved");
  assert.equal(domain.state.items[0].status, "done");
  assert.equal(domain.state.approvalDecisions.length, 2);
});
