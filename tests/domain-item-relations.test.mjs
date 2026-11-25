import assert from "node:assert/strict";
import test from "node:test";
import { createItemRelationOperations } from "../src/domain-item-relations.mjs";

function fixture(overrides = {}) {
  const state = {
    items: [], relations: [], events: [], archivedRelations: [], users: [],
  };
  let sequence = 0;
  const runtime = { schedule: () => ({ valid: true }), authorize: () => true };
  const operations = createItemRelationOperations({
    state,
    actor: overrides.actor || { id: "user_a" },
    authorize: (...args) => runtime.authorize(...args),
    id: (prefix) => `${prefix}_${++sequence}`,
    nowIso: () => "2026-01-01T12:00:00.000Z",
    today: () => "2026-01-01",
    createEvent: (...args) => {
      if (runtime.createEvent) return runtime.createEvent(...args);
      const [itemId, type, fromValue, toValue, comment, effectiveAt] = args;
      state.events.push({ itemId, type, fromValue, toValue, comment, effectiveAt });
    },
    registryEvent: () => {},
    schedule: () => runtime.schedule(),
    helpers: {
      validateItemInput: () => {},
      itemDurationDays: (input) => input.plannedDurationDays ?? 0,
      inclusiveFinishDate: (start) => start,
      completeStatus: (status) => status === "done",
      syncParentSummary: () => {},
      recalculateBlocking: () => {},
      archiveRecord: (collection, record) => state[collection].push({ ...record }),
      relationTypes: ["TI", "contains"],
      ...(overrides.helpers || {}),
    },
  });
  return { state, operations, runtime };
}

test("createItem records the actor and preserves explicit zero duration", () => {
  const { state, operations } = fixture();
  const item = operations.createItem({
    title: "Prepare slab", ownerId: "user_a", plannedDurationDays: 0,
  });

  assert.equal(item.id, "item_1");
  assert.equal(item.createdBy, "user_a");
  assert.equal(item.plannedDurationDays, 0);
  assert.equal(item.plannedStartAt, "2026-01-01");
  assert.equal(state.items[0], item);
  assert.equal(state.events[0].type, "created");
});

test("createItem rolls back all writes if schedule validation fails", () => {
  const { state, operations, runtime } = fixture();
  runtime.schedule = () => ({ valid: false, message: "TI cycle" });

  assert.throws(
    () => operations.createItem({ title: "New task", ownerId: "user_a" }),
    (error) => error.status === 422 && error.code === "DOMAIN_VALIDATION" && /TI cycle/.test(error.message),
  );
  assert.deepEqual(state.items, []);
  assert.deepEqual(state.events, []);
});

test("createRelation rejects duplicate edges and restores state after invalid schedule", () => {
  const { state, operations } = fixture();
  state.items.push({ id: "a", title: "A", parentId: "", createdBy: "user_a" });
  state.items.push({ id: "b", title: "B", parentId: "", createdBy: "user_a" });
  state.relations.push({ id: "existing", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 0 });

  assert.throws(() => operations.createRelation("a", "b", "TI"), /já existe/i);
  assert.equal(state.relations.length, 1);
});

test("moveItemHierarchy rejects a parent cycle without mutating the tree", () => {
  const { state, operations } = fixture();
  state.items.push({ id: "parent", title: "Parent", parentId: "", sortOrder: 0 });
  state.items.push({ id: "child", title: "Child", parentId: "parent", sortOrder: 0 });

  assert.throws(() => operations.moveItemHierarchy("parent", "child"), /ciclo/i);
  assert.equal(state.items[0].parentId, "");
  assert.equal(state.items[1].parentId, "parent");
});

test("reorderItem keeps siblings in place and assigns stable 100-point order", () => {
  const { state, operations } = fixture();
  state.items.push(
    { id: "a", parentId: "p", sortOrder: 0 },
    { id: "b", parentId: "p", sortOrder: 100 },
    { id: "c", parentId: "p", sortOrder: 200 },
  );

  assert.equal(operations.reorderItem("c", "a"), true);
  assert.deepEqual(state.items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.id), ["c", "a", "b"]);
});

