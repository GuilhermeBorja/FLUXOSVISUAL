import { createScheduleOperations } from "./domain-schedule-operations.mjs";
import { createAdminOperations } from "./domain-admin-operations.mjs";
import { createGpoOperations } from "./domain-gpo-operations.mjs";
import { createParentSummary } from "./domain-parent-summary.mjs";
import { createArchiveDeleteOperations } from "./domain-archive-delete.mjs";
import { createItemRelationOperations } from "./domain-item-relations.mjs";
import { normalizeLegacyBlocked, validateItemInput } from "./domain-item-validation.mjs";
import { createApprovalTemplateOperations } from "./domain-approval-template.mjs";

export class DomainError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = "DomainError";
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const operations = [
  "view_item", "create_item", "edit_item", "delete_item", "create_relation",
  "edit_relation", "delete_relation", "change_owner", "change_weight",
  "change_duration", "change_hierarchy", "add_attachment", "delete_attachment",
  "create_approval", "decide_approval", "manage_users", "manage_gpo",
  "manage_organization", "record_measurement", "record_blocker",
  "adjust_remaining_duration", "manage_commitment", "manage_calendar",
];

export const editableFields = [
  "title", "type", "status", "ownerId", "organizationId", "sectorId", "state",
  "description", "plannedStartAt", "dueAt", "plannedDurationDays", "replannedDueAt",
  "targetStartAt", "targetDueAt", "weight", "progressPercent", "blockedReason",
];

export const dateFields = [
  "plannedStartAt", "dueAt", "baselineStartAt", "baselineDueAt", "targetStartAt",
  "targetDueAt", "replannedDueAt",
];

