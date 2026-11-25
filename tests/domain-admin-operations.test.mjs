import assert from "node:assert/strict";
import test from "node:test";

async function loadOperations() {
  return import("../src/domain-admin-operations.mjs");
}

function fixture() {
  const state = {
    currentUserId: "user_a",
    users: [{ id: "user_a", name: "Ana", organizationId: "org_a", sectorId: "sector_a", state: "PE" }],
    items: [
      { id: "root", parentId: "" },
      { id: "child", parentId: "root" },
      { id: "grandchild", parentId: "child" },
      { id: "other", parentId: "" },
    ],
    events: [],
    registryEvents: [],
  };
  let next = 0;
  const operations = loadOperations().then(({ createAdminOperations }) => createAdminOperations({
    state,
    currentUser: () => state.users.find((user) => user.id === state.currentUserId),
    id: (prefix) => `${prefix}_${++next}`,
    nowIso: () => "2026-01-02T12:34:56.000Z",
  }));
  return { state, operations };
}

test("itemTreeIds returns the root and every descendant exactly once", async () => {
  const { operations } = fixture();
  const { itemTreeIds } = await operations;

  assert.deepEqual([...itemTreeIds(new Set(["root", "child"]))].sort(), ["child", "grandchild", "root"]);
});

test("createEvent snapshots the actor and item context while preserving effective time", async () => {
  const { state, operations } = fixture();
  const { createEvent } = await operations;

  const event = createEvent("child", "status_changed", "ready", "done", "Concluído", "2026-01-01T10:00:00.000Z");

  assert.equal(state.events[0], event);
  assert.deepEqual(
    [event.itemId, event.eventType, event.fromValue, event.toValue, event.comment, event.userId, event.organizationIdSnapshot, event.sectorIdSnapshot, event.stateSnapshot, event.createdAt, event.effectiveAt],
    ["child", "status_changed", "ready", "done", "Concluído", "user_a", "org_a", "sector_a", "PE", "2026-01-02T12:34:56.000Z", "2026-01-01T10:00:00.000Z"],
  );
});

test("registryEvent records the entity snapshot and actor", async () => {
  const { state, operations } = fixture();
  const { registryEvent } = await operations;
  const entity = { id: "sector_a", name: "Obra" };

  const event = registryEvent("sector", entity, "Setor arquivado", "archived");

  assert.equal(state.registryEvents[0], event);
  assert.equal(event.entityType, "sector");
  assert.equal(event.entityId, "sector_a");
  assert.equal(event.userId, "user_a");
  assert.equal(event.createdAt, "2026-01-02T12:34:56.000Z");
  assert.equal(event.eventType, "archived");
  assert.equal(event.name, "Obra");
  assert.equal(event.comment, "Setor arquivado");
});