test("removeRelation archives the edge and recalculates the schedule", () => {
  const { state, operations } = fixture();
  state.items.push({ id: "a", title: "A", parentId: "" }, { id: "b", title: "B", parentId: "" });
  state.relations.push({ id: "rel_1", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 0 });

  operations.removeRelation("rel_1");
  assert.deepEqual(state.relations, []);
  assert.equal(state.archivedRelations[0].id, "rel_1");
  assert.equal(state.events[0].type, "relation_removed");
});

test("removeRelation preserves legacy behavior when schedule recomputation is invalid", () => {
  const { state, operations, runtime } = fixture();
  state.items.push({ id: "a", title: "A", parentId: "" }, { id: "b", title: "B", parentId: "" });
  state.relations.push({ id: "rel_1", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 0 });
  runtime.schedule = () => ({ valid: false, message: "legacy schedule warning" });

  assert.equal(operations.removeRelation("rel_1"), undefined);
  assert.deepEqual(state.relations, []);
  assert.equal(state.archivedRelations[0].id, "rel_1");
  assert.ok(state.events.some((event) => event.type === "relation_removed"));
});

test("createItem applies legacy blocked normalization before authorization and validation", () => {
  const { operations } = fixture({
    helpers: { normalizeLegacyBlocked: (input) => ({ ...input, blocked: true, blockedReason: "  supply  " }) },
  });
  const item = operations.createItem({ title: "Blocked", ownerId: "user_a" });

  assert.equal(item.status, "blocked");
  assert.equal(item.blockedReason, "supply");
});

test("updateItem re-derives owner context and records the changed fields", () => {
  const { state, operations } = fixture();
  state.users.push({ id: "user_b", organizationId: "org_b", sectorId: "sector_b", state: "PB" });
  state.items.push({ id: "task_a", title: "Old", type: "task", status: "backlog", ownerId: "user_a", organizationId: "org_a", sectorId: "sector_a", state: "PE", progressPercent: 0 });

  assert.equal(operations.updateItem("task_a", { title: "Updated", ownerId: "user_b" }, "2026-01-02T09:00:00.000Z"), true);
  assert.deepEqual(
    [state.items[0].title, state.items[0].organizationId, state.items[0].sectorId, state.items[0].state],
    ["Updated", "org_b", "sector_b", "PB"],
  );
  assert.deepEqual(state.events.map(({ type, fromValue, toValue, comment }) => [type, fromValue, toValue, comment]), [
    ["title_changed", "Old", "Updated", ""],
    ["owner_changed", "user_a", "user_b", ""],
    ["context_changed", "org_a", "org_b", "Empresa"],
    ["context_changed", "sector_a", "sector_b", "Setor"],
    ["context_changed", "PE", "PB", "UF"],
  ]);
});

test("updateItem validates the owner-derived context before applying the patch", () => {
  const observed = [];
  const { state, operations } = fixture({ helpers: { validateItemInput: (input) => observed.push({ ...input }) } });
  state.users.push({ id: "user_b", organizationId: "org_b", sectorId: "sector_b", state: "PB" });
  state.items.push({ id: "task_a", title: "Task", status: "backlog", ownerId: "user_a", organizationId: "org_a", sectorId: "sector_a", state: "PE" });

  operations.updateItem("task_a", { ownerId: "user_b" });
  assert.deepEqual(
    [observed[0].ownerId, observed[0].organizationId, observed[0].sectorId, observed[0].state],
    ["user_b", "org_b", "sector_b", "PB"],
  );
});

test("updateItem denies a granular permission without retaining earlier edits or events", () => {
  const { state, operations, runtime } = fixture();
  state.items.push({ id: "task_a", title: "Old", status: "backlog", ownerId: "user_a", progressPercent: 0 });
  runtime.authorize = (operation) => operation !== "change_owner";

  assert.throws(() => operations.updateItem("task_a", { title: "Changed", ownerId: "user_b" }), {
    message: "O GPO não permite esta alteração neste escopo.",
  });
  assert.equal(state.items[0].title, "Old");
  assert.deepEqual(state.events, []);
});

