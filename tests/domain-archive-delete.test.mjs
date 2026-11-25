import assert from "node:assert/strict";
import test from "node:test";

async function loadOperations() {
  return import("../src/domain-archive-delete.mjs");
}

function fixture(overrides = {}) {
  const current = { id: "manager", name: "Manager", organizationId: "org_other" };
  const state = {
    currentUserId: current.id,
    users: [current], organizations: [{ id: "org_a", name: "Target" }, { id: "org_other", name: "Other" }],
    sectors: [{ id: "sector_a", organizationId: "org_a", name: "Sector A" }],
    items: [], relations: [], events: [], registryEvents: [], attachments: [],
    archivedItems: [], archivedRelations: [], archivedUsers: [], archivedSectors: [],
    archivedOrganizations: [], archivedAttachments: [], graphPositions: { board: {} },
    filters: { owner: "all" },
  };
  let nextId = 0;
  const calls = [];
  const opsPromise = loadOperations().then(({ createArchiveDeleteOperations }) => createArchiveDeleteOperations({
    state,
    currentUser: () => state.users.find((user) => user.id === state.currentUserId) || null,
    id: (prefix) => `${prefix}_${++nextId}`,
    nowIso: () => "2026-01-02T12:00:00.000Z",
    canEditItem: () => true,
    canRemoveItem: () => true,
    canManageUsers: () => true,
    canManageOrganization: () => true,
    createEvent: (...args) => { calls.push(["event", ...args]); state.events.push({ itemId: args[0], eventType: args[1] }); },
    registryEvent: (...args) => calls.push(["registry", ...args]),
    itemTreeIds: (roots) => {
      const ids = new Set(roots);
      for (let changed = true; changed;) {
        changed = false;
        for (const item of state.items) if (ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); changed = true; }
      }
      return ids;
    },
    syncParentSummary: (...args) => calls.push(["summary", ...args]),
    recalculatePlannedDates: () => calls.push(["schedule"]),
    syncContainsRelations: (itemId) => calls.push(["contains", itemId]),
    archiveRecord: (collection, record) => { state[collection] ||= []; state[collection].push({ ...record, removedAt: "2026-01-02T12:00:00.000Z", removedBy: state.currentUserId }); },
    ...overrides,
  }));
  return { state, calls, opsPromise };
}

test("archiving an item archives its full subtree and records each transition", async () => {
  const { state, calls, opsPromise } = fixture();
  state.items.push({ id: "root", parentId: "", archivedAt: "" }, { id: "child", parentId: "root", archivedAt: "" });
  const { archiveItem } = await opsPromise;

  assert.equal(archiveItem("root"), 2);
  assert.ok(state.items.every((item) => item.archivedAt === "2026-01-02T12:00:00.000Z" && item.archivedBy === "manager"));
  assert.equal(calls.filter(([kind]) => kind === "event").length, 2);
});

test("restoring an archived root restores only its archived descendants and recalculates dates", async () => {
  const { state, calls, opsPromise } = fixture();
  state.items.push(
    { id: "root", parentId: "", archivedAt: "2026-01-01", archivedBy: "manager" },
    { id: "archived_child", parentId: "root", archivedAt: "2026-01-01", archivedBy: "manager" },
    { id: "active_child", parentId: "root", archivedAt: "" },
  );
  const { restoreArchivedItem } = await opsPromise;

  assert.equal(restoreArchivedItem("root"), 2);
  assert.equal(state.items.find((item) => item.id === "root").archivedAt, "");
  assert.equal(state.items.find((item) => item.id === "archived_child").archivedAt, "");
  assert.equal(state.items.find((item) => item.id === "active_child").archivedAt, "");
  assert.ok(calls.some(([kind]) => kind === "schedule"));
});

test("removing a parent can preserve children while archiving relations and attachments", async () => {
  const { state, opsPromise } = fixture();
  state.items.push({ id: "root", parentId: "", title: "Root" }, { id: "child", parentId: "root", title: "Child" });
  state.relations.push({ id: "rel", sourceId: "root", targetId: "other", relationType: "TI" });
  state.items.push({ id: "other", parentId: "", title: "Other" });
  state.attachments.push({ id: "file", itemId: "root" });
  const { removeItem } = await opsPromise;

  assert.throws(() => removeItem("root"), /subitens/i);
  const result = removeItem("root", { keepChildren: true });
  assert.equal(result.items, 1);
  assert.equal(state.items.find((item) => item.id === "child").parentId, "");
  assert.equal(state.items.some((item) => item.id === "root"), false);
  assert.equal(state.archivedItems[0].id, "root");
  assert.equal(state.archivedRelations[0].id, "rel");
  assert.equal(state.attachments.length, 0);
  assert.equal(state.archivedAttachments[0].id, "file");
});