export const id = (prefix = "id") => `${prefix}_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
export const pick = (object, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(object, key)).map((key) => [key, object[key]]));
export const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function checkId(value, label = "Identificador") {
  assert(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value), 422, "INVALID_ID", `${label} inválido.`);
  return value;
}

export function dateValid(value) {
  return !value || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value);
}

function assert(condition, status, code, message, details) {
  if (!condition) throw new DomainError(status, code, message, details);
}

export function emptyState() {
  return {
    version: 2,
    calendarVersion: 1,
    gpoVersion: 1,
    setupComplete: false,
    currentUserId: "",
    activePage: "overview",
    workspaceName: "",
    organizations: [],
    sectors: [],
    users: [],
    items: [],
    relations: [],
    events: [],
    attachments: [],
    archivedAttachments: [],
    archivedItems: [],
    archivedRelations: [],
    archivedUsers: [],
    archivedOrganizations: [],
    archivedSectors: [],
    permissionRules: [],
    permissionProfiles: [],
    approvalDecisions: [],
    templates: [],
    registryEvents: [],
    typeSettings: {},
    statusSettings: {},
    graphPositions: {},
    hiddenTableColumns: ["id", "created", "actualStart", "released", "completed", "elapsed", "activityDuration", "weight"],
    tableColumnWidths: {},
    riskThresholdDays: 3,
    filters: { query: "", status: "all", indicator: "all", type: "all", owner: "all", organization: "all", sector: "all", state: "all" },
  };
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function evaluatePermission(state, user, operation, item = null) {
  const ranks = { global: 1, state: 2, organization: 2, sector: 3, project: 4, item: 5, creator: 5 };
  const profile = state.permissionProfiles.find((entry) => entry.id === user?.profileId && !entry.inactive);
  const byId = new Map(state.items.map((entry) => [entry.id, entry]));
  let root = item;
  const seen = new Set();
  while (root?.parentId && root.type !== "project" && !seen.has(root.id)) {
    seen.add(root.id);
    root = byId.get(root.parentId) || root;
  }

  const matches = !user || user.disabled
    ? []
    : state.permissionRules.filter((rule) => {
      if (rule.inactive || rule.operation !== operation) return false;
      if (!((rule.subjectType === "user" && rule.subjectId === user.id)
        || (rule.subjectType === "profile" && profile && rule.subjectId === profile.id))) return false;
      const scope = rule.scopeId === "@user" ? user.organizationId : rule.scopeId;
      return rule.scopeType === "global"
        || (item && ((rule.scopeType === "state" && item.state === scope)
          || (rule.scopeType === "organization" && item.organizationId === scope)
          || (rule.scopeType === "sector" && item.sectorId === scope)
          || (rule.scopeType === "project" && root?.id === scope)
          || (rule.scopeType === "item" && item.id === scope)
          || (rule.scopeType === "creator" && item.createdBy === scope)));
    }).sort((left, right) => (ranks[right.scopeType] || 0) - (ranks[left.scopeType] || 0)
      || Number(left.effect === "allow") - Number(right.effect === "allow")
      || left.id.localeCompare(right.id));

  return {
    allowed: matches[0]?.effect === "allow",
    operation,
    itemId: item?.id || null,
    ruleId: matches[0]?.id || null,
    rule: matches[0] || null,
    actor: { id: user?.id, organizationId: user?.organizationId, sectorId: user?.sectorId },
    reason: matches.length ? matches[0].effect : "no_applicable_rule",
  };
}

export function createDomain(initial, actorId, onDecision = () => {}) {
  const state = clone(initial || emptyState());
  state.currentUserId = actorId;
  let forcedItemId = "";
  let scheduleDeferred = false;
  const domainId = (prefix = "id") => {
    if (prefix === "item" && forcedItemId) {
      const value = forcedItemId;
      forcedItemId = "";
      return value;
    }
    return id(prefix);
  };
  const decideForUser = (user, operation, item = null) => {
    const result = evaluatePermission(state, user, operation, item);
    onDecision(result);
    return result;
  };
  const decide = (operation, item = null) => decideForUser(currentUser(), operation, item);
  const authorize = (operation, item = null) => {
    const result = decide(operation, item);
    assert(result.allowed, 403, "FORBIDDEN", "Seu perfil não permite esta operação.", {
      operation,
      itemId: item?.id,
      ruleId: result.ruleId,
    });
    return result;
  };
  const nowIso = () => new Date().toISOString();
  const currentUser = () => state.users.find((user) => user.id === actorId) || null;
  const admin = createAdminOperations({ state, currentUser, id: domainId, nowIso });
  const gpo = createGpoOperations({
    state,
    currentUser,
    canManageGpo: (user) => decideForUser(user, "manage_gpo", null).allowed,
    canViewItem: (user, item) => decideForUser(user, "view_item", item).allowed,
    operationLabels: Object.fromEntries(operations.map((operation) => [operation, operation])),
    evaluatePermission,
    id: domainId,
    nowIso,
    registryEvent: admin.registryEvent,
    itemById: (itemId) => state.items.find((item) => item.id === itemId) || null,
    isBlocked: (item) => item?.status === "blocked",
    isOverdue: (item) => {
      if (!item || ["done", "cancelled"].includes(item.status)) return false;
      const target = item.baselineDueAt || item.dueAt;
      return Boolean(target && target < nowIso().slice(0, 10));
    },
    isAtRisk: (item) => {
      if (!item?.dueAt || ["done", "cancelled"].includes(item.status) || item.status === "blocked") return false;
      const target = item.baselineDueAt || item.dueAt;
      if (!target || target < nowIso().slice(0, 10)) return false;
      const daysLeft = Math.floor((new Date(`${target}T00:00:00`) - new Date(`${nowIso().slice(0, 10)}T00:00:00`)) / 86400000);
      return daysLeft <= (Number(state.riskThresholdDays) || 3) && Number(item.progressPercent || 0) < 75;
    },
    orgName: (organizationId) => state.organizations.find((entry) => entry.id === organizationId)?.name || "-",
    sectorName: (sectorId) => state.sectors.find((entry) => entry.id === sectorId)?.name || "-",
    userName: (userId) => state.users.find((entry) => entry.id === userId)?.name || "Sem responsável",
  });
  const parentSummary = createParentSummary({
    state,
    createEvent: admin.createEvent,
    nowIso,
    completeStatus: (status) => status === "done",
    inclusiveDurationDays,
  });
  const schedule = createScheduleOperations({
    state,
    authorize: (operation, item) => decide(operation, item).allowed,
    id: domainId,
    nowIso,
    createEvent: admin.createEvent,
    syncParentSummary: parentSummary.syncParentSummary,
  });
  const recalculatePlannedDates = (...args) => scheduleDeferred
    ? { valid: true }
    : schedule.recalculatePlannedDates(...args);
  const itemRelations = createItemRelationOperations({
    state,
    actor: currentUser(),
    authorize: decide,
    id: domainId,
    nowIso,
    today: () => nowIso().slice(0, 10),
    createEvent: admin.createEvent,
    registryEvent: admin.registryEvent,
    schedule: recalculatePlannedDates,
    helpers: {
      validateItemInput: (input, existing) => validateItemInput(input, existing, state),
      normalizeLegacyBlocked,
      itemDurationDays: (item) => hasPlannedDuration(item)
        ? Number(item.plannedDurationDays)
        : inclusiveDurationDays(item.plannedStartAt, item.dueAt),
      inclusiveFinishDate: (start, duration) => datePlusDays(start, durationEndOffset(duration)),
      completeStatus: (status) => status === "done",
      canCreateItem: (user, item) => decideForUser(user, "create_item", item
        ? { ...item, createdBy: item.createdBy || user?.id }
        : null).allowed,
      canEditItem: (user, item) => !!item && decideForUser(user, "edit_item", item).allowed,
      canChangeHierarchy: (user, item) => !!item
        && decideForUser(user, "edit_item", item).allowed
        && decideForUser(user, "change_hierarchy", item).allowed,
      syncParentSummary: parentSummary.syncParentSummary,
      recalculateBlocking: schedule.recalculateBlocking,
      archiveRecord(collection, record) {
        state[collection] ||= [];
        state[collection].push({ ...record, removedAt: nowIso(), removedBy: currentUser()?.id || "system" });
      },
      relationTypes: ["contains", "TI"],
    },
  });
  const canViewItem = (user, item) => !!user && !user.disabled && !!item
    && decideForUser(user, "view_item", item).allowed;
  const canEditItem = (user, item) => !!user && !user.disabled && !!item
    && decideForUser(user, "edit_item", item).allowed;
  const canCreateItem = (user, item = null) => !!user && !user.disabled
    && decideForUser(user, "create_item", item ? { ...item, createdBy: item.createdBy || user.id } : null).allowed;
  const canManageGpo = (user) => !!user && !user.disabled && decideForUser(user, "manage_gpo", null).allowed;
  const approvalGate = (itemOrId) => {
    const item = typeof itemOrId === "string" ? state.items.find((entry) => entry.id === itemOrId) : itemOrId;
    if (!item || item.type !== "approval") return { released: false, blockers: [] };
    const blockers = state.relations.filter((relation) => relation.targetId === item.id && relation.relationType === "TI")
      .map((relation) => state.items.find((entry) => entry.id === relation.sourceId))
      .filter((source) => source && (source.status !== "done" || source.status === "blocked"));
    if (item.status === "blocked") blockers.unshift(item);
    return { released: blockers.length === 0, blockers };
  };
  const approvals = createApprovalTemplateOperations({
    state,
    currentUser,
    authorize: (operation, item) => decide(operation, item).allowed,
    canSubmitApproval: (user, item) => canViewItem(user, item) && decideForUser(user, "create_approval", item).allowed,
    canDecideApproval: (user, item) => !!user && !user.disabled && item?.type === "approval"
      && canViewItem(user, item) && decideForUser(user, "decide_approval", item).allowed
      && (item.approvalReviewerId || item.ownerId) === user.id,
    approvalGate,
    canEditItem,
    canViewItem,
    canManageGpo,
    canCreateItem,
    itemTreeIds: admin.itemTreeIds,
    createEvent: admin.createEvent,
    registryEvent: admin.registryEvent,
    createItem: itemRelations.createItem,
    createRelation: itemRelations.createRelation,
    recalculatePlannedDates,
    syncParentSummary: parentSummary.syncParentSummary,
    id: domainId,
    nowIso,
    today: () => nowIso().slice(0, 10),
    shiftedDate: datePlusDays,
    inclusiveFinishDate: (start, duration) => datePlusDays(start, durationEndOffset(duration)),
    inclusiveDurationDays,
    completeStatus: (status) => status === "done",
  });
  const archive = createArchiveDeleteOperations({
    state,
    currentUser,
    id: domainId,
    nowIso,
    canEditItem: (user, item) => gpo.gpoDecision(user, "edit_item", item) === true,
    canRemoveItem: (user, item) => gpo.gpoDecision(user, "delete_item", item) === true,
    canManageUsers: (user, organizationId = user?.organizationId) => {
      const organization = state.organizations.find((entry) => entry.id === organizationId);
      return gpo.gpoDecision(user, "manage_users", { organizationId, state: organization?.state || user?.state }) === true;
    },
    canManageOrganization: (user, organizationId = user?.organizationId) => {
      const organization = state.organizations.find((entry) => entry.id === organizationId);
      return !!organization && gpo.gpoDecision(user, "manage_organization", { organizationId, state: organization.state }) === true;
    },
    createEvent: admin.createEvent,
    registryEvent: admin.registryEvent,
    itemTreeIds: admin.itemTreeIds,
    syncParentSummary: parentSummary.syncParentSummary,
    recalculatePlannedDates,
    syncContainsRelations(itemId) {
      state.relations = state.relations.filter((relation) => !(relation.relationType === "contains" && relation.targetId === itemId));
    },
    archiveRecord(collection, record) {
      state[collection] ||= [];
      state[collection].push({ ...record, removedAt: nowIso(), removedBy: currentUser()?.id || "system" });
    },
  });
  const functions = {
    emptyState,
    ...admin,
    ...gpo,
    ...parentSummary,
    ...schedule,
    ...itemRelations,
    ...approvals,
    ...archive,
    gpoDecision: (user, operation, item = null) => decideForUser(user, operation, item).allowed,
    recalculatePlannedDates(...args) {
      return recalculatePlannedDates(...args);
    },
  };
  return {
    state,
    functions,
    authorize,
    call(name, ...args) {
      assert(Object.hasOwn(functions, name), 422, "UNKNOWN_COMMAND", "Comando inválido.");
      try {
        return functions[name](...args);
      } catch (error) {
        if (error instanceof DomainError) throw error;
        throw new DomainError(422, "DOMAIN_VALIDATION", error.message);
      }
    },
    forceItemId(value) {
      forcedItemId = checkId(value);
    },
    deferSchedule(value) {
      scheduleDeferred = Boolean(value);
    },
    item(itemId, operation = "view_item") {
      const item = state.items.find((entry) => entry.id === itemId);
      assert(item, 404, "ITEM_NOT_FOUND", "Item não encontrado neste workspace.");
      authorize("view_item", item);
      if (operation !== "view_item") authorize(operation, item);
      return item;
    },
  };
}

function calendarDayNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
  return date.getTime() / 86400000;
}

function inclusiveDurationDays(start, finish) {
  const difference = calendarDayNumber(finish) - calendarDayNumber(start);
  return Number.isFinite(difference) && difference >= 0 ? difference + 1 : 0;
}

function hasPlannedDuration(item) {
  const value = item?.plannedDurationDays;
  return value !== null && value !== undefined && String(value).trim() !== ""
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function datePlusDays(value, days) {
  const day = calendarDayNumber(value);
  if (!Number.isFinite(day)) return "";
  return new Date((day + Number(days || 0)) * 86400000).toISOString().slice(0, 10);
}

function durationEndOffset(duration) {
  return Math.max(0, Math.ceil(Number(duration)) - 1);
}

function temporalStartOffset(relation, predecessorDuration, successorDuration) {
  const lag = Number(relation.lagDays) || 0;
  if (relation.relationType === "TI") return Number(predecessorDuration) + lag;
  if (relation.relationType === "II") return lag;
  if (relation.relationType === "TT") return durationEndOffset(predecessorDuration) + lag - durationEndOffset(successorDuration);
  if (relation.relationType === "IF") return lag - durationEndOffset(successorDuration);
  throw new Error(`Unknown temporal relation: ${relation.relationType}`);
}

function shiftedDate(value, offset) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + Number(offset || 0));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function byIdFallback(items, id) {
  return items.find((item) => item.id === id) || null;
}

function expandedSummaryTi(items, relations) {
  const children = new Set(items.map((item) => item.parentId).filter(Boolean));
  const leaves = items.filter((item) => !children.has(item.id));
  const descendants = (rootId) => {
    const ids = new Set([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of items) {
        if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id);
          changed = true;
        }
      }
    }
    return ids;
  };
  const leafGroups = new Map(items.map((item) => [item.id, leaves.filter((leaf) => descendants(item.id).has(leaf.id))]));
  return relations.filter((relation) => relation.relationType === "TI").flatMap((relation) => {
    const sources = leafGroups.get(relation.sourceId) || [];
    const targets = leafGroups.get(relation.targetId) || [];
    const targetIds = new Set(targets.map((item) => item.id));
    const internalIncoming = new Set(relations.filter((entry) => entry.relationType === "TI"
      && targetIds.has(entry.targetId) && targetIds.has(entry.sourceId)).map((entry) => entry.targetId));
    const roots = targets.filter((item) => !internalIncoming.has(item.id));
    return (sources.length ? sources : [byIdFallback(items, relation.sourceId)]).filter(Boolean)
      .flatMap((source) => (roots.length ? roots : [byIdFallback(items, relation.targetId)]).filter(Boolean)
        .map((target) => ({ ...relation, sourceId: source.id, targetId: target.id })));
  });
}

export function analyzeSchedule(items, relations, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const children = new Set(items.map((item) => item.parentId).filter(Boolean));
  let tasks = items.filter((item) => !children.has(item.id) && item.status !== "cancelled");
  if (!tasks.length) tasks = items.filter((item) => item.status !== "cancelled");
  if (!tasks.length) return { valid: true, reliable: false, startDate: today, finishDate: "", durationDays: 0, rows: [], message: "Não há atividades ativas para calcular a previsão." };

  const taskIds = new Set(tasks.map((item) => item.id));
  const dependencies = expandedSummaryTi(items, relations).filter((relation) => taskIds.has(relation.sourceId) && taskIds.has(relation.targetId));
  const sortedDates = tasks.map((item) => item.plannedStartAt).filter(Boolean).sort();
  const startDate = sortedDates[0] || today;
  const duration = new Map();
  const plannedStart = new Map();
  let durationsComplete = tasks.length > 0;
  for (const item of tasks) {
    const explicitDuration = Number(item.plannedDurationDays);
    const hasExplicitDuration = item.plannedDurationDays !== null && item.plannedDurationDays !== undefined
      && item.plannedDurationDays !== "" && Number.isFinite(explicitDuration) && explicitDuration >= 0;
    const hasDateRange = item.plannedStartAt && item.dueAt && item.dueAt >= item.plannedStartAt;
    const days = hasExplicitDuration ? explicitDuration : hasDateRange ? inclusiveDurationDays(item.plannedStartAt, item.dueAt) : null;
    if (days === null) durationsComplete = false;
    duration.set(item.id, days ?? 0);
    plannedStart.set(item.id, item.plannedStartAt
      ? Math.max(0, (new Date(`${item.plannedStartAt}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000)
      : 0);
  }

  const reliable = tasks.length > 0 && durationsComplete && tasks.every((item) => item.plannedStartAt
    && (item.plannedDurationDays !== undefined && item.plannedDurationDays !== null && item.plannedDurationDays !== ""
      || item.dueAt && item.dueAt >= item.plannedStartAt));
  const incoming = new Map(tasks.map((item) => [item.id, []]));
  const outgoing = new Map(tasks.map((item) => [item.id, []]));
  for (const relation of dependencies) {
    incoming.get(relation.targetId).push(relation);
    outgoing.get(relation.sourceId).push(relation);
  }
  const indegree = new Map(tasks.map((item) => [item.id, incoming.get(item.id).length]));
  const queue = tasks.filter((item) => indegree.get(item.id) === 0).map((item) => item.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const relation of outgoing.get(id)) {
      const next = indegree.get(relation.targetId) - 1;
      indegree.set(relation.targetId, next);
      if (next === 0) queue.push(relation.targetId);
    }
  }
  if (order.length !== tasks.length) return {
    valid: false,
    reliable: false,
    startDate,
    finishDate: "",
    durationDays: 0,
    rows: tasks.map((item) => ({ item, startOffset: plannedStart.get(item.id), duration: duration.get(item.id), slack: null, critical: false })),
    message: "Há um ciclo nas dependências temporais. O caminho crítico não pode ser calculado.",
  };

  const earliest = new Map(tasks.map((item) => [item.id, plannedStart.get(item.id)]));
  const offsetFor = (relation) => temporalStartOffset(relation, duration.get(relation.sourceId), duration.get(relation.targetId));
  for (const id of order) for (const relation of outgoing.get(id)) {
    earliest.set(relation.targetId, Math.max(earliest.get(relation.targetId), earliest.get(id) + offsetFor(relation)));
  }
  const projectFinish = Math.max(0, ...tasks.map((item) => earliest.get(item.id) + durationEndOffset(duration.get(item.id))));
  const projectDuration = projectFinish + (tasks.some((item) => duration.get(item.id) > 0) ? 1 : 0);
  const latest = new Map(tasks.map((item) => [item.id, projectFinish - durationEndOffset(duration.get(item.id))]));
  for (const id of [...order].reverse()) for (const relation of outgoing.get(id)) {
    latest.set(id, Math.min(latest.get(id), latest.get(relation.targetId) - offsetFor(relation)));
  }
  const rows = tasks.map((item) => {
    const startOffset = earliest.get(item.id);
    const slack = Math.max(0, latest.get(item.id) - startOffset);
    return { item, startOffset, duration: duration.get(item.id), slack, critical: slack < 0.01 };
  });
  return {
    valid: true,
    reliable,
    startDate,
    finishDate: shiftedDate(startDate, Math.ceil(projectFinish)),
    durationDays: Math.ceil(projectDuration),
    rows,
    message: reliable ? "" : "Cronograma incompleto: informe a data inicial idealizada e uma duração explícita (ou início e término válidos) para cada atividade; nenhuma duração é presumida.",
  };
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
        (Number.isFinite(item.plannedDurationDays) &&
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