test("updateItem completes a task at 100 percent and records completion time", () => {
  const { state, operations } = fixture();
  state.items.push({ id: "task_a", title: "Task", type: "task", status: "in_progress", progressPercent: 80, completedAt: "", actualStartAt: "2026-01-01T08:00:00.000Z" });

  operations.updateItem("task_a", { progressPercent: 100 }, "2026-01-02T09:00:00.000Z");
  assert.equal(state.items[0].status, "done");
  assert.equal(state.items[0].progressPercent, 100);
  assert.equal(state.items[0].completedAt, "2026-01-02T09:00:00.000Z");
  assert.ok(state.events.some((event) => event.type === "completed"));
});

test("updateItem treats nullish patch values as unchanged, matching legacy behavior", () => {
  const { state, operations } = fixture();
  state.items.push({ id: "task_a", title: "Task", status: "backlog", plannedDurationDays: 5 });

  assert.equal(operations.updateItem("task_a", { title: null, plannedDurationDays: null }), false);
  assert.equal(state.items[0].title, "Task");
  assert.equal(state.items[0].plannedDurationDays, 5);
  assert.deepEqual(state.events, []);
});

test("failed relation event creation restores state and preserves prior events", () => {
  const { state, operations, runtime } = fixture();
  state.items.push({ id: "a", title: "A", parentId: "" }, { id: "b", title: "B", parentId: "" });
  const existing = { itemId: "b", type: "relation_created", comment: "older event" };
  state.events.push(existing);
  runtime.createEvent = () => { throw new Error("event storage failed"); };

  assert.throws(() => operations.createRelation("a", "b", "TI"), /event storage failed/);
  assert.deepEqual(state.relations, []);
  assert.deepEqual(state.events, [existing]);
});

test("editing a containment relation detaches its prior target", () => {
  const { state, operations } = fixture();
  state.items.push(
    { id: "old_parent", title: "Old parent", parentId: "" },
    { id: "old_child", title: "Old child", parentId: "old_parent" },
    { id: "new_parent", title: "New parent", parentId: "" },
    { id: "new_child", title: "New child", parentId: "" },
  );
  state.relations.push({ id: "contains_1", sourceId: "old_parent", targetId: "old_child", relationType: "contains", lagDays: 0, description: "" });

  operations.updateRelation("contains_1", { sourceId: "new_parent", targetId: "new_child", relationType: "contains", lagDays: 0 });
  assert.equal(state.items.find((item) => item.id === "old_child").parentId, "");
  assert.equal(state.items.find((item) => item.id === "new_child").parentId, "new_parent");
});

test("relation updates write one event per changed field with legacy values", () => {
  const { state, operations } = fixture();
  state.items.push({ id: "a", title: "A", parentId: "" }, { id: "b", title: "B", parentId: "" });
  state.relations.push({ id: "rel_1", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 0, description: "old" });

  const updated = operations.updateRelation("rel_1", {
    sourceId: "a", targetId: "b", relationType: "TI", lagDays: 2, description: "new",
  });

  assert.equal(updated.previousSourceId, "a");
  assert.equal(updated.previousTargetId, "b");
  assert.equal(updated.previousRelationType, "TI");
  assert.deepEqual(state.events.map(({ type, fromValue, toValue, comment }) => [type, fromValue, toValue, comment]), [
    ["relation_lag_changed", "0", "2", "Defasagem da relação com A."],
    ["relation_description_changed", "old", "new", "Descrição da relação com A."],
  ]);
});