test("removing a user reassigns owned items and archives the identity", async () => {
  const { state, opsPromise } = fixture();
  const owner = { id: "owner", name: "Owner", organizationId: "org_a", disabled: false };
  const replacement = { id: "replacement", name: "Replacement", organizationId: "org_a", disabled: false };
  state.users.push(owner, replacement);
  state.items.push({ id: "task", parentId: "", ownerId: owner.id });
  const { removeUser } = await opsPromise;

  assert.deepEqual(removeUser(owner.id, { replacementId: replacement.id }), { users: 1, reassigned: 1 });
  assert.equal(state.items[0].ownerId, replacement.id);
  assert.equal(state.users.some((user) => user.id === owner.id), false);
  assert.equal(state.archivedUsers[0].id, owner.id);
});

test("removing a sector requires a same-organization replacement when it has users", async () => {
  const { state, opsPromise } = fixture();
  state.sectors.push({ id: "sector_b", organizationId: "org_a", name: "Sector B" });
  state.users.push({ id: "worker", name: "Worker", organizationId: "org_a", sectorId: "sector_a" });
  const { removeSector } = await opsPromise;

  assert.throws(() => removeSector("sector_a"), /outro setor/i);
  const result = removeSector("sector_a", { replacementId: "sector_b" });
  assert.equal(result.users, 1);
  assert.equal(state.users.find((user) => user.id === "worker").sectorId, "sector_b");
  assert.equal(state.archivedSectors[0].id, "sector_a");
});

test("removing an organization removes its records while preserving other organizations", async () => {
  const { state, opsPromise } = fixture();
  state.sectors.push({ id: "sector_other", organizationId: "org_other", name: "Other Sector" });
  state.items.push({ id: "target_task", parentId: "", organizationId: "org_a", ownerId: "worker" });
  state.items.push({ id: "other_task", parentId: "", organizationId: "org_other", ownerId: "manager" });
  state.users.push({ id: "worker", name: "Worker", organizationId: "org_a", sectorId: "sector_a" });
  const { removeOrganization } = await opsPromise;

  const result = removeOrganization("org_a");
  assert.equal(result.organizations, 1);
  assert.equal(state.organizations.some((org) => org.id === "org_a"), false);
  assert.equal(state.sectors.some((sector) => sector.id === "sector_a"), false);
  assert.equal(state.users.some((user) => user.id === "worker"), false);
  assert.equal(state.items.some((item) => item.id === "target_task"), false);
  assert.equal(state.items.some((item) => item.id === "other_task"), true);
});

test("cascade deletion is denied when any descendant lacks permission, before mutation", async () => {
  const { state, opsPromise } = fixture({
    canRemoveItem: (_user, item) => !item || item.id !== "child",
  });
  state.items.push({ id: "root", parentId: "", title: "Root" }, { id: "child", parentId: "root", title: "Child" });
  const before = structuredClone(state);
  const { removeItem } = await opsPromise;

  assert.throws(() => removeItem("root", { cascade: true }), /GPO/i);
  assert.deepEqual(state, before);
});

test("deletion removes graph positions for deleted items and preserves external positions", async () => {
  const { state, opsPromise } = fixture();
  state.items.push(
    { id: "root", parentId: "", title: "Root" },
    { id: "child", parentId: "root", title: "Child" },
    { id: "external", parentId: "", title: "External" },
  );
  state.graphPositions.board = {
    root: { x: 1, y: 2 },
    child: { x: 3, y: 4 },
    external: { x: 5, y: 6 },
  };
  const { removeItem } = await opsPromise;

  removeItem("root", { cascade: true });

  assert.equal(state.graphPositions.board.root, undefined);
  assert.equal(state.graphPositions.board.child, undefined);
  assert.deepEqual(state.graphPositions.board.external, { x: 5, y: 6 });
});

test("GPO denial on item, user, sector, and organization deletion leaves state unchanged", async () => {
  const { state, opsPromise } = fixture({
    canRemoveItem: () => false,
    canManageUsers: () => false,
    canManageOrganization: () => false,
  });
  state.users.push({ id: "worker", name: "Worker", organizationId: "org_a", sectorId: "sector_a" });
  state.items.push({ id: "task", parentId: "", organizationId: "org_a", sectorId: "sector_a" });
  const before = structuredClone(state);
  const { removeItem, removeUser, removeSector, removeOrganization } = await opsPromise;

  assert.throws(() => removeItem("task", { cascade: true }), /GPO/i);
  assert.deepEqual(state, before);
  assert.throws(() => removeUser("worker"), /GPO/i);
  assert.deepEqual(state, before);
  assert.throws(() => removeSector("sector_a", { replacementId: "sector_b" }), /GPO/i);
  assert.deepEqual(state, before);
  assert.throws(() => removeOrganization("org_a"), /GPO/i);
  assert.deepEqual(state, before);
});
