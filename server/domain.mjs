import { readFileSync } from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { HttpError, assert } from "./http.mjs";

const source = readFileSync(new URL("../dist/app.js", import.meta.url), "utf8");
const script = new vm.Script(source, { filename: "fluxos-domain.js" });
const workspaceSource = readFileSync(
  new URL("../dist/workspace.js", import.meta.url),
  "utf8",
);
const scheduleSource = workspaceSource.slice(
  workspaceSource.indexOf("function scheduleAnalysis("),
  workspaceSource.indexOf("function renderGantt("),
);
const apiNames = [
  "emptyState",
  "createItem",
  "updateItem",
  "createRelation",
  "updateRelation",
  "removeRelation",
  "moveItemHierarchy",
  "reorderItem",
  "archiveItem",
  "restoreArchivedItem",
  "removeItem",
  "removeUser",
  "removeSector",
  "removeOrganization",
  "createPermissionRule",
  "removePermissionRule",
  "submitApprovalForReview",
  "decideApproval",
  "reopenApproval",
  "saveFlowTemplate",
  "applyFlowTemplate",
  "removeFlowTemplate",
  "recalculatePlannedDates",
  "recalculateBlocking",
  "syncParentSummary",
  "createEvent",
  "registryEvent",
  "visibleItems",
  "gpoDecision",
  "itemTreeIds",
  "scheduleAnalysis",
];

export const operations = [
  "view_item",
  "create_item",
  "edit_item",
  "delete_item",
  "create_relation",
  "edit_relation",
  "delete_relation",
  "change_owner",
  "change_weight",
  "change_duration",
  "change_hierarchy",
  "add_attachment",
  "delete_attachment",
  "create_approval",
  "decide_approval",
  "manage_users",
  "manage_gpo",
  "manage_organization",
];
export const editableFields = [
  "title",
  "type",
  "status",
  "ownerId",
  "organizationId",
  "sectorId",
  "state",
  "description",
  "plannedStartAt",
  "dueAt",
  "plannedDurationDays",
  "replannedDueAt",
  "targetStartAt",
  "targetDueAt",
  "weight",
  "progressPercent",
  "blockedReason",
];
export const dateFields = [
  "plannedStartAt",
  "dueAt",
  "baselineStartAt",
  "baselineDueAt",
  "targetStartAt",
  "targetDueAt",
  "replannedDueAt",
];
export const id = (prefix = "id") =>
  `${prefix}_${randomUUID().replaceAll("-", "")}`;
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const same = (a, b) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export const pick = (object, keys) =>
  Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(object, key))
      .map((key) => [key, object[key]]),
  );
export function checkId(value, label = "Identificador") {
  assert(
    typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value),
    422,
    "INVALID_ID",
    `${label} inválido.`,
  );
  return value;
}
export function dateValid(value) {
  return (
    !value ||
    (typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
      new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value)
  );
}

/** Specificity is determined by scope only. A user allow never overrides a tied profile deny. */
export function evaluatePermission(state, user, operation, item = null) {
  const ranks = {
    global: 1,
    state: 2,
    organization: 2,
    sector: 3,
    project: 4,
    item: 5,
    creator: 5,
  };
  const profile = state.permissionProfiles.find(
    (p) => p.id === user?.profileId && !p.inactive,
  );
  const byId = new Map(state.items.map((i) => [i.id, i]));
  let root = item;
  const seen = new Set();
  while (root?.parentId && root.type !== "project" && !seen.has(root.id)) {
    seen.add(root.id);
    root = byId.get(root.parentId) || root;
  }
  const matches =
    !user || user.disabled
      ? []
      : state.permissionRules
          .filter((rule) => {
            if (rule.inactive || rule.operation !== operation) return false;
            if (
              !(
                (rule.subjectType === "user" && rule.subjectId === user.id) ||
                (rule.subjectType === "profile" &&
                  profile &&
                  rule.subjectId === profile.id)
              )
            )
              return false;
            const scope =
              rule.scopeId === "@user" ? user.organizationId : rule.scopeId;
            return (
              rule.scopeType === "global" ||
              (item &&
                ((rule.scopeType === "state" && item.state === scope) ||
                  (rule.scopeType === "organization" &&
                    item.organizationId === scope) ||
                  (rule.scopeType === "sector" && item.sectorId === scope) ||
                  (rule.scopeType === "project" && root?.id === scope) ||
                  (rule.scopeType === "item" && item.id === scope) ||
                  (rule.scopeType === "creator" && item.createdBy === scope)))
            );
          })
          .sort(
            (a, b) =>
              (ranks[b.scopeType] || 0) - (ranks[a.scopeType] || 0) ||
              Number(a.effect === "allow") - Number(b.effect === "allow") ||
              a.id.localeCompare(b.id),
          );
  return {
    allowed: matches[0]?.effect === "allow",
    operation,
    itemId: item?.id || null,
    ruleId: matches[0]?.id || null,
    rule: matches[0] || null,
    actor: {
      id: user?.id,
      organizationId: user?.organizationId,
      sectorId: user?.sectorId,
    },
    reason: matches.length ? matches[0].effect : "no_applicable_rule",
  };
}