test("failed move restores hierarchy, relation cleanup, and emitted events", () => {
  const { state, operations, runtime } = fixture();
  state.items.push({ id: "parent", title: "Parent", parentId: "" }, { id: "child", title: "Child", parentId: "parent" }, { id: "next", title: "Next", parentId: "" });
  state.relations.push({ id: "legacy", sourceId: "parent", targetId: "child", relationType: "contains" });
  runtime.schedule = () => ({ valid: false, message: "schedule rejected" });

  assert.throws(() => operations.moveItemHierarchy("parent", "next"), /schedule rejected/);
  assert.equal(state.items.find((item) => item.id === "parent").parentId, "");
  assert.deepEqual(state.relations.map((relation) => relation.id), ["legacy"]);
  assert.deepEqual(state.events, []);
});

test("moving a parent removes legacy contains relations throughout its subtree", () => {
  const { state, operations } = fixture();
  state.items.push(
    { id: "parent", title: "Parent", parentId: "" },
    { id: "child", title: "Child", parentId: "parent" },
    { id: "leaf", title: "Leaf", parentId: "child" },
    { id: "other", title: "Other", parentId: "" },
  );
  state.relations.push(
    { id: "legacy_child", sourceId: "parent", targetId: "child", relationType: "contains" },
    { id: "legacy_leaf", sourceId: "child", targetId: "leaf", relationType: "contains" },
  );

  assert.equal(operations.moveItemHierarchy("parent", "other"), true);
  assert.deepEqual(state.relations, []);
  assert.equal(state.items.find((item) => item.id === "child").parentId, "parent");
  assert.equal(state.items.find((item) => item.id === "leaf").parentId, "child");
});

test("createItem denies the caller before writing an item or event", () => {
  const { state, operations, runtime } = fixture();
  runtime.authorize = (operation) => operation !== "create_item";

  assert.throws(() => operations.createItem({ title: "Denied", ownerId: "user_a" }), {
    message: "Sua regra GPO não permite criar itens neste escopo.",
  });
  assert.deepEqual(state.items, []);
  assert.deepEqual(state.events, []);
});

test("createItem defaults match legacy blocked normalization and inclusive duration rules", () => {
  const { operations } = fixture({ helpers: {
    normalizeLegacyBlocked: undefined,
    itemDurationDays: undefined,
    inclusiveFinishDate: undefined,
    completeStatus: undefined,
  } });
  const blocked = operations.createItem({
    title: "Legacy blocked", ownerId: "user_a", blocked: true,
    plannedStartAt: "2026-01-01", dueAt: "2026-01-03",
  });
  const cancelled = operations.createItem({ title: "Cancelled", ownerId: "user_a", status: "cancelled" });

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.plannedDurationDays, 3);
  assert.equal(blocked.baselineDueAt, "2026-01-03");
  assert.equal(cancelled.progressPercent, 0);
  assert.equal(cancelled.completedAt, "");
});

test("createRelation denial uses the legacy error and leaves the edge list untouched", () => {
  const { state, operations, runtime } = fixture();
  state.items.push({ id: "a", title: "A", parentId: "" }, { id: "b", title: "B", parentId: "" });
  runtime.authorize = (operation) => operation !== "create_relation";

  assert.throws(() => operations.createRelation("a", "b", "TI"), {
    message: "Sem permissão para criar esta relação a partir da origem.",
  });
  assert.deepEqual(state.relations, []);
});

test("updating a relation across sources preserves the legacy retarget event trail", () => {
  const { state, operations } = fixture();
  state.items.push(
    { id: "a", title: "A", parentId: "" },
    { id: "b", title: "B", parentId: "" },
    { id: "c", title: "C", parentId: "" },
  );
  state.relations.push({ id: "rel_1", sourceId: "a", targetId: "b", relationType: "TI", lagDays: 0, description: "" });

  const updated = operations.updateRelation("rel_1", {
    sourceId: "c", targetId: "b", relationType: "TI", lagDays: 0, description: "",
  });

  assert.equal(updated.sourceId, "c");
  assert.equal(updated.previousSourceId, "a");
  assert.deepEqual(state.events.map(({ itemId, type, fromValue, toValue, comment }) => [itemId, type, fromValue, toValue, comment]), [
    ["b", "relation_retargeted", "a", "c", "Origem da relação alterada."],
  ]);
});
