import assert from "node:assert/strict";
import test from "node:test";
import { createGpoOperations } from "../src/domain-gpo-operations.mjs";
import { evaluatePermission } from "../src/domain.mjs";

function fixture({ canManageGpo = () => true, canViewItem = () => true } = {}) {
  const actor = { id: "user_a", name: "Ana", organizationId: "org_a", sectorId: "sector_a" };
  const state = {
    currentUserId: actor.id,
    users: [actor, { id: "user_b", name: "Bia", organizationId: "org_a", sectorId: "sector_b" }],
    organizations: [{ id: "org_a", name: "Empresa A" }],
    sectors: [{ id: "sector_a", name: "Setor A" }, { id: "sector_b", name: "Setor B" }],
    items: [
      { id: "task_a", title: "Fundação", description: "Concreto", status: "ready", type: "task", ownerId: "user_a", organizationId: "org_a", sectorId: "sector_a", state: "PB", createdBy: actor.id },
      { id: "task_b", title: "Cobertura", description: "Telhado", status: "done", type: "task", ownerId: "user_b", organizationId: "org_a", sectorId: "sector_b", state: "PB", createdBy: "user_b" },
      { id: "archived", title: "Antigo", archivedAt: "2026-01-01", status: "ready", type: "task" },
    ],
    permissionRules: [], permissionProfiles: [], registryEvents: [],
    filters: { query: "", status: "all", indicator: "all", type: "all", owner: "all", organization: "all", sector: "all", state: "all" },
  };
  let sequence = 0;
  const calls = [];
  const api = createGpoOperations({
    state, currentUser: () => actor, canManageGpo, canViewItem,
    canEditItem: () => true,
    evaluatePermission,
    operationLabels: { view_item: "Visualizar", edit_item: "Editar", manage_gpo: "Configurar GPO", manage_organization: "Administrar cadastros" },
    id: (prefix) => `${prefix}_${++sequence}`,
    nowIso: () => "2026-01-02T12:00:00.000Z",
    registryEvent: (...args) => calls.push(args),
    itemById: (id) => state.items.find((item) => item.id === id),
    isBlocked: (item) => item.status === "blocked",
    isOverdue: (item) => item.dueAt < "2026-01-02",
    isAtRisk: () => false,
    orgName: (id) => state.organizations.find((item) => item.id === id)?.name || "-",
    sectorName: (id) => state.sectors.find((item) => item.id === id)?.name || "-",
    userName: (id) => state.users.find((item) => item.id === id)?.name || "Sem responsável",
    today: () => "2026-01-02",
  });
  return { actor, state, calls, api };
}

test("creating a permission rule validates scope and records registry history", () => {
  const { state, calls, api } = fixture();
  const rule = api.createPermissionRule({
    subjectType: "user", subjectId: "user_b", operation: "edit_item",
    scopeType: "organization", scopeId: "org_a", effect: "allow",
  });

  assert.equal(rule.id, "gpo_1");
  assert.equal(rule.createdBy, "user_a");
  assert.equal(state.permissionRules[0], rule);
  assert.equal(calls[0][0], "permission");
  assert.throws(() => api.createPermissionRule({ ...rule, id: undefined }), /j[aá] existe/i);
});

test("permission rules require GPO authority and reject unsafe management scopes", () => {
  const denied = fixture({ canManageGpo: () => false });
  assert.throws(() => denied.api.createPermissionRule({}), /GPO/i);
  const { api } = fixture();
  assert.throws(() => api.createPermissionRule({
    subjectType: "user", subjectId: "user_b", operation: "manage_gpo",
    scopeType: "organization", scopeId: "org_a", effect: "allow",
  }), /global/i);
});

test("removing a permission rule requires GPO authority and emits history", () => {
  const { state, calls, api } = fixture();
  state.permissionRules.push({ id: "rule_a", operation: "edit_item" });

  api.removePermissionRule("rule_a");

  assert.deepEqual(state.permissionRules, []);
  assert.equal(calls[0][0], "permission");
  assert.equal(calls[0][1].id, "rule_a");
});

test("visibleItems applies permission, archive, filters, and text query", () => {
  const { state, api } = fixture({ canViewItem: (_user, item) => item.id !== "task_b" });

  assert.deepEqual(api.visibleItems().map((item) => item.id), ["task_a"]);
  state.filters.query = "concreto";
  assert.deepEqual(api.visibleItems().map((item) => item.id), ["task_a"]);
  state.filters.query = "cobertura";
  assert.deepEqual(api.visibleItems(), []);
  state.filters.query = "";
  state.filters.sector = "sector_b";
  assert.deepEqual(api.visibleItems(), []);
});

test("gpoDecision returns null without a rule and applies the source scope-tie deny rule", () => {
  const { state, actor, api } = fixture();
  const item = state.items[0];
  assert.equal(api.gpoDecision(actor, "edit_item", item), null);
  actor.profileId = "profile_a";
  state.permissionProfiles.push({ id: "profile_a", inactive: false });
  state.permissionRules.push(
    { id: "user_allow", subjectType: "user", subjectId: actor.id, operation: "edit_item", scopeType: "item", scopeId: item.id, effect: "allow" },
    { id: "profile_deny", subjectType: "profile", subjectId: actor.profileId, operation: "edit_item", scopeType: "item", scopeId: item.id, effect: "deny" },
  );

  assert.equal(api.gpoDecision(actor, "edit_item", item), false);
});