export function createDomain(initial, actorId, onDecision = () => {}) {
  const context = vm.createContext(
    {
      console: { warn() {}, log() {}, error() {} },
      document: { querySelector: () => ({}) },
      localStorage: { getItem: () => null, setItem() {} },
      __uid: id,
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  script.runInContext(context, { timeout: 10000 });
  context.__state = clone(initial || vm.runInContext("emptyState()", context));
  context.__actor = actorId;
  vm.runInContext("state = __state; state.currentUserId = __actor;", context);
  context.__authorize = (user, operation, item) => {
    const result = evaluatePermission(context.__state, user, operation, item);
    onDecision(result);
    return result.allowed;
  };
  vm.runInContext(
    `
    globalThis.__deferSchedule = false;
    const originalServerSchedule = recalculatePlannedDates;
    const originalServerSummary = syncParentSummary;
    recalculatePlannedDates = function(...args) { return globalThis.__deferSchedule ? { valid: true } : originalServerSchedule(...args); };
    syncParentSummary = function(...args) { if (!globalThis.__deferSchedule) return originalServerSummary(...args); };
    function relationsFor(items) { const ids = new Set(items.map(item=>item.id)); return state.relations.filter(rel=>ids.has(rel.sourceId)&&ids.has(rel.targetId)); }
    uid = function(prefix) { if (prefix === 'item' && globalThis.__forcedItemId) { const next = globalThis.__forcedItemId; globalThis.__forcedItemId = ''; return next; } return __uid(prefix); };
    gpoDecision = function(user, operation, item = null) { return __authorize(user, operation, item); };
    canDecideApproval = function(user, item) { return !!user && !!item && item.type === 'approval' && canViewItem(user,item) && gpoDecision(user,'decide_approval',item) === true && (item.approvalReviewerId || item.ownerId) === user.id; };
    canSubmitApproval = function(user, item) { return !!item && canViewItem(user,item) && gpoDecision(user,'create_approval',item) === true; };
  `,
    context,
  );
  vm.runInContext(scheduleSource, context);
  const functions = {};
  // Function identifiers are a fixed, source-controlled list; no request text is evaluated.
  for (const name of apiNames) functions[name] = vm.runInContext(name, context);
  const domain = {
    context,
    state: context.__state,
    functions,
    call(name, ...args) {
      assert(
        Object.hasOwn(functions, name),
        422,
        "UNKNOWN_COMMAND",
        "Comando inválido.",
      );
      try {
        return functions[name](...args);
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(422, "DOMAIN_VALIDATION", error.message);
      }
    },
    authorize(operation, item = null) {
      const result = evaluatePermission(
        domain.state,
        domain.state.users.find((u) => u.id === actorId),
        operation,
        item,
      );
      onDecision(result);
      assert(
        result.allowed,
        403,
        "FORBIDDEN",
        "Seu perfil não permite esta operação.",
        { operation, itemId: item?.id, ruleId: result.ruleId },
      );
      return result;
    },
    item(itemId, operation = "view_item") {
      const item = domain.state.items.find((i) => i.id === itemId);
      assert(
        item,
        404,
        "ITEM_NOT_FOUND",
        "Item não encontrado neste workspace.",
      );
      domain.authorize("view_item", item);
      if (operation !== "view_item") domain.authorize(operation, item);
      return item;
    },
    forceItemId(value) {
      context.__forcedItemId = checkId(value);
    },
    deferSchedule(value) {
      context.__deferSchedule = !!value;
    },
  };
  return domain;
}

export function validateState(state) {
  assert(
    state.items.length <= 20000 && state.relations.length <= 50000,
    422,
    "WORKSPACE_LIMIT",
    "Limite de itens ou relações do workspace excedido.",
  );
  for (const name of [
    "items",
    "relations",
    "organizations",
    "sectors",
    "users",
    "permissionProfiles",
    "permissionRules",
    "templates",
  ]) {
    const values = state[name] || [],
      ids = new Set();
    for (const entry of values) {
      checkId(entry.id);
      assert(
        !ids.has(entry.id),
        422,
        "DUPLICATE_ID",
        `Identificador duplicado em ${name}.`,
      );
      ids.add(entry.id);
    }
  }
  const byId = new Map(state.items.map((item) => [item.id, item]));
  const orgs = new Set(state.organizations.map((o) => o.id));
  const sectors = new Map(state.sectors.map((s) => [s.id, s]));
  const users = new Map(state.users.map((u) => [u.id, u]));
  for (const user of state.users) {
    assert(
      orgs.has(user.organizationId) &&
        sectors.get(user.sectorId)?.organizationId === user.organizationId,
      422,
      "USER_CONTEXT",
      "O usuário deve pertencer a uma empresa e setor válidos.",
    );
    assert(
      typeof user.email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email),
      422,
      "INVALID_EMAIL",
      "Informe um e-mail válido.",
    );
    if (user.profileId)
      assert(
        state.permissionProfiles.some((p) => p.id === user.profileId),
        422,
        "INVALID_PROFILE",
        "Perfil GPO inexistente.",
      );
  }
  const children = new Set(
    state.items.filter((i) => !i.archivedAt).map((i) => i.parentId),
  );
  for (const item of state.items) {
    assert(
      typeof item.title === "string" &&
        item.title.trim() &&
        item.title.length <= 500,
      422,
      "INVALID_TITLE",
      "O nome do item deve ter entre 1 e 500 caracteres.",
    );
    assert(
      orgs.has(item.organizationId) &&
        sectors.get(item.sectorId)?.organizationId === item.organizationId,
      422,
      "ITEM_CONTEXT",
      "Empresa/setor inválidos para o item.",
      { itemId: item.id },
    );
    const owner = users.get(item.ownerId);
    assert(
      owner &&
        owner.organizationId === item.organizationId &&
        owner.sectorId === item.sectorId,
      422,
      "OWNER_CONTEXT",
      "Empresa e setor do item devem acompanhar o responsável.",
      { itemId: item.id },
    );
    for (const field of dateFields)
      assert(
        dateValid(item[field]),
        422,
        "INVALID_DATE",
        "Data inexistente no calendário.",
        { itemId: item.id, field },
      );
    assert(
      item.plannedDurationDays === null ||
        (Number.isInteger(item.plannedDurationDays) &&
          item.plannedDurationDays >= 0 &&
          item.plannedDurationDays <= 36500),
      422,
      "INVALID_DURATION",
      "Duração inválida.",
      { itemId: item.id },
    );
    assert(
      Number.isFinite(item.weight) && item.weight > 0 && item.weight <= 1e9,
      422,
      "INVALID_WEIGHT",
      "O peso deve ser positivo.",
    );
    assert(
      Number.isFinite(item.progressPercent) &&
        item.progressPercent >= 0 &&
        item.progressPercent <= 100,
      422,
      "INVALID_PROGRESS",
      "Avanço fora do intervalo de 0 a 100%.",
    );
    if (item.parentId) {
      assert(
        byId.has(item.parentId),
        422,
        "ORPHAN_ITEM",
        "O item pai não existe neste workspace.",
      );
      assert(
        item.archivedAt || !byId.get(item.parentId).archivedAt,
        422,
        "ARCHIVED_PARENT",
        "Restaure o pai antes de restaurar o subitem.",
      );
    }
    const visited = new Set([item.id]);
    let cursor = item;
    while (cursor.parentId) {
      assert(
        !visited.has(cursor.parentId),
        422,
        "HIERARCHY_CYCLE",
        "A hierarquia não pode conter ciclos.",
      );
      visited.add(cursor.parentId);
      cursor = byId.get(cursor.parentId);
      if (!cursor) break;
    }
    if (
      item.status === "blocked" &&
      !item.blockedByPropagation &&
      !children.has(item.id)
    )
      assert(
        String(item.blockedReason || "").trim(),
        422,
        "BLOCK_REASON_REQUIRED",
        "Bloqueio manual exige um motivo.",
        { itemId: item.id },
      );
  }
  const seen = new Set(),
    edges = new Map(state.items.map((i) => [i.id, []])),
    indegree = new Map(state.items.map((i) => [i.id, 0]));
  for (const relation of state.relations) {
    assert(
      relation.relationType === "TI",
      422,
      "RELATION_TYPE",
      "Somente relações TI são persistidas; Contém deriva do pai.",
    );
    assert(
      byId.has(relation.sourceId) &&
        byId.has(relation.targetId) &&
        relation.sourceId !== relation.targetId,
      422,
      "INVALID_RELATION",
      "A relação deve conectar dois itens do workspace.",
    );
    assert(
      Number.isFinite(relation.lagDays) && Math.abs(relation.lagDays) <= 36500,
      422,
      "INVALID_LAG",
      "Defasagem inválida.",
    );
    const key = `${relation.sourceId}|${relation.targetId}`;
    assert(
      !seen.has(key),
      422,
      "DUPLICATE_RELATION",
      "Esta relação TI já existe.",
    );
    seen.add(key);
    if (
      !byId.get(relation.sourceId).archivedAt &&
      !byId.get(relation.targetId).archivedAt
    )
      assert(
        !children.has(relation.sourceId) && !children.has(relation.targetId),
        422,
        "RELATION_NOT_LEAF",
        "TI somente entre atividades finais.",
      );
    edges.get(relation.sourceId).push(relation.targetId);
    indegree.set(relation.targetId, indegree.get(relation.targetId) + 1);
  }
  const queue = [...indegree].filter(([, n]) => !n).map(([i]) => i);
  let count = 0;
  for (let p = 0; p < queue.length; p++) {
    const current = queue[p];
    count++;
    for (const next of edges.get(current)) {
      indegree.set(next, indegree.get(next) - 1);
      if (!indegree.get(next)) queue.push(next);
    }
  }
  assert(
    count === state.items.length,
    422,
    "TI_CYCLE",
    "As relações TI não podem conter ciclos.",
  );
}
