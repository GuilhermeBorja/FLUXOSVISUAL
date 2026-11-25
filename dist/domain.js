var FluxosDomain = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/domain.mjs
  var domain_exports = {};
  __export(domain_exports, {
    DomainError: () => DomainError,
    analyzeSchedule: () => analyzeSchedule,
    checkId: () => checkId,
    clone: () => clone,
    createDomain: () => createDomain,
    dateFields: () => dateFields,
    dateValid: () => dateValid,
    editableFields: () => editableFields,
    emptyState: () => emptyState,
    evaluatePermission: () => evaluatePermission,
    id: () => id,
    operations: () => operations,
    pick: () => pick,
    same: () => same,
    validateState: () => validateState
  });

  // src/domain-schedule-operations.mjs
  var activeItems = (state) => state.items.filter((item) => !item.archivedAt);
  function calendarDayNumber(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
    if (!match) return NaN;
    const [year, month, day] = match.slice(1).map(Number);
    const date = /* @__PURE__ */ new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
    return date.getTime() / 864e5;
  }
  function addDays(value, days) {
    if (!value || !Number.isFinite(calendarDayNumber(value))) return "";
    const date = new Date(calendarDayNumber(value) * 864e5);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }
  function durationEndOffset(duration) {
    return Math.max(0, Math.ceil(Number(duration)) - 1);
  }
  function durationOf(item) {
    const duration = item.plannedDurationDays;
    if (duration !== null && duration !== void 0 && String(duration).trim() !== "" && Number.isFinite(Number(duration)) && Number(duration) >= 0) return Number(duration);
    const start = calendarDayNumber(item.plannedStartAt);
    const end = calendarDayNumber(item.dueAt);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start + 1 : null;
  }
  function temporalStartOffset(relation, predecessorDuration, successorDuration) {
    const lag = Number(relation.lagDays) || 0;
    if (relation.relationType === "TI") return Number(predecessorDuration) + lag;
    if (relation.relationType === "II") return lag;
    if (relation.relationType === "TT") return durationEndOffset(predecessorDuration) + lag - durationEndOffset(successorDuration);
    if (relation.relationType === "IF") return lag - durationEndOffset(successorDuration);
    throw new Error(`Unknown temporal relation: ${relation.relationType}`);
  }
  function expandedSummaryTi(items, relations) {
    const children = new Set(items.map((item) => item.parentId).filter(Boolean));
    const leaves = items.filter((item) => !children.has(item.id));
    const descendants = (rootId) => {
      const ids = /* @__PURE__ */ new Set([rootId]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of items) if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
          ids.add(item.id);
          changed = true;
        }
      }
      return ids;
    };
    const leafGroups = new Map(items.map((item) => [item.id, leaves.filter((leaf) => descendants(item.id).has(leaf.id))]));
    return relations.filter((relation) => relation.relationType === "TI").flatMap((relation) => {
      const sources = leafGroups.get(relation.sourceId) || [];
      const targets = leafGroups.get(relation.targetId) || [];
      const targetIds = new Set(targets.map((item) => item.id));
      const internalIncoming = new Set(relations.filter((entry) => entry.relationType === "TI" && targetIds.has(entry.targetId) && targetIds.has(entry.sourceId)).map((entry) => entry.targetId));
      const roots = targets.filter((item) => !internalIncoming.has(item.id));
      const byId = (id2) => items.find((item) => item.id === id2) || null;
      return (sources.length ? sources : [byId(relation.sourceId)]).filter(Boolean).flatMap((source) => (roots.length ? roots : [byId(relation.targetId)]).filter(Boolean).map((target) => ({ ...relation, sourceId: source.id, targetId: target.id })));
    });
  }
  function createScheduleOperations({ state, authorize = () => true, id: id2, nowIso, createEvent, syncParentSummary } = {}) {
    if (!state || !Array.isArray(state.items) || !Array.isArray(state.relations)) {
      throw new TypeError("createScheduleOperations requires a state with items and relations arrays");
    }
    const timestamp = nowIso || (() => (/* @__PURE__ */ new Date()).toISOString());
    const emit = createEvent || ((itemId, eventType, fromValue, toValue, comment, effectiveAt = timestamp()) => {
      const item = state.items.find((entry) => entry.id === itemId);
      state.events || (state.events = []);
      state.events.push({
        id: id2 ? id2("event") : `event_${state.events.length + 1}`,
        itemId,
        eventType,
        fromValue,
        toValue,
        userId: state.currentUserId || "system",
        actorNameSnapshot: state.users?.find((user) => user.id === state.currentUserId)?.name || "Sistema",
        organizationIdSnapshot: item?.organizationId || "",
        sectorIdSnapshot: item?.sectorId || "",
        stateSnapshot: item?.state || "",
        createdAt: timestamp(),
        effectiveAt,
        comment: comment || ""
      });
    });
    function scheduleAnalysis(items = state.items) {
      const relations = state.relations.filter((relation) => {
        const ids = new Set(items.map((item) => item.id));
        return ids.has(relation.sourceId) && ids.has(relation.targetId);
      });
      return analyzeSchedule(items, relations, { today: timestamp().slice(0, 10) });
    }
    function recalculatePlannedDates() {
      const items = activeItems(state);
      const byId = new Map(items.map((item) => [item.id, item]));
      const dependencies = expandedSummaryTi(items, state.relations).filter((relation) => byId.has(relation.sourceId) && byId.has(relation.targetId));
      const incoming = new Map(items.map((item) => [item.id, []]));
      const outgoing = new Map(items.map((item) => [item.id, []]));
      for (const relation of dependencies) {
        incoming.get(relation.targetId).push(relation);
        outgoing.get(relation.sourceId).push(relation);
      }
      const indegree = new Map(items.map((item) => [item.id, incoming.get(item.id).length]));
      const queue = items.filter((item) => indegree.get(item.id) === 0).map((item) => item.id);
      const order = [];
      while (queue.length) {
        const currentId = queue.shift();
        order.push(currentId);
        for (const relation of outgoing.get(currentId)) {
          const next = indegree.get(relation.targetId) - 1;
          indegree.set(relation.targetId, next);
          if (next === 0) queue.push(relation.targetId);
        }
      }
      if (order.length !== items.length) return { valid: false, message: "H\xE1 um ciclo nas depend\xEAncias temporais. As datas n\xE3o foram recalculadas." };
      const durations = new Map(items.map((item) => [item.id, durationOf(item)]));
      const starts = new Map(items.map((item) => [item.id, item.plannedStartAt || item.baselineStartAt || timestamp().slice(0, 10)]));
      for (const itemId of order) {
        const candidates = [];
        for (const relation of incoming.get(itemId)) {
          const predecessor = byId.get(relation.sourceId);
          const duration = durations.get(predecessor.id);
          const predecessorStart = starts.get(predecessor.id);
          if (predecessor.status === "cancelled" || duration === null || !predecessorStart) continue;
          candidates.push(addDays(predecessorStart, temporalStartOffset(relation, duration, durations.get(itemId) ?? 0)));
        }
        if (candidates.length) {
          const earliestAllowed = starts.get(itemId);
          const dependencyStart = candidates.filter(Boolean).sort().at(-1);
          starts.set(itemId, earliestAllowed && dependencyStart ? earliestAllowed > dependencyStart ? earliestAllowed : dependencyStart : earliestAllowed || dependencyStart);
        }
      }
      for (const item of items) {
        if (items.some((child) => child.parentId === item.id && child.status !== "cancelled")) continue;
        const nextStart = starts.get(item.id) || item.baselineStartAt || item.plannedStartAt || timestamp().slice(0, 10);
        const duration = durations.get(item.id);
        const nextEnd = duration === null ? "" : addDays(nextStart, durationEndOffset(duration));
        if (item.plannedStartAt !== nextStart) {
          emit(item.id, "start_changed", item.plannedStartAt || "", nextStart, "Recalculo automatico da previsao TI.");
          item.plannedStartAt = nextStart;
        }
        if (item.dueAt !== nextEnd) {
          emit(item.id, "due_changed", item.dueAt || "", nextEnd, "Recalculo automatico da previsao TI.");
          item.dueAt = nextEnd;
        }
      }
      const depthOf = (item) => {
        let depth = 0;
        let cursor = item;
        const seen = /* @__PURE__ */ new Set();
        while (cursor?.parentId && !seen.has(cursor.parentId)) {
          seen.add(cursor.parentId);
          cursor = byId.get(cursor.parentId);
          if (cursor) depth++;
        }
        return depth;
      };
      const groups = items.filter((item) => items.some((child) => child.parentId === item.id && child.status !== "cancelled")).sort((a, b) => depthOf(a) - depthOf(b));
      for (const group of groups) if (group.replannedDueAt) {
        const descendants = items.filter((item) => {
          let cursor = item;
          const seen = /* @__PURE__ */ new Set();
          while (cursor?.parentId && !seen.has(cursor.parentId)) {
            if (cursor.parentId === group.id) return true;
            seen.add(cursor.parentId);
            cursor = byId.get(cursor.parentId);
          }
          return false;
        }).filter((item) => !items.some((child) => child.parentId === item.id && child.status !== "cancelled") && item.status !== "cancelled");
        const latest = descendants.map((item) => item.dueAt).filter(Boolean).sort().at(-1);
        if (!latest || !descendants.length) continue;
        const delta = calendarDayNumber(group.replannedDueAt) - calendarDayNumber(latest);
        if (!Number.isFinite(delta)) continue;
        for (const leaf of descendants) {
          if (!leaf.plannedStartAt || !leaf.dueAt) continue;
          const nextStart = addDays(leaf.plannedStartAt, delta);
          const nextEnd = addDays(leaf.dueAt, delta);
          if (leaf.plannedStartAt !== nextStart) emit(leaf.id, "start_changed", leaf.plannedStartAt, nextStart, "Repactuacao automatica.");
          if (leaf.dueAt !== nextEnd) emit(leaf.id, "due_changed", leaf.dueAt, nextEnd, "Repactuacao automatica.");
          leaf.plannedStartAt = nextStart;
          leaf.dueAt = nextEnd;
        }
      }
      for (const group of [...groups].sort((a, b) => depthOf(b) - depthOf(a))) syncParentSummary?.(group.id);
      return { valid: true };
    }
    function recalculateBlocking(effectiveAt = timestamp()) {
      const items = activeItems(state);
      const byId = new Map(items.map((item) => [item.id, item]));
      const outgoing = new Map(items.map((item) => [item.id, []]));
      for (const relation of state.relations) if (relation.relationType === "TI" && byId.has(relation.sourceId) && byId.has(relation.targetId)) outgoing.get(relation.sourceId).push(relation.targetId);
      const sources = new Map(items.map((item) => [item.id, /* @__PURE__ */ new Set()]));
      const queue = items.filter((item) => item.status === "blocked" && !item.blockedByPropagation).map((item) => ({ id: item.id, source: item.id }));
      const seen = /* @__PURE__ */ new Set();
      while (queue.length) {
        const { id: currentId, source } = queue.shift();
        const key = `${currentId}|${source}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const target of outgoing.get(currentId) || []) {
          sources.get(target).add(source);
          queue.push({ id: target, source });
        }
      }
      const changedParentIds = /* @__PURE__ */ new Set();
      for (const item of items) {
        const next = [...sources.get(item.id)].filter((source) => source !== item.id).sort();
        const prior = item.inheritedBlockedFrom || [];
        if (next.join("|") !== prior.join("|")) {
          emit(item.id, "blocker_sources_changed", prior.join(", "), next.join(", "), "Impedimentos herdados recalculados automaticamente.", effectiveAt);
          item.inheritedBlockedFrom = next;
          if (item.parentId) changedParentIds.add(item.parentId);
        }
        const eligible = !["done", "cancelled", "in_progress", "under_review", "correction"].includes(item.status);
        if (next.length && eligible && item.status !== "blocked" && !item.manualBlockOverride && item.id !== next[0]) {
          item.statusBeforeInheritedBlock = item.status;
          const previous = item.status;
          item.status = "blocked";
          item.blockedByPropagation = true;
          emit(item.id, "status_changed", previous, "blocked", "Bloqueio herdado automaticamente.", effectiveAt);
          if (item.parentId) changedParentIds.add(item.parentId);
        } else if (!next.length && item.blockedByPropagation && item.status === "blocked") {
          const previous = item.status;
          item.status = item.statusBeforeInheritedBlock || "backlog";
          item.blockedByPropagation = false;
          item.statusBeforeInheritedBlock = "";
          emit(item.id, "status_changed", previous, item.status, "Desbloqueio herdado: status restaurado.", effectiveAt);
          if (item.parentId) changedParentIds.add(item.parentId);
        }
        if (!next.length) {
          item.manualBlockOverride = false;
          if (item.status !== "blocked") item.blockedByPropagation = false;
        }
      }
      for (const parentId of changedParentIds) syncParentSummary?.(parentId, effectiveAt);
    }
    return { scheduleAnalysis, recalculatePlannedDates, recalculateBlocking };
  }

  // src/domain-admin-operations.mjs
  function createAdminOperations({ state, currentUser, id: id2, nowIso }) {
    if (!state || typeof currentUser !== "function" || typeof id2 !== "function" || typeof nowIso !== "function") {
      throw new TypeError("createAdminOperations requires state, currentUser, id, and nowIso");
    }
    function itemTreeIds(initialIds) {
      const ids = new Set(initialIds);
      const children = /* @__PURE__ */ new Map();
      for (const item of state.items) {
        if (!children.has(item.parentId)) children.set(item.parentId, []);
        children.get(item.parentId).push(item.id);
      }
      const queue = [...ids];
      for (let index = 0; index < queue.length; index++) {
        for (const childId of children.get(queue[index]) || []) {
          if (ids.has(childId)) continue;
          ids.add(childId);
          queue.push(childId);
        }
      }
      return ids;
    }
    function createEvent(itemId, eventType, fromValue, toValue, comment, effectiveAt = nowIso()) {
      const item = state.items.find((entry) => entry.id === itemId);
      const actor = currentUser();
      const organizationId = item?.organizationId || actor?.organizationId || "";
      const sectorId = item?.sectorId || actor?.sectorId || "";
      const organizationName = state.organizations?.find((entry) => entry.id === organizationId)?.name || "";
      const sectorName = state.sectors?.find((entry) => entry.id === sectorId)?.name || "";
      const event = {
        id: id2("event"),
        itemId,
        eventType,
        fromValue,
        toValue,
        userId: actor?.id || "system",
        actorNameSnapshot: actor?.name || "Sistema",
        actorOrganizationNameSnapshot: state.organizations?.find((entry) => entry.id === actor?.organizationId)?.name || "",
        organizationIdSnapshot: organizationId,
        organizationNameSnapshot: organizationName,
        sectorIdSnapshot: sectorId,
        sectorNameSnapshot: sectorName,
        stateSnapshot: item?.state || actor?.state || "",
        createdAt: nowIso(),
        effectiveAt,
        comment: comment || ""
      };
      state.events.push(event);
      return event;
    }
    function registryEvent(entityType, record, comment = "", eventType = "removed") {
      state.registryEvents || (state.registryEvents = []);
      const event = {
        id: id2("registry_event"),
        entityType,
        entityId: record.id,
        eventType,
        name: record.name || record.operation || record.id,
        userId: currentUser().id,
        createdAt: nowIso(),
        comment
      };
      state.registryEvents.push(event);
      return event;
    }
    return { itemTreeIds, createEvent, registryEvent };
  }

  // src/domain-gpo-operations.mjs
  function createGpoOperations({
    state,
    currentUser,
    canManageGpo,
    canViewItem,
    operationLabels,
    evaluatePermission: evaluatePermission2,
    id: id2,
    nowIso,
    registryEvent,
    itemById = (itemId) => state.items.find((item) => item.id === itemId),
    isBlocked = (item) => item?.status === "blocked",
    isOverdue = () => false,
    isAtRisk = () => false,
    orgName = (organizationId) => state.organizations.find((entry) => entry.id === organizationId)?.name || state.archivedOrganizations?.find((entry) => entry.id === organizationId)?.name || "-",
    sectorName = (sectorId) => state.sectors.find((entry) => entry.id === sectorId)?.name || state.archivedSectors?.find((entry) => entry.id === sectorId)?.name || "-",
    userName = (userId) => state.users.find((entry) => entry.id === userId)?.name || state.archivedUsers?.find((entry) => entry.id === userId)?.name || "Sem respons\xE1vel"
  } = {}) {
    for (const [name, value] of Object.entries({ state, currentUser, canManageGpo, canViewItem, operationLabels, evaluatePermission: evaluatePermission2, id: id2, nowIso, registryEvent })) {
      if (!value) throw new TypeError(`createGpoOperations requires ${name}`);
    }
    function gpoDecision(user, operation, item = null) {
      const decision = evaluatePermission2(state, user, operation, item);
      return decision.reason === "no_applicable_rule" ? null : decision.allowed;
    }
    function createPermissionRule(input) {
      const user = currentUser();
      if (!canManageGpo(user)) throw new Error("Sua regra GPO n\xE3o permite configurar permiss\xF5es.");
      if (!Object.hasOwn(operationLabels, input.operation)) throw new Error("Selecione uma opera\xE7\xE3o do GPO.");
      if (!["user", "profile"].includes(input.subjectType)) throw new Error("Selecione um usu\xE1rio ou perfil GPO.");
      if (input.subjectType === "user" && !state.users.some((entry) => entry.id === input.subjectId && !entry.disabled)) throw new Error("Selecione um usu\xE1rio ativo.");
      if (input.subjectType === "profile" && !(state.permissionProfiles || []).some((entry) => entry.id === input.subjectId)) throw new Error("Selecione um perfil GPO existente.");
      if (!["global", "state", "organization", "sector", "project", "item"].includes(input.scopeType)) throw new Error("Selecione um escopo v\xE1lido.");
      if (input.scopeType === "state" && !/^[A-Z]{2}$/.test(input.scopeId || "")) throw new Error("Selecione um estado v\xE1lido.");
      if (input.scopeType === "organization" && !state.organizations.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione uma empresa.");
      if (input.scopeType === "sector" && !state.sectors.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione um setor.");
      if (input.scopeType === "project" && !state.items.some((entry) => entry.id === input.scopeId && entry.type === "project")) throw new Error("Selecione um projeto.");
      if (input.scopeType === "item" && !itemById(input.scopeId)) throw new Error("Selecione um item.");
      if (input.operation === "manage_gpo" && input.scopeType !== "global") throw new Error("A configura\xE7\xE3o de GPO exige escopo global.");
      if (input.operation === "manage_organization" && !["global", "organization"].includes(input.scopeType)) throw new Error("A administra\xE7\xE3o organizacional exige escopo global ou de empresa.");
      if (!["allow", "deny"].includes(input.effect)) throw new Error("Selecione permitir ou negar.");
      state.permissionRules || (state.permissionRules = []);
      const scopeId = input.scopeId || "";
      const duplicate = state.permissionRules.some((rule2) => rule2.subjectType === input.subjectType && rule2.subjectId === input.subjectId && rule2.operation === input.operation && rule2.scopeType === input.scopeType && rule2.scopeId === scopeId && rule2.effect === input.effect);
      if (duplicate) throw new Error("Esta regra GPO j\xE1 existe.");
      const rule = { id: id2("gpo"), ...input, scopeId, createdBy: user.id, createdAt: nowIso() };
      state.permissionRules.push(rule);
      registryEvent("permission", rule, "Regra GPO demonstrativa criada.", "created");
      return rule;
    }
    function removePermissionRule(ruleId) {
      if (!canManageGpo(currentUser())) throw new Error("Sua regra GPO n\xE3o permite alterar permiss\xF5es.");
      const rule = state.permissionRules?.find((entry) => entry.id === ruleId);
      if (!rule) throw new Error("Regra GPO n\xE3o encontrada.");
      state.permissionRules = state.permissionRules.filter((entry) => entry.id !== ruleId);
      registryEvent("permission", rule, "Regra GPO demonstrativa removida.", "removed");
    }
    function visibleItems() {
      const user = currentUser();
      const filters = state.filters;
      const query = String(filters.query || "").trim().toLowerCase();
      return state.items.filter((item) => !item.archivedAt && canViewItem(user, item)).filter((item) => filters.status === "all" || item.status === filters.status).filter((item) => (filters.indicator || "all") === "all" || filters.indicator === "blocked" && isBlocked(item) || filters.indicator === "overdue" && isOverdue(item) || filters.indicator === "risk" && isAtRisk(item)).filter((item) => filters.type === "all" || item.type === filters.type).filter((item) => filters.owner === "all" || item.ownerId === filters.owner).filter((item) => filters.organization === "all" || item.organizationId === filters.organization).filter((item) => filters.sector === "all" || item.sectorId === filters.sector).filter((item) => filters.state === "all" || item.state === filters.state).filter((item) => !query || [
        item.title,
        item.description,
        item.status,
        item.type,
        orgName(item.organizationId),
        sectorName(item.sectorId),
        userName(item.ownerId)
      ].join(" ").toLowerCase().includes(query));
    }
    return { gpoDecision, createPermissionRule, removePermissionRule, visibleItems };
  }

  // src/domain-parent-summary.mjs
  function createParentSummary({
    state,
    createEvent,
    nowIso,
    completeStatus,
    inclusiveDurationDays: inclusiveDurationDays2
  } = {}) {
    if (!state || !Array.isArray(state.items) || typeof createEvent !== "function" || typeof nowIso !== "function" || typeof completeStatus !== "function" || typeof inclusiveDurationDays2 !== "function") {
      throw new TypeError("createParentSummary requires state, event, time, status, and duration dependencies");
    }
    const getItem = (itemId) => state.items.find((item) => item.id === itemId) || null;
    function syncParentSummary(parentId, effectiveAt = nowIso()) {
      const parent = getItem(parentId);
      if (!parent) return;
      const children = state.items.filter((item) => item.parentId === parentId && item.status !== "cancelled" && !item.archivedAt);
      if (!parent.baselineStartAt) {
        parent.baselineStartAt = children.map((item) => item.baselineStartAt || item.plannedStartAt).filter(Boolean).sort()[0] || parent.plannedStartAt || "";
      }
      if (!parent.baselineDueAt) {
        parent.baselineDueAt = children.map((item) => item.baselineDueAt || item.dueAt).filter(Boolean).sort().at(-1) || parent.dueAt || "";
      }
      if (!state.items.some((child) => child.parentId === parentId && !child.archivedAt)) return;
      const wasComplete = completeStatus(parent.status);
      const allChildren = state.items.filter((child) => child.parentId === parent.id && !child.archivedAt);
      const active = allChildren.filter((child) => child.status !== "cancelled");
      const leaves = [];
      const seen = /* @__PURE__ */ new Set();
      function collect(itemId) {
        if (seen.has(itemId)) return;
        seen.add(itemId);
        const nested = state.items.filter((child) => child.parentId === itemId && !child.archivedAt);
        if (!nested.length) {
          const leaf = getItem(itemId);
          if (leaf?.status !== "cancelled") leaves.push(leaf);
        } else {
          nested.forEach((child) => collect(child.id));
        }
      }
      allChildren.forEach((child) => collect(child.id));
      const weighted = leaves.reduce((total, leaf) => {
        const weight = Number(leaf.weight ?? 1);
        if (Number.isFinite(weight) && weight > 0) {
          total.value += weight * (leaf.status === "done" ? 100 : Math.max(0, Math.min(100, Number(leaf.progressPercent || 0))));
          total.weight += weight;
        }
        return total;
      }, { value: 0, weight: 0 });
      let nextStatus = "backlog";
      if (!active.length) nextStatus = "cancelled";
      else if (active.every((child) => child.status === "done")) nextStatus = "done";
      else if (active.some((child) => ["in_progress", "under_review", "correction", "done"].includes(child.status))) nextStatus = "in_progress";
      else if (active.every((child) => child.status === "blocked")) nextStatus = "blocked";
      else if (active.some((child) => child.status === "ready")) nextStatus = "ready";
      else if (active.some((child) => child.status === "waiting")) nextStatus = "waiting";
      const next = {
        status: nextStatus,
        progressPercent: weighted.weight ? Math.round(weighted.value / weighted.weight) : 0,
        plannedDurationDays: active.every((child) => child.plannedStartAt && child.dueAt) ? inclusiveDurationDays2(active.map((child) => child.plannedStartAt).sort()[0], active.map((child) => child.dueAt).sort().at(-1)) : null,
        plannedStartAt: active.map((child) => child.plannedStartAt).filter(Boolean).sort()[0] || parent.plannedStartAt || "",
        dueAt: active.map((child) => child.dueAt).filter(Boolean).sort().at(-1) || parent.dueAt || ""
      };
      let changed = false;
      for (const field of Object.keys(next)) {
        if (parent[field] === next[field]) continue;
        const eventType = field === "status" ? "status_changed" : field === "progressPercent" ? "progress_changed" : field === "plannedStartAt" ? "start_changed" : field === "plannedDurationDays" ? "duration_changed" : "due_changed";
        createEvent(parent.id, eventType, parent[field] || "", next[field] ?? "", "Resumo herdado dos subitens.", effectiveAt);
        parent[field] = next[field];
        changed = true;
      }
      if (completeStatus(next.status)) {
        parent.completedAt = children.map((item) => item.completedAt).filter(Boolean).sort().at(-1) || parent.completedAt || effectiveAt;
      } else if (wasComplete) {
        parent.completedAt = "";
      }
      if (changed) {
        parent.updatedAt = nowIso();
        parent.lastChangeAt = effectiveAt;
        if (parent.parentId) syncParentSummary(parent.parentId, effectiveAt);
      }
    }
    return { syncParentSummary };
  }

  // src/domain-archive-delete.mjs
  function createArchiveDeleteOperations(deps) {
    const {
      state,
      currentUser,
      id: id2,
      nowIso,
      canEditItem,
      canRemoveItem,
      canManageUsers,
      canManageOrganization,
      createEvent,
      registryEvent,
      itemTreeIds,
      syncParentSummary = () => {
      },
      recalculatePlannedDates = () => ({ valid: true }),
      syncContainsRelations = () => {
      },
      archiveRecord = defaultArchiveRecord
    } = deps;
    for (const key of ["state", "currentUser", "id", "nowIso", "canEditItem", "canRemoveItem", "canManageUsers", "canManageOrganization", "createEvent", "registryEvent", "itemTreeIds"])
      if (!deps[key]) throw new TypeError(`Missing archive/delete dependency: ${key}`);
    const getItem = (itemId) => state.items.find((item) => item.id === itemId) || null;
    function requireDeletionPermission(item = null) {
      if (!canRemoveItem(currentUser(), item)) {
        throw new Error(item ? "Sua regra GPO n\xE3o permite excluir este item." : "Sua regra GPO n\xE3o permite excluir este cadastro.");
      }
    }
    function archiveItem(itemId) {
      const user = currentUser();
      const root = getItem(itemId);
      if (!root || !canEditItem(user, root)) throw new Error("O GPO n\xE3o permite arquivar este item.");
      const ids = [];
      const seen = /* @__PURE__ */ new Set();
      const queue = [root.id];
      while (queue.length) {
        const currentId = queue.shift();
        if (seen.has(currentId)) continue;
        seen.add(currentId);
        const item = getItem(currentId);
        if (!item) continue;
        ids.push(item);
        state.items.filter((child) => child.parentId === currentId).forEach((child) => queue.push(child.id));
      }
      const archivedAt = nowIso();
      for (const item of ids) {
        if (item.archivedAt) continue;
        item.archivedAt = archivedAt;
        item.archivedBy = user.id;
        createEvent(item.id, "archived", "", archivedAt, "Item arquivado; hierarquia preservada.");
      }
      if (root.parentId) syncParentSummary(root.parentId);
      return ids.length;
    }
    function restoreArchivedItem(itemId) {
      const user = currentUser();
      const root = getItem(itemId);
      if (!root || !root.archivedAt || !canEditItem(user, root)) throw new Error("O GPO n\xE3o permite restaurar este item.");
      const ids = [];
      const seen = /* @__PURE__ */ new Set();
      const queue = [root.id];
      while (queue.length) {
        const currentId = queue.shift();
        if (seen.has(currentId)) continue;
        seen.add(currentId);
        const item = getItem(currentId);
        if (!item) continue;
        ids.push(item);
        state.items.filter((child) => child.parentId === currentId && child.archivedAt).forEach((child) => queue.push(child.id));
      }
      for (const item of ids) {
        item.archivedAt = "";
        item.archivedBy = "";
        createEvent(item.id, "restored", "", "active", "Item restaurado.");
      }
      recalculatePlannedDates();
      if (root.parentId) syncParentSummary(root.parentId);
      return ids.length;
    }
    function itemRemovalPlan(itemId, cascade = false) {
      requireDeletionPermission();
      const item = getItem(itemId);
      if (!item) throw new Error("Item n\xE3o encontrado.");
      const treeIds = itemTreeIds([itemId]);
      const ids = cascade ? treeIds : /* @__PURE__ */ new Set([itemId]);
      return {
        item,
        ids,
        descendantCount: treeIds.size - 1,
        items: state.items.filter((entry) => ids.has(entry.id)),
        relations: state.relations.filter((relation) => ids.has(relation.sourceId) || ids.has(relation.targetId)),
        detached: state.items.filter((entry) => !ids.has(entry.id) && ids.has(entry.parentId))
      };
    }
    function removeItemsByIds(ids, reason) {
      const removed = state.items.filter((item) => ids.has(item.id));
      if (!removed.length && !canRemoveItem(currentUser())) requireDeletionPermission();
      for (const item of removed) requireDeletionPermission(item);
      const relations = state.relations.filter((relation) => ids.has(relation.sourceId) || ids.has(relation.targetId));
      const archivedRelationCountBefore = (state.archivedRelations || []).length;
      const detachedRoots = [];
      const effectiveAt = nowIso();
      for (const item of state.items) {
        if (ids.has(item.id) || !ids.has(item.parentId)) continue;
        createEvent(item.id, "parent_changed", getItem(item.parentId)?.title || item.parentId, "", "Item pai exclu\xEDdo; subitem mantido como item independente.", effectiveAt);
        item.parentId = "";
        item.updatedAt = effectiveAt;
        item.lastChangeAt = effectiveAt;
        detachedRoots.push(item.id);
      }
      for (const relation of relations) {
        archiveRecord("archivedRelations", relation);
        for (const endpoint of [relation.sourceId, relation.targetId]) {
          if (ids.has(endpoint)) continue;
          const other = getItem(endpoint === relation.sourceId ? relation.targetId : relation.sourceId);
          createEvent(endpoint, "relation_removed", relation.relationType, "", `Rela\xE7\xE3o com ${other?.title || "item exclu\xEDdo"} removida pela exclus\xE3o do item.`, effectiveAt);
        }
      }
      for (const item of removed) {
        createEvent(item.id, "item_removed", item.title, "", reason, effectiveAt);
        archiveRecord("archivedItems", item);
      }
      state.archivedAttachments || (state.archivedAttachments = []);
      const removedAttachments = (state.attachments || []).filter((attachment) => ids.has(attachment.itemId));
      removedAttachments.forEach((attachment) => state.archivedAttachments.push({
        ...attachment,
        deletedAt: effectiveAt,
        deletedBy: currentUser()?.id || "system"
      }));
      state.attachments = (state.attachments || []).filter((attachment) => !ids.has(attachment.itemId));
      state.items = state.items.filter((item) => !ids.has(item.id));
      state.relations = state.relations.filter((relation) => !ids.has(relation.sourceId) && !ids.has(relation.targetId));
      const pending = [...detachedRoots];
      const visited = /* @__PURE__ */ new Set();
      while (pending.length) {
        const itemId = pending.shift();
        if (visited.has(itemId)) continue;
        visited.add(itemId);
        syncContainsRelations(itemId);
        state.items.filter((item) => item.parentId === itemId).forEach((child) => pending.push(child.id));
      }
      for (const positions of Object.values(state.graphPositions || {})) {
        for (const itemId of ids) delete positions[itemId];
      }
      return { items: removed.length, relations: (state.archivedRelations || []).length - archivedRelationCountBefore };
    }
    function removeItem(itemId, { cascade = false, keepChildren = false } = {}) {
      const plan = itemRemovalPlan(itemId, cascade);
      if (plan.descendantCount && !cascade && !keepChildren) throw new Error("Escolha excluir os subitens ou mant\xEA-los como itens independentes.");
      return removeItemsByIds(plan.ids, `Item exclu\xEDdo${cascade ? " com seus subitens" : ""}. Hist\xF3rico preservado.`);
    }
    function removeUser(userId, { replacementId = "" } = {}) {
      const user = state.users.find((entry) => entry.id === userId);
      if (!user) throw new Error("Usu\xE1rio n\xE3o encontrado.");
      if (!canManageUsers(currentUser(), user.organizationId)) throw new Error("O GPO n\xE3o permite gerenciar usu\xE1rios nesta empresa.");
      if (user.id === currentUser()?.id) throw new Error("Entre com outro administrador para excluir o usu\xE1rio conectado.");
      const replacement = replacementId && state.users.find((entry) => entry.id === replacementId && entry.id !== userId && !entry.disabled);
      if (replacementId && !replacement) throw new Error("Selecione um respons\xE1vel substituto ativo.");
      const items = state.items.filter((item) => item.ownerId === userId);
      const effectiveAt = nowIso();
      for (const item of items) {
        createEvent(item.id, "owner_changed", userId, replacementId, `Usu\xE1rio ${user.name} exclu\xEDdo. ${replacement ? `Responsabilidade transferida para ${replacement.name}.` : "Item mantido sem respons\xE1vel."}`, effectiveAt);
        item.ownerId = replacementId;
        item.updatedAt = effectiveAt;
        item.lastChangeAt = effectiveAt;
      }
      archiveRecord("archivedUsers", user);
      registryEvent("user", user, `${items.length} itens ${replacement ? "repassados" : "mantidos sem respons\xE1vel"}.`);
      state.users = state.users.filter((entry) => entry.id !== userId);
      if (state.filters?.owner === userId) state.filters.owner = "all";
      return { users: 1, reassigned: items.length };
    }
    function removeSector(sectorId, { replacementId = "" } = {}) {
      const sector = state.sectors.find((entry) => entry.id === sectorId);
      if (!sector) throw new Error("Setor n\xE3o encontrado.");
      if (!canManageOrganization(currentUser(), sector.organizationId)) throw new Error("O GPO n\xE3o permite administrar esta empresa.");
      const users = state.users.filter((user) => user.sectorId === sectorId);
      const items = state.items.filter((item) => item.sectorId === sectorId);
      const replacement = replacementId && state.sectors.find((entry) => entry.id === replacementId && entry.id !== sectorId && entry.organizationId === sector.organizationId);
      if ((items.length || users.length || replacementId) && !replacement) throw new Error("Escolha outro setor da mesma empresa para receber os itens e usu\xE1rios vinculados.");
      const effectiveAt = nowIso();
      for (const item of items) {
        createEvent(item.id, "context_changed", sector.name, replacement.name, "Setor exclu\xEDdo; item transferido para outro setor da mesma empresa.", effectiveAt);
        item.sectorId = replacement.id;
        item.updatedAt = effectiveAt;
        item.lastChangeAt = effectiveAt;
      }
      users.forEach((user) => {
        user.sectorId = replacement.id;
      });
      archiveRecord("archivedSectors", sector);
      registryEvent("sector", sector, `${items.length} itens e ${users.length} usu\xE1rios transferidos${replacement ? ` para ${replacement.name}` : ""}.`);
      state.sectors = state.sectors.filter((entry) => entry.id !== sectorId);
      return { sectors: 1, items: items.length, users: users.length };
    }
    function organizationRemovalPlan(organizationId) {
      const organization = state.organizations.find((entry) => entry.id === organizationId);
      if (!organization) throw new Error("Empresa n\xE3o encontrada.");
      if (!canManageOrganization(currentUser(), organizationId)) throw new Error("O GPO n\xE3o permite administrar esta empresa.");
      const sectors = state.sectors.filter((sector) => sector.organizationId === organizationId);
      const sectorIds = new Set(sectors.map((sector) => sector.id));
      const users = state.users.filter((user) => user.organizationId === organizationId || sectorIds.has(user.sectorId));
      if (currentUser()?.organizationId === organizationId || users.some((user) => user.id === currentUser()?.id)) {
        throw new Error("Entre com um administrador de outra empresa para excluir a empresa do usu\xE1rio conectado.");
      }
      const ids = itemTreeIds(state.items.filter((item) => item.organizationId === organizationId || sectorIds.has(item.sectorId)).map((item) => item.id));
      const userIds = new Set(users.map((user) => user.id));
      return {
        organization,
        sectors,
        users,
        ids,
        unassigned: state.items.filter((item) => !ids.has(item.id) && userIds.has(item.ownerId))
      };
    }
    function removeOrganization(organizationId) {
      const plan = organizationRemovalPlan(organizationId);
      const result = removeItemsByIds(plan.ids, `Empresa ${plan.organization.name} exclu\xEDda com seus itens e subitens. Hist\xF3rico preservado.`);
      plan.users.forEach((user) => removeUser(user.id));
      plan.sectors.forEach((sector) => removeSector(sector.id));
      archiveRecord("archivedOrganizations", plan.organization);
      registryEvent("organization", plan.organization, `${result.items} itens, ${plan.users.length} usu\xE1rios e ${plan.sectors.length} setores exclu\xEDdos.`);
      state.organizations = state.organizations.filter((entry) => entry.id !== organizationId);
      return { ...result, users: plan.users.length, sectors: plan.sectors.length, organizations: 1 };
    }
    function defaultArchiveRecord(collection, record) {
      state[collection] || (state[collection] = []);
      state[collection].push({ ...record, removedAt: nowIso(), removedBy: currentUser()?.id || "system" });
    }
    return { archiveItem, restoreArchivedItem, removeItem, removeUser, removeSector, removeOrganization };
  }

  // src/domain-item-relations.mjs
  var copy = (value) => JSON.parse(JSON.stringify(value));
  function createItemRelationOperations({
    state,
    actor,
    authorize,
    id: id2,
    nowIso,
    today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
    createEvent = () => {
    },
    registryEvent = () => {
    },
    schedule = () => ({ valid: true }),
    helpers = {}
  }) {
    const getItem = (itemId) => state.items.find((item) => item.id === itemId) || null;
    const syncContainsRelations = (itemId) => {
      state.relations = state.relations.filter((relation) => !(relation.relationType === "contains" && relation.targetId === itemId));
    };
    const granted = (operation, item) => {
      const result = authorize(operation, item);
      return result !== false && result?.allowed !== false;
    };
    const allowed = (operation, item, message = "A regra de permiss\xE3o n\xE3o permite esta opera\xE7\xE3o.") => {
      if (!granted(operation, item)) throw new Error(message);
    };
    const canCreate = (user, item) => helpers.canCreateItem ? helpers.canCreateItem(user, item) : granted("create_item", item);
    const canEdit = (user, item) => helpers.canEditItem ? helpers.canEditItem(user, item) : !!item && granted("edit_item", item);
    const canChangeHierarchy = (user, item) => helpers.canChangeHierarchy ? helpers.canChangeHierarchy(user, item) : !!item && canEdit(user, item) && granted("change_hierarchy", item);
    const validateItemInput2 = (input, item) => helpers.validateItemInput?.(input, item);
    const normalizeLegacyBlocked2 = helpers.normalizeLegacyBlocked || ((input) => input?.blocked === true && !["done", "cancelled"].includes(input.status) ? { ...input, status: "blocked" } : input);
    const completeStatus = helpers.completeStatus || ((status) => status === "done");
    const itemDurationDays = helpers.itemDurationDays || ((input) => {
      const duration = input.plannedDurationDays;
      if (duration !== null && duration !== void 0 && String(duration).trim() !== "" && Number.isFinite(Number(duration)) && Number(duration) >= 0) return Number(duration);
      if (!input.plannedStartAt || !input.dueAt) return 0;
      const start = /* @__PURE__ */ new Date(`${input.plannedStartAt.slice(0, 10)}T12:00:00Z`);
      const due = /* @__PURE__ */ new Date(`${input.dueAt.slice(0, 10)}T12:00:00Z`);
      const days = (due - start) / 864e5;
      return Number.isFinite(days) && days >= 0 ? days + 1 : 0;
    });
    const inclusiveFinishDate = helpers.inclusiveFinishDate || ((start, duration) => {
      if (!start) return "";
      const date = /* @__PURE__ */ new Date(`${String(start).slice(0, 10)}T12:00:00`);
      if (!Number.isFinite(date.getTime())) return "";
      date.setDate(date.getDate() + Math.max(0, Math.ceil(Number(duration)) - 1));
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    });
    const snapshot = () => ({
      items: copy(state.items),
      relations: copy(state.relations),
      events: copy(state.events || []),
      archivedRelations: copy(state.archivedRelations || [])
    });
    const restore = (before) => {
      state.items = before.items;
      state.relations = before.relations;
      state.events = before.events;
      state.archivedRelations = before.archivedRelations;
    };
    const wrap = (operation) => (...args) => {
      try {
        return operation(...args);
      } catch (error) {
        if (error instanceof DomainError || Number.isInteger(error?.status) && typeof error?.code === "string") throw error;
        throw new DomainError(422, "DOMAIN_VALIDATION", error?.message || String(error));
      }
    };
    const requireSchedule = () => {
      const result = schedule();
      if (!result?.valid) throw new Error(result?.message || "Cronograma inv\xE1lido.");
      return result;
    };
    function createItem(input) {
      input = normalizeLegacyBlocked2(input) || input;
      if (!canCreate(actor, input)) throw new Error("Sua regra GPO n\xE3o permite criar itens neste escopo.");
      validateItemInput2(input);
      if (input.type === "approval" && ["correction", "under_review"].includes(input.status) && !input.templateInstance)
        throw new Error("A etapa deve entrar no fluxo antes de receber uma decis\xE3o.");
      if (input.parentId && !canEdit(actor, getItem(input.parentId))) throw new Error("Sem permiss\xE3o para alterar o item pai.");
      if (!canCreate(actor, { ...input, createdBy: actor.id })) throw new Error("O escopo do novo item n\xE3o est\xE1 autorizado.");
      const before = snapshot();
      try {
        const started = input.plannedStartAt || today();
        const duration = input.plannedDurationDays === null ? null : itemDurationDays(input);
        const item = {
          id: id2("item"),
          title: input.title,
          type: input.type || "task",
          status: input.blocked === true ? "blocked" : input.status || "backlog",
          blocked: false,
          blockedReason: input.blocked === true ? String(input.blockedReason || "").trim() : "",
          blockedAt: input.blocked === true || input.status === "blocked" ? nowIso() : "",
          priority: input.priority || "media",
          ownerId: input.ownerId,
          createdBy: actor.id,
          organizationId: input.organizationId,
          sectorId: input.sectorId,
          state: input.state,
          parentId: input.parentId || "",
          sortOrder: Number(input.sortOrder ?? state.items.filter((entry) => entry.parentId === (input.parentId || "")).length * 100),
          description: input.description || "",
          plannedStartAt: started,
          dueAt: input.dueAt || "",
          plannedDurationDays: duration,
          baselineStartAt: started,
          baselineDueAt: input.baselineDueAt || input.dueAt || (duration === null ? "" : inclusiveFinishDate(started, duration)),
          replannedDueAt: "",
          targetStartAt: input.targetStartAt || "",
          targetDueAt: input.targetDueAt || "",
          weight: Number(input.weight ?? 1),
          progressPercent: Number(input.progressPercent ?? (completeStatus(input.status) ? 100 : 0)),
          completedAt: completeStatus(input.status) ? nowIso() : "",
          actualStartAt: "",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          lastChangeAt: nowIso()
        };
        state.items.push(item);
        createEvent(item.id, "created", "", item.status, "Item criado.", item.createdAt);
        if (item.status === "blocked") createEvent(item.id, "status_changed", "", "blocked", "Bloqueio registrado na cria\xE7\xE3o.", item.createdAt);
        requireSchedule();
        if (item.parentId) helpers.syncParentSummary?.(item.parentId);
        return item;
      } catch (error) {
        restore(before);
        throw error;
      }
    }
    function updateItem(itemId, input, effectiveAt = nowIso(), comment = "") {
      const item = getItem(itemId);
      if (!item) throw new Error("Item n\xE3o encontrado.");
      allowed("edit_item", item, "Sua regra GPO n\xE3o permite editar este item.");
      input = normalizeLegacyBlocked2(input, item.status) || input;
      if (item.status === "blocked" && input.status !== void 0 && input.status !== "blocked") {
        if ((item.inheritedBlockedFrom || []).length) throw new Error("Resolva as fontes do bloqueio herdado antes de liberar esta atividade.");
        if (!String(comment || "").trim()) throw new Error("Informe no coment\xE1rio o motivo do desbloqueio.");
      }
      if (input.ownerId !== void 0 && input.ownerId !== item.ownerId) {
        const owner = state.users.find((entry) => entry.id === input.ownerId);
        if (owner) input = { ...input, organizationId: owner.organizationId || input.organizationId, sectorId: owner.sectorId || input.sectorId, state: owner.state || input.state };
      }
      validateItemInput2(input, item);
      if (!Number.isFinite(new Date(effectiveAt).getTime())) throw new Error("Informe a data e hora da mudan\xE7a.");
      if (item.type === "approval" && input.status !== item.status)
        throw new Error("Use a aba Aprova\xE7\xE3o para enviar, aprovar, reprovar ou iniciar uma corre\xE7\xE3o.");
      if (item.type === "approval" && input.type !== "approval" && ["under_review", "correction"].includes(item.status))
        throw new Error("Conclua a decis\xE3o de aprova\xE7\xE3o em andamento antes de mudar o tipo do item.");
      if (input.type !== "approval" && ["under_review", "correction"].includes(input.status) && input.status !== item.status)
        throw new Error("Em an\xE1lise e Em corre\xE7\xE3o pertencem ao fluxo de aprova\xE7\xE3o.");
      const startsApproval = input.type === "approval" && item.type !== "approval";
      if (input.status === "cancelled") input = { ...input, progressPercent: item.progressPercent ?? 0 };
      else if (Number(input.progressPercent ?? item.progressPercent ?? 0) === 100 && input.status !== "blocked" && item.status !== "blocked" && item.type !== "approval") input = { ...input, status: "done" };
      else if (Number(input.progressPercent ?? item.progressPercent ?? 0) > 0 && ["backlog", "ready"].includes(input.status)) input = { ...input, status: "in_progress" };
      const wasComplete = completeStatus(item.status);
      const complete = completeStatus(input.status);
      if (wasComplete && !complete && (input.progressPercent === void 0 || Number(input.progressPercent) === Number(item.progressPercent)))
        throw new Error("Informe um novo percentual ao reabrir uma atividade conclu\xEDda.");
      if (complete) input = { ...input, progressPercent: 100 };
      if (input.status === "cancelled") input = { ...input, progressPercent: item.progressPercent ?? 0 };
      if (wasComplete && complete && ((input.plannedStartAt ?? item.plannedStartAt) !== item.plannedStartAt || (input.dueAt ?? item.dueAt) !== item.dueAt))
        throw new Error("As datas previstas ficam bloqueadas ap\xF3s a conclus\xE3o.");
      const hasActiveChildren = state.items.some((entry) => entry.parentId === item.id && !entry.archivedAt);
      const calculated = ["status", "progressPercent", "plannedStartAt", "dueAt", "plannedDurationDays"];
      const attempted = calculated.filter((field) => input[field] !== void 0 && input[field] !== item[field]);
      if (hasActiveChildren && attempted.length) throw new Error(`Estas propriedades do pai s\xE3o calculadas pelos filhos e n\xE3o podem ser editadas: ${attempted.join(", ")}.`);
      if (!canEdit(actor, { ...item, ...input })) throw new Error("O novo contexto deve permanecer dentro das regras GPO.");
      const before = snapshot();
      const eventTypes = {
        title: "title_changed",
        type: "type_changed",
        status: "status_changed",
        ownerId: "owner_changed",
        dueAt: "due_changed",
        plannedStartAt: "start_changed",
        plannedDurationDays: "duration_changed",
        replannedDueAt: "replanned_due_changed",
        targetStartAt: "target_start_changed",
        targetDueAt: "target_due_changed",
        weight: "weight_changed",
        progressPercent: "progress_changed",
        description: "description_changed",
        organizationId: "context_changed",
        sectorId: "context_changed",
        state: "context_changed"
      };
      let changed = false;
      try {
        if (startsApproval) {
          item.approvalRound || (item.approvalRound = 1);
          item.approvalReviewerId || (item.approvalReviewerId = input.ownerId || "");
        }
        for (const field of Object.keys(eventTypes)) {
          if (input[field] === void 0 && item[field] === void 0) continue;
          const rawNext = input[field] ?? item[field];
          const next = field === "plannedDurationDays" && (rawNext === null || rawNext === "") ? null : ["weight", "plannedDurationDays"].includes(field) || field === "progressPercent" && rawNext !== null ? Number(rawNext) : rawNext;
          if (next === item[field]) continue;
          const operation = field === "ownerId" ? "change_owner" : ["dueAt", "plannedStartAt", "plannedDurationDays", "replannedDueAt", "targetStartAt", "targetDueAt"].includes(field) ? "change_duration" : field === "weight" ? "change_weight" : null;
          if (operation) allowed(operation, item, "O GPO n\xE3o permite esta altera\xE7\xE3o neste escopo.");
        }
        for (const field of Object.keys(eventTypes)) {
          if (input[field] === void 0 && item[field] === void 0) continue;
          let next = input[field] ?? item[field];
          if (field === "plannedDurationDays" && (next === null || next === "")) next = null;
          else if (["weight", "plannedDurationDays", "progressPercent"].includes(field)) next = Number(next);
          if (next === item[field]) continue;
          const contextLabels = { organizationId: "Empresa", sectorId: "Setor", state: "UF" };
          createEvent(itemId, eventTypes[field], item[field], next, eventTypes[field] === "context_changed" ? contextLabels[field] : "", effectiveAt);
          item[field] = next;
          changed = true;
        }
        if (item.status === "blocked" && !item.blockedAt) item.blockedAt = effectiveAt;
        if (item.status !== "blocked") {
          item.blocked = false;
          item.blockedAt = "";
        }
        if (complete && !wasComplete) {
          item.completedAt = effectiveAt;
          createEvent(itemId, "completed", "", item.status, "", effectiveAt);
        }
        if (wasComplete && !complete) {
          item.completedAt = "";
          createEvent(itemId, "reopened", "done", item.status, "Item reaberto.", effectiveAt);
        }
        if (item.status === "in_progress" && !item.actualStartAt) {
          item.actualStartAt = effectiveAt;
          createEvent(itemId, "started", "", effectiveAt, "Atividade iniciada.", effectiveAt);
          changed = true;
        }
        if (comment.trim()) {
          createEvent(itemId, "comment", "", "", comment.trim(), effectiveAt);
          changed = true;
        }
        if (changed && item.blockedByPropagation && item.status !== "blocked") {
          item.blockedByPropagation = false;
          item.statusBeforeInheritedBlock = "";
          item.manualBlockOverride = true;
        }
        if (input.blockedReason !== void 0 && item.blockedReason !== String(input.blockedReason)) {
          createEvent(itemId, "blocked_reason_changed", item.blockedReason || "", String(input.blockedReason), "Motivo do impedimento atualizado.", effectiveAt);
          item.blockedReason = String(input.blockedReason);
          changed = true;
        }
        if (changed && item.status === "blocked" && input.status === "blocked" && item.blockedByPropagation) {
          item.blockedByPropagation = false;
          item.manualBlockOverride = false;
        }
        if (changed) {
          item.updatedAt = nowIso();
          item.lastChangeAt = effectiveAt;
          helpers.recalculateBlocking?.(effectiveAt);
          if (item.parentId) helpers.syncParentSummary?.(item.parentId, effectiveAt);
          requireSchedule();
        }
        return changed;
      } catch (error) {
        restore(before);
        throw error;
      }
    }
    function createRelation(sourceId, targetId, relationType, lagDays = 0, description = "") {
      if (relationType === "contains") {
        const changed = moveItemHierarchy(targetId, sourceId);
        return { id: `derived-contains-${sourceId}-${targetId}`, sourceId, targetId, relationType, derived: true, changed };
      }
      const source = getItem(sourceId), target = getItem(targetId);
      if (!source || !target || sourceId === targetId) throw new Error("Escolha dois itens diferentes.");
      if (!(helpers.relationTypes || ["TI"]).some((type) => (typeof type === "string" ? type : type.id) === relationType)) throw new Error("Tipo de rela\xE7\xE3o inv\xE1lido.");
      if (!canEdit(actor, source) || !granted("create_relation", source)) throw new Error("Sem permiss\xE3o para criar esta rela\xE7\xE3o a partir da origem.");
      if (!Number.isFinite(Number(lagDays))) throw new Error("Informe uma defasagem num\xE9rica.");
      if (state.relations.some((relation2) => relation2.sourceId === sourceId && relation2.targetId === targetId && relation2.relationType === relationType)) throw new Error("Essa rela\xE7\xE3o j\xE1 existe.");
      const relation = {
        id: id2("rel"),
        sourceId,
        targetId,
        relationType,
        lagDays: Number(lagDays) || 0,
        description: String(description || "").trim(),
        createdBy: actor?.id || "system",
        createdAt: nowIso()
      };
      const before = snapshot();
      state.relations.push(relation);
      try {
        requireSchedule();
        createEvent(targetId, "relation_created", "", relationType, relation.description || `Rela\xE7\xE3o criada a partir de ${source.title}.`);
        if (relationType === "TI") helpers.recalculateBlocking?.();
        return relation;
      } catch (error) {
        restore(before);
        throw error;
      }
    }
    function updateRelation(relationId, input) {
      const relation = state.relations.find((entry) => entry.id === relationId);
      if (!relation) throw new Error("Rela\xE7\xE3o n\xE3o encontrada.");
      const source = getItem(input.sourceId), target = getItem(input.targetId);
      if (!source || !target || source.id === target.id) throw new Error("Escolha dois itens diferentes.");
      if (!(helpers.relationTypes || ["TI", "contains"]).some((type) => (typeof type === "string" ? type : type.id) === input.relationType)) throw new Error("Tipo de rela\xE7\xE3o inv\xE1lido.");
      if (!canEdit(actor, getItem(relation.sourceId)) || !canEdit(actor, getItem(relation.targetId)) || !canEdit(actor, source) || !canEdit(actor, target)) throw new Error("O GPO n\xE3o permite alterar esta rela\xE7\xE3o ou seus itens.");
      allowed("edit_relation", target, "O GPO n\xE3o permite alterar rela\xE7\xF5es neste escopo.");
      if (!Number.isFinite(Number(input.lagDays))) throw new Error("Informe uma defasagem num\xE9rica.");
      if (state.relations.some((entry) => entry.id !== relationId && entry.sourceId === source.id && entry.targetId === target.id && entry.relationType === input.relationType)) throw new Error("Esta rela\xE7\xE3o j\xE1 existe.");
      if (input.relationType === "contains") {
        let cursor = source;
        const seen = /* @__PURE__ */ new Set();
        while (cursor && !seen.has(cursor.id)) {
          if (cursor.id === target.id) throw new Error("A hierarquia n\xE3o pode conter ciclos.");
          seen.add(cursor.id);
          cursor = getItem(cursor.parentId);
        }
        const existingParent = relation.relationType === "contains" && relation.targetId === target.id ? relation.sourceId : "";
        if (target.parentId && target.parentId !== source.id && target.parentId !== existingParent)
          throw new Error("O item de destino j\xE1 possui outro pai.");
      }
      const beforeState = snapshot();
      const before = { ...relation };
      const affectedParents = /* @__PURE__ */ new Set();
      try {
        if (relation.relationType === "contains" && (relation.sourceId !== source.id || relation.targetId !== target.id || input.relationType !== "contains")) {
          const priorTarget = getItem(relation.targetId);
          if (priorTarget?.parentId === relation.sourceId) {
            priorTarget.parentId = "";
            affectedParents.add(relation.sourceId);
          }
        }
        Object.assign(relation, {
          sourceId: source.id,
          targetId: target.id,
          relationType: input.relationType,
          lagDays: Number(input.lagDays) || 0,
          description: String(input.description || "").trim(),
          updatedAt: nowIso(),
          updatedBy: actor.id,
          previousSourceId: before.sourceId,
          previousTargetId: before.targetId,
          previousRelationType: before.relationType
        });
        if (input.relationType === "contains") {
          if (!target.parentId || target.parentId === source.id) target.parentId = source.id;
          affectedParents.add(source.id);
        }
        requireSchedule();
        if (before.relationType === "contains") syncContainsRelations(before.targetId);
        if (relation.relationType === "contains") syncContainsRelations(target.id);
        if (before.relationType !== relation.relationType)
          createEvent(target.id, "relation_updated", before.relationType, relation.relationType, `Rela\xE7\xE3o com ${source.title}.`);
        if (Number(before.lagDays || 0) !== Number(relation.lagDays || 0))
          createEvent(target.id, "relation_lag_changed", String(Number(before.lagDays || 0)), String(Number(relation.lagDays || 0)), `Defasagem da rela\xE7\xE3o com ${source.title}.`);
        if ((before.description || "") !== (relation.description || ""))
          createEvent(target.id, "relation_description_changed", before.description || "", relation.description || "", `Descri\xE7\xE3o da rela\xE7\xE3o com ${source.title}.`);
        if (before.sourceId !== source.id) createEvent(target.id, "relation_retargeted", before.sourceId, source.id, "Origem da rela\xE7\xE3o alterada.");
        if (target.id !== before.targetId) {
          createEvent(before.targetId, "relation_retargeted", before.targetId, target.id, "Rela\xE7\xE3o transferida para outro item.");
          createEvent(target.id, "relation_retargeted", before.targetId, target.id, relation.description || "Rela\xE7\xE3o transferida para este item.");
        }
        for (const parentId of affectedParents) helpers.syncParentSummary?.(parentId);
        return relation;
      } catch (error) {
        restore(beforeState);
        throw error;
      }
    }
    function moveItemHierarchy(itemId, nextParentId = "") {
      const item = getItem(itemId), nextParent = nextParentId ? getItem(nextParentId) : null;
      if (!item) throw new Error("Item n\xE3o encontrado.");
      if (nextParentId && !nextParent) throw new Error("Novo item pai n\xE3o encontrado.");
      if (!canChangeHierarchy(actor, item) || nextParent && !canEdit(actor, nextParent)) throw new Error("O GPO n\xE3o permite alterar esta hierarquia.");
      if ((item.parentId || "") === nextParentId) return false;
      for (let cursor = nextParent, seen = /* @__PURE__ */ new Set(); cursor && !seen.has(cursor.id); cursor = getItem(cursor.parentId)) {
        if (cursor.id === item.id) throw new Error("A hierarquia n\xE3o pode conter ciclos.");
        seen.add(cursor.id);
      }
      const before = snapshot();
      try {
        const previousParentId = item.parentId || "";
        item.parentId = nextParent?.id || "";
        syncContainsRelations(item.id);
        const siblings = state.items.filter((entry) => entry.id !== item.id && entry.parentId === item.parentId);
        item.sortOrder = siblings.length ? Math.max(...siblings.map((entry) => Number(entry.sortOrder ?? state.items.indexOf(entry)))) + 100 : 0;
        createEvent(item.id, "parent_changed", previousParentId, nextParentId, "Hierarquia visual alterada.");
        const pending = [item.id], visited = /* @__PURE__ */ new Set();
        while (pending.length) {
          const currentId = pending.shift();
          if (visited.has(currentId)) continue;
          visited.add(currentId);
          syncContainsRelations(currentId);
          state.items.filter((entry) => entry.parentId === currentId).forEach((child) => pending.push(child.id));
        }
        if (previousParentId) helpers.syncParentSummary?.(previousParentId);
        if (nextParentId) helpers.syncParentSummary?.(nextParentId);
        requireSchedule();
        return true;
      } catch (error) {
        restore(before);
        throw error;
      }
    }
    function reorderItem(itemId, targetId, after = false) {
      const item = getItem(itemId), target = getItem(targetId);
      if (!item || !target || item.id === target.id) return false;
      if (item.parentId !== target.parentId) throw new Error("A ordena\xE7\xE3o mant\xE9m os itens no mesmo n\xEDvel hier\xE1rquico.");
      if (!canChangeHierarchy(actor, item) || !canChangeHierarchy(actor, target)) throw new Error("O GPO n\xE3o permite reordenar estes itens.");
      const siblings = state.items.filter((entry) => entry.parentId === item.parentId).sort((a, b) => Number(a.sortOrder ?? state.items.indexOf(a)) - Number(b.sortOrder ?? state.items.indexOf(b)));
      const from = siblings.findIndex((entry) => entry.id === itemId), to = siblings.findIndex((entry) => entry.id === targetId);
      siblings.splice(from, 1);
      siblings.splice(Math.max(0, to + (after ? 1 : 0) - (from < to ? 1 : 0)), 0, item);
      siblings.forEach((entry, index) => {
        const next = index * 100;
        if (entry.sortOrder !== next) {
          createEvent(entry.id, "order_changed", entry.sortOrder ?? "", next, "Ordem visual atualizada.");
          entry.sortOrder = next;
        }
      });
      return true;
    }
    function removeRelation(relationId) {
      const relation = state.relations.find((entry) => entry.id === relationId);
      if (!relation) throw new Error("Rela\xE7\xE3o n\xE3o encontrada.");
      const source = getItem(relation.sourceId), target = getItem(relation.targetId);
      if (relation.relationType === "TI") {
        if (!canEdit(actor, source)) throw new Error("Somente quem pode editar a origem pode remover esta TI.");
      } else if (!granted("delete_relation", target) || !canEdit(actor, source) || !canEdit(actor, target)) {
        throw new Error("Sem permiss\xE3o para alterar esta rela\xE7\xE3o hier\xE1rquica.");
      }
      if (relation.relationType === "contains" && target) target.parentId = "";
      createEvent(relation.targetId, "relation_removed", relation.relationType, "", `Rela\xE7\xE3o com ${source?.title || "item"} removida.`);
      if (helpers.archiveRecord) helpers.archiveRecord("archivedRelations", relation);
      else state.archivedRelations.push({ ...relation, removedAt: nowIso(), removedBy: actor.id });
      state.relations = state.relations.filter((entry) => entry.id !== relationId);
      schedule();
      helpers.recalculateBlocking?.();
    }
    return {
      createItem: wrap(createItem),
      updateItem: wrap(updateItem),
      createRelation: wrap(createRelation),
      updateRelation: wrap(updateRelation),
      removeRelation: wrap(removeRelation),
      moveItemHierarchy: wrap(moveItemHierarchy),
      reorderItem: wrap(reorderItem)
    };
  }

  // src/domain-item-validation.mjs
  var itemTypeIds = [
    "project",
    "process",
    "stage",
    "substage",
    "task",
    "approval",
    "deliverable",
    "milestone",
    "document"
  ];
  var statusIds = [
    "backlog",
    "ready",
    "in_progress",
    "waiting",
    "blocked",
    "under_review",
    "correction",
    "done",
    "cancelled"
  ];
  function normalizeLegacyBlocked(input) {
    if (input?.blocked === true && input.status !== "done" && input.status !== "cancelled") {
      return { ...input, status: "blocked" };
    }
    return input;
  }
  function validateItemInput(input, existing = null, state) {
    if (!state || !Array.isArray(state.organizations) || !Array.isArray(state.sectors) || !Array.isArray(state.users)) {
      throw new TypeError("validateItemInput requires workspace organizations, sectors, and users");
    }
    if (!input.title?.trim()) throw new Error("Informe o nome do item.");
    if (!input.ownerId) throw new Error("Selecione um respons\xE1vel.");
    if (input.status === "blocked" && !existing?.blockedByPropagation && !String(input.blockedReason ?? existing?.blockedReason ?? "").trim()) {
      throw new Error("Informe o motivo do bloqueio manual.");
    }
    if (!itemTypeIds.includes(input.type)) throw new Error("Tipo de item inv\xE1lido.");
    if (input.status !== void 0 && !statusIds.includes(input.status)) throw new Error("Status inv\xE1lido.");
    if (!state.organizations.some((organization) => organization.id === input.organizationId)) {
      throw new Error("Selecione uma empresa.");
    }
    if (!state.sectors.some((sector) => sector.id === input.sectorId && sector.organizationId === input.organizationId)) {
      throw new Error("Cadastre ou selecione um setor desta empresa.");
    }
    if (!/^[A-Z]{2}$/.test(input.state || "")) throw new Error("Informe a UF com duas letras.");
    if (input.ownerId && !state.users.some((user) => user.id === input.ownerId && (!user.disabled || existing?.ownerId === user.id))) {
      throw new Error("Selecione um respons\xE1vel ativo.");
    }
    if (input.weight !== void 0 && (!Number.isFinite(Number(input.weight)) || Number(input.weight) <= 0)) {
      throw new Error("O peso deve ser maior que zero.");
    }
    if (input.progressPercent !== void 0 && (!Number.isFinite(Number(input.progressPercent)) || Number(input.progressPercent) < 0 || Number(input.progressPercent) > 100)) {
      throw new Error("O percentual deve ficar entre 0 e 100.");
    }
    if (input.plannedDurationDays !== void 0 && input.plannedDurationDays !== null && input.plannedDurationDays !== "" && (!Number.isFinite(Number(input.plannedDurationDays)) || Number(input.plannedDurationDays) < 0)) {
      throw new Error("A dura\xE7\xE3o deve ser um n\xFAmero de dias corridos igual ou maior que zero.");
    }
    if (input.replannedDueAt && (!/^\d{4}-\d{2}-\d{2}$/.test(input.replannedDueAt) || !Number.isFinite((/* @__PURE__ */ new Date(`${input.replannedDueAt}T12:00:00`)).getTime()))) {
      throw new Error("Informe uma data v\xE1lida para a repactua\xE7\xE3o.");
    }
    for (const field of ["targetStartAt", "targetDueAt"]) {
      if (input[field] && (!/^\d{4}-\d{2}-\d{2}$/.test(input[field]) || !Number.isFinite((/* @__PURE__ */ new Date(`${input[field]}T12:00:00`)).getTime()))) {
        throw new Error("Informe uma data-meta v\xE1lida.");
      }
    }
    const targetStart = input.targetStartAt || existing?.targetStartAt || existing?.baselineStartAt || "";
    const targetEnd = input.targetDueAt || existing?.targetDueAt || existing?.baselineDueAt || "";
    if (targetStart && targetEnd && targetEnd < targetStart) {
      throw new Error("O t\xE9rmino-meta n\xE3o pode ser anterior ao in\xEDcio-meta.");
    }
    for (const field of ["plannedStartAt", "dueAt"]) {
      if (input[field] && (!/^\d{4}-\d{2}-\d{2}$/.test(input[field]) || !Number.isFinite((/* @__PURE__ */ new Date(`${input[field]}T12:00:00`)).getTime()))) {
        throw new Error("Informe uma data v\xE1lida.");
      }
    }
    const changedDates = !existing || existing.plannedStartAt !== input.plannedStartAt || existing.dueAt !== input.dueAt;
    if (changedDates && input.plannedStartAt && input.dueAt && input.dueAt < input.plannedStartAt) {
      throw new Error("O t\xE9rmino ideal deve ser igual ou posterior ao in\xEDcio previsto.");
    }
  }

  // src/domain-approval-template.mjs
  function createApprovalTemplateOperations(deps) {
    const {
      state,
      currentUser,
      authorize,
      canSubmitApproval,
      canDecideApproval,
      approvalGate,
      canEditItem,
      canViewItem,
      canManageGpo,
      canCreateItem,
      itemTreeIds,
      createEvent,
      registryEvent,
      createItem,
      createRelation,
      recalculatePlannedDates,
      syncParentSummary,
      id: id2,
      nowIso,
      today = () => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      shiftedDate: shiftedDate2 = defaultShiftedDate,
      inclusiveFinishDate = defaultInclusiveFinishDate,
      inclusiveDurationDays: inclusiveDurationDays2 = defaultInclusiveDurationDays,
      completeStatus = (status) => status === "done"
    } = deps;
    for (const key of ["state", "currentUser", "id", "nowIso", "createEvent", "registryEvent"])
      if (!deps[key]) throw new TypeError(`Missing approval/template dependency: ${key}`);
    const getItem = (itemId) => state.items.find((item) => item.id === itemId);
    const isAuthorized = (operation, item) => {
      const result = authorize(operation, item);
      return result === true || result?.allowed === true;
    };
    const setApprovalStatus = (item, nextStatus, eventType, comment = "") => {
      const previous = item.status;
      item.status = nextStatus;
      if (completeStatus(nextStatus)) item.progressPercent = 100;
      item.updatedAt = nowIso();
      item.lastChangeAt = item.updatedAt;
      item.completedAt = completeStatus(nextStatus) ? item.updatedAt : "";
      createEvent(item.id, eventType, previous, nextStatus, comment, item.updatedAt);
    };
    function submitApprovalForReview(itemId, note = "") {
      const item = getItem(itemId), user = currentUser();
      if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprova\xE7\xE3o.");
      if (!canSubmitApproval(user, item)) throw new Error("Sua regra GPO n\xE3o permite enviar esta etapa para aprova\xE7\xE3o.");
      if (!approvalGate(item).released) throw new Error("A aprova\xE7\xE3o ainda depende da conclus\xE3o de suas predecessoras.");
      if (!["backlog", "ready", "in_progress", "correction"].includes(item.status)) throw new Error("Esta etapa n\xE3o est\xE1 pronta para ser enviada.");
      if (item.status === "correction" && item.correctionOwnerId !== user.id && !isAuthorized("decide_approval", item))
        throw new Error("Somente o respons\xE1vel pela corre\xE7\xE3o ou usu\xE1rio autorizado no GPO pode reenviar esta etapa.");
      item.approvalRound || (item.approvalRound = 1);
      const reason = note.trim();
      state.approvalDecisions || (state.approvalDecisions = []);
      const submission = {
        id: id2("decision"),
        itemId: item.id,
        requestId: item.approvalRequestId || item.id,
        round: item.approvalRound,
        kind: "submitted",
        outcome: "under_review",
        reviewerId: item.approvalReviewerId || item.ownerId || "",
        correctionOwnerId: item.correctionOwnerId || "",
        reason,
        previousDecisionId: item.lastDecisionId || "",
        createdBy: user.id,
        createdAt: nowIso()
      };
      item.approvalRequestId || (item.approvalRequestId = item.id);
      state.approvalDecisions.push(submission);
      setApprovalStatus(item, "under_review", "approval_submitted", reason || "Etapa enviada para decis\xE3o.");
      return submission;
    }
    function decideApproval(itemId, outcome, reason = "", correctionOwnerId = "") {
      const item = getItem(itemId), user = currentUser(), cleanReason = reason.trim();
      if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprova\xE7\xE3o.");
      if (!canDecideApproval(user, item)) throw new Error("Apenas o respons\xE1vel pela decis\xE3o ou uma regra GPO autorizada pode decidir.");
      if (item.status !== "under_review") throw new Error("Esta etapa n\xE3o est\xE1 aguardando decis\xE3o.");
      if (!approvalGate(item).released) throw new Error("A aprova\xE7\xE3o ainda depende da conclus\xE3o de suas predecessoras.");
      if (!["approved", "rejected"].includes(outcome)) throw new Error("Selecione aprovar ou reprovar.");
      if (outcome === "rejected" && !cleanReason) throw new Error("Informe o motivo da reprova\xE7\xE3o.");
      let correctionOwner = null;
      if (outcome === "rejected") {
        correctionOwner = state.users.find((entry) => entry.id === correctionOwnerId && !entry.disabled && entry.organizationId === item.organizationId);
        if (!correctionOwner) throw new Error("Selecione um respons\xE1vel ativo da mesma empresa para a corre\xE7\xE3o.");
      }
      state.approvalDecisions || (state.approvalDecisions = []);
      const decision = {
        id: id2("decision"),
        itemId: item.id,
        requestId: item.approvalRequestId || item.id,
        round: item.approvalRound || 1,
        kind: "decision",
        outcome,
        reviewerId: user.id,
        correctionOwnerId: correctionOwner?.id || item.correctionOwnerId || "",
        reason: cleanReason,
        previousDecisionId: item.lastDecisionId || "",
        createdBy: user.id,
        createdAt: nowIso()
      };
      state.approvalDecisions.push(decision);
      item.lastDecisionId = decision.id;
      if (outcome === "approved") {
        decision.revisionId = item.id;
        setApprovalStatus(item, "done", "approval_decided", cleanReason || "Aprovado e conclu\xEDdo.");
        return decision;
      }
      const originalParent = item.parentId || "", round = (item.approvalRound || 1) + 1;
      item.approvalRound = round;
      item.correctionOwnerId = correctionOwner.id;
      item.superseded = false;
      const startDate = item.plannedStartAt || today(), timestamp = nowIso();
      const correction = {
        id: id2("item"),
        title: `Corrigir: ${item.title}`,
        type: "task",
        status: "backlog",
        blocked: false,
        blockedReason: "",
        blockedAt: "",
        priority: "media",
        ownerId: correctionOwner.id,
        createdBy: correctionOwner.id,
        organizationId: correctionOwner.organizationId,
        sectorId: correctionOwner.sectorId,
        state: correctionOwner.state || item.state,
        parentId: originalParent,
        sortOrder: state.items.filter((entry) => entry.parentId === originalParent).length * 100,
        description: cleanReason,
        plannedStartAt: startDate,
        dueAt: startDate,
        plannedDurationDays: 1,
        baselineStartAt: startDate,
        baselineDueAt: startDate,
        replannedDueAt: "",
        weight: 1,
        progressPercent: 0,
        completedAt: "",
        actualStartAt: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        lastChangeAt: timestamp,
        correctionFor: item.id,
        approvalRound: round
      };
      state.items.push(correction);
      const relation = {
        id: id2("rel"),
        sourceId: correction.id,
        targetId: item.id,
        relationType: "TI",
        lagDays: 0,
        description: "Corre\xE7\xE3o obrigat\xF3ria antes do reenvio.",
        createdBy: user.id,
        createdAt: timestamp
      };
      state.relations.push(relation);
      item.correctionItemId = correction.id;
      decision.correctionItemId = correction.id;
      createEvent(correction.id, "created", "", correction.title, "Corre\xE7\xE3o vinculada \xE0 aprova\xE7\xE3o original.");
      createEvent(item.id, "relation_created", "", "TI", "Corre\xE7\xE3o vinculada por preced\xEAncia TI.");
      recalculatePlannedDates();
      setApprovalStatus(item, "correction", "approval_decided", cleanReason);
      createEvent(correction.id, "approval_revision_started", item.id, correction.id, cleanReason);
      syncParentSummary(originalParent);
      return decision;
    }
    function reopenApproval(itemId, note = "", progressPercent) {
      const item = getItem(itemId), user = currentUser(), cleanNote = note.trim(), progress = Number(progressPercent);
      if (!item || item.type !== "approval" || item.status !== "done") throw new Error("Somente uma aprova\xE7\xE3o conclu\xEDda pode ser reaberta.");
      if (!canDecideApproval(user, item)) throw new Error("Sua regra GPO n\xE3o permite reabrir esta aprova\xE7\xE3o.");
      if (!cleanNote) throw new Error("Descreva o motivo da reabertura.");
      if (!Number.isFinite(progress) || progress < 0 || progress >= 100 || progress === Number(item.progressPercent))
        throw new Error("Informe um novo percentual entre 0% e 99% ao reabrir a aprova\xE7\xE3o.");
      item.approvalRound = (item.approvalRound || 1) + 1;
      state.approvalDecisions || (state.approvalDecisions = []);
      const reopened = {
        id: id2("decision"),
        itemId: item.id,
        requestId: item.approvalRequestId || item.id,
        round: item.approvalRound,
        kind: "reopened",
        outcome: "backlog",
        reviewerId: item.ownerId || "",
        correctionOwnerId: item.ownerId || "",
        reason: cleanNote,
        previousDecisionId: item.lastDecisionId || "",
        createdBy: user.id,
        createdAt: nowIso()
      };
      state.approvalDecisions.push(reopened);
      setApprovalStatus(item, "backlog", "approval_reopened", cleanNote);
      createEvent(item.id, "progress_changed", 100, progress, "Percentual informado ao reabrir a aprova\xE7\xE3o.");
      item.progressPercent = progress;
      return reopened;
    }
    function saveFlowTemplate(rootId, name) {
      const root = getItem(rootId), user = currentUser();
      if (!root || !canEditItem(user, root)) throw new Error("Sua regra GPO n\xE3o permite salvar este fluxo como modelo.");
      const ids = itemTreeIds(/* @__PURE__ */ new Set([rootId]));
      const eligibleItems = state.items.filter((item) => ids.has(item.id) && canViewItem(user, item));
      if (eligibleItems.length !== ids.size || eligibleItems.some((item) => !canEditItem(user, item)))
        throw new Error("Edite todos os itens do fluxo antes de criar um modelo.");
      const children = /* @__PURE__ */ new Map();
      for (const item of eligibleItems) {
        if (!children.has(item.parentId)) children.set(item.parentId, []);
        children.get(item.parentId).push(item);
      }
      for (const siblings of children.values()) siblings.sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0));
      const sourceItems = [], visited = /* @__PURE__ */ new Set(), pending = [root];
      while (pending.length) {
        const item = pending.pop();
        if (visited.has(item.id)) throw new Error("A estrutura do modelo cont\xE9m um ciclo.");
        visited.add(item.id);
        sourceItems.push(item);
        pending.push(...[...children.get(item.id) || []].reverse());
      }
      if (sourceItems.length !== eligibleItems.length) throw new Error("A estrutura do modelo cont\xE9m um item sem pai v\xE1lido.");
      const baseDate = root.plannedStartAt || today();
      const items = sourceItems.map((item) => ({
        key: item.id,
        parentKey: ids.has(item.parentId) ? item.parentId : "",
        title: item.title,
        type: item.type,
        status: item.status,
        ownerId: item.ownerId || "",
        description: item.description || "",
        plannedDurationDays: item.plannedDurationDays == null || item.plannedDurationDays === "" ? null : Number(item.plannedDurationDays),
        startOffset: Math.round((/* @__PURE__ */ new Date(`${item.plannedStartAt || baseDate}T12:00:00`) - /* @__PURE__ */ new Date(`${baseDate}T12:00:00`)) / 864e5),
        dueOffset: item.dueAt ? Math.round((/* @__PURE__ */ new Date(`${item.dueAt}T12:00:00`) - /* @__PURE__ */ new Date(`${baseDate}T12:00:00`)) / 864e5) : null,
        weight: Number(item.weight ?? 1)
      }));
      const relations = state.relations.filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId) && relation.relationType !== "contains").map((relation) => ({ sourceKey: relation.sourceId, targetKey: relation.targetId, relationType: relation.relationType, lagDays: relation.lagDays || 0 }));
      state.templates || (state.templates = []);
      const template = { id: id2("template"), name: name.trim(), organizationId: root.organizationId, createdBy: user.id, createdAt: nowIso(), rootTitle: root.title, items, relations };
      state.templates.push(template);
      registryEvent("template", template, "Fluxo salvo como modelo.", "created");
      return template;
    }
    function applyFlowTemplate(templateId, input) {
      const user = currentUser(), template = state.templates?.find((entry) => entry.id === templateId);
      if (!template) throw new Error("Modelo n\xE3o encontrado.");
      if (template.organizationId !== user?.organizationId && !canManageGpo(user)) throw new Error("Este modelo pertence a outra empresa.");
      const parent = { type: "project", organizationId: input.organizationId, sectorId: input.sectorId, state: input.state, createdBy: user?.id };
      if (!canCreateItem(user, parent)) throw new Error("Sua regra GPO n\xE3o permite criar itens neste contexto.");
      if (!template.items?.length) throw new Error("O modelo n\xE3o cont\xE9m itens.");
      const snapshot = JSON.stringify(state);
      try {
        const ids = /* @__PURE__ */ new Map(), created = [];
        for (const source of template.items) {
          const parentId = source.parentKey ? ids.get(source.parentKey) : "";
          if (source.parentKey && !parentId) throw new Error("A estrutura do modelo est\xE1 inconsistente.");
          const eligibleOwners = state.users.filter((entry) => !entry.disabled && entry.organizationId === input.organizationId);
          const requestedOwner = input.ownerSelections?.[source.key] || source.ownerId;
          const ownerId = eligibleOwners.some((entry) => entry.id === requestedOwner) ? requestedOwner : eligibleOwners.some((entry) => entry.id === user.id) ? user.id : eligibleOwners[0]?.id || "";
          const owner = eligibleOwners.find((entry) => entry.id === ownerId);
          if (!owner) throw new Error("O modelo precisa de um respons\xE1vel ativo na empresa de destino.");
          const status = source.type === "approval" ? "backlog" : input.statusSelections?.[source.key] || source.status || "backlog";
          const plannedStartAt = shiftedDate2(input.startDate || today(), source.startOffset);
          const plannedDurationDays = Object.hasOwn(source, "plannedDurationDays") ? source.plannedDurationDays == null || source.plannedDurationDays === "" ? null : Number(source.plannedDurationDays) : source.dueOffset == null ? null : inclusiveDurationDays2(plannedStartAt, shiftedDate2(input.startDate || today(), source.dueOffset));
          const item = createItem({
            title: source.key === template.items[0].key ? input.title.trim() : source.title,
            type: source.type,
            status,
            ownerId,
            organizationId: owner.organizationId,
            sectorId: owner.sectorId,
            state: owner.state,
            parentId,
            description: source.description,
            plannedStartAt,
            plannedDurationDays,
            dueAt: plannedDurationDays === null ? "" : inclusiveFinishDate(plannedStartAt, plannedDurationDays),
            weight: source.weight ?? 1,
            progressPercent: completeStatus(status) ? 100 : 0,
            templateInstance: true
          });
          ids.set(source.key, item.id);
          created.push(item);
        }
        for (const relation of template.relations || []) {
          const sourceId = ids.get(relation.sourceKey), targetId = ids.get(relation.targetKey);
          if (!sourceId || !targetId) throw new Error("Uma rela\xE7\xE3o do modelo perdeu sua refer\xEAncia.");
          createRelation(sourceId, targetId, relation.relationType, relation.lagDays);
        }
        return { template, items: created };
      } catch (error) {
        const restored = JSON.parse(snapshot);
        for (const key of Object.keys(state)) delete state[key];
        Object.assign(state, restored);
        throw error;
      }
    }
    function removeFlowTemplate(templateId) {
      const template = state.templates?.find((entry) => entry.id === templateId), user = currentUser();
      if (!template) throw new Error("Modelo n\xE3o encontrado.");
      if (template.createdBy !== user?.id && !canManageGpo(user)) throw new Error("Somente quem criou o modelo ou algu\xE9m autorizado no GPO pode remov\xEA-lo.");
      state.templates = state.templates.filter((entry) => entry.id !== templateId);
      registryEvent("template", template, "Modelo removido.", "removed");
    }
    return { submitApprovalForReview, decideApproval, reopenApproval, saveFlowTemplate, applyFlowTemplate, removeFlowTemplate };
  }
  function defaultShiftedDate(value, offset = 0) {
    const date = /* @__PURE__ */ new Date(`${value || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}T12:00:00`);
    date.setDate(date.getDate() + Number(offset || 0));
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }
  function defaultInclusiveDurationDays(start, finish) {
    return Math.max(0, Math.round((/* @__PURE__ */ new Date(`${finish}T12:00:00`) - /* @__PURE__ */ new Date(`${start}T12:00:00`)) / 864e5) + 1);
  }
  function defaultInclusiveFinishDate(start, duration) {
    if (Number(duration) <= 0) return start;
    return defaultShiftedDate(start, Math.ceil(Number(duration)) - 1);
  }

  // src/domain.mjs
  var DomainError = class extends Error {
    constructor(status, code, message, details = void 0) {
      super(message);
      this.name = "DomainError";
      this.status = status;
      this.code = code;
      if (details !== void 0) this.details = details;
    }
  };
  var operations = [
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
    "record_measurement",
    "record_blocker",
    "adjust_remaining_duration",
    "manage_commitment",
    "manage_calendar"
  ];
  var editableFields = [
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
    "blockedReason"
  ];
  var dateFields = [
    "plannedStartAt",
    "dueAt",
    "baselineStartAt",
    "baselineDueAt",
    "targetStartAt",
    "targetDueAt",
    "replannedDueAt"
  ];
  var id = (prefix = "id") => `${prefix}_${globalThis.crypto.randomUUID().replaceAll("-", "")}`;
  var pick = (object, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(object, key)).map((key) => [key, object[key]]));
  var same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  function checkId(value, label = "Identificador") {
    assert(typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value), 422, "INVALID_ID", `${label} inv\xE1lido.`);
    return value;
  }
  function dateValid(value) {
    return !value || typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && (/* @__PURE__ */ new Date(`${value}T12:00:00Z`)).toISOString().slice(0, 10) === value;
  }
  function assert(condition, status, code, message, details) {
    if (!condition) throw new DomainError(status, code, message, details);
  }
  function emptyState() {
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
      filters: { query: "", status: "all", indicator: "all", type: "all", owner: "all", organization: "all", sector: "all", state: "all" }
    };
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function evaluatePermission(state, user, operation, item = null) {
    const ranks = { global: 1, state: 2, organization: 2, sector: 3, project: 4, item: 5, creator: 5 };
    const profile = state.permissionProfiles.find((entry) => entry.id === user?.profileId && !entry.inactive);
    const byId = new Map(state.items.map((entry) => [entry.id, entry]));
    let root = item;
    const seen = /* @__PURE__ */ new Set();
    while (root?.parentId && root.type !== "project" && !seen.has(root.id)) {
      seen.add(root.id);
      root = byId.get(root.parentId) || root;
    }
    const matches = !user || user.disabled ? [] : state.permissionRules.filter((rule) => {
      if (rule.inactive || rule.operation !== operation) return false;
      if (!(rule.subjectType === "user" && rule.subjectId === user.id || rule.subjectType === "profile" && profile && rule.subjectId === profile.id)) return false;
      const scope = rule.scopeId === "@user" ? user.organizationId : rule.scopeId;
      return rule.scopeType === "global" || item && (rule.scopeType === "state" && item.state === scope || rule.scopeType === "organization" && item.organizationId === scope || rule.scopeType === "sector" && item.sectorId === scope || rule.scopeType === "project" && root?.id === scope || rule.scopeType === "item" && item.id === scope || rule.scopeType === "creator" && item.createdBy === scope);
    }).sort((left, right) => (ranks[right.scopeType] || 0) - (ranks[left.scopeType] || 0) || Number(left.effect === "allow") - Number(right.effect === "allow") || left.id.localeCompare(right.id));
    return {
      allowed: matches[0]?.effect === "allow",
      operation,
      itemId: item?.id || null,
      ruleId: matches[0]?.id || null,
      rule: matches[0] || null,
      actor: { id: user?.id, organizationId: user?.organizationId, sectorId: user?.sectorId },
      reason: matches.length ? matches[0].effect : "no_applicable_rule"
    };
  }
  function createDomain(initial, actorId, onDecision = () => {
  }) {
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
      assert(result.allowed, 403, "FORBIDDEN", "Seu perfil n\xE3o permite esta opera\xE7\xE3o.", {
        operation,
        itemId: item?.id,
        ruleId: result.ruleId
      });
      return result;
    };
    const nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
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
        const daysLeft = Math.floor((/* @__PURE__ */ new Date(`${target}T00:00:00`) - /* @__PURE__ */ new Date(`${nowIso().slice(0, 10)}T00:00:00`)) / 864e5);
        return daysLeft <= (Number(state.riskThresholdDays) || 3) && Number(item.progressPercent || 0) < 75;
      },
      orgName: (organizationId) => state.organizations.find((entry) => entry.id === organizationId)?.name || "-",
      sectorName: (sectorId) => state.sectors.find((entry) => entry.id === sectorId)?.name || "-",
      userName: (userId) => state.users.find((entry) => entry.id === userId)?.name || "Sem respons\xE1vel"
    });
    const parentSummary = createParentSummary({
      state,
      createEvent: admin.createEvent,
      nowIso,
      completeStatus: (status) => status === "done",
      inclusiveDurationDays
    });
    const schedule = createScheduleOperations({
      state,
      authorize: (operation, item) => decide(operation, item).allowed,
      id: domainId,
      nowIso,
      createEvent: admin.createEvent,
      syncParentSummary: parentSummary.syncParentSummary
    });
    const recalculatePlannedDates = (...args) => scheduleDeferred ? { valid: true } : schedule.recalculatePlannedDates(...args);
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
        itemDurationDays: (item) => hasPlannedDuration(item) ? Number(item.plannedDurationDays) : inclusiveDurationDays(item.plannedStartAt, item.dueAt),
        inclusiveFinishDate: (start, duration) => datePlusDays(start, durationEndOffset2(duration)),
        completeStatus: (status) => status === "done",
        canCreateItem: (user, item) => decideForUser(user, "create_item", item ? { ...item, createdBy: item.createdBy || user?.id } : null).allowed,
        canEditItem: (user, item) => !!item && decideForUser(user, "edit_item", item).allowed,
        canChangeHierarchy: (user, item) => !!item && decideForUser(user, "edit_item", item).allowed && decideForUser(user, "change_hierarchy", item).allowed,
        syncParentSummary: parentSummary.syncParentSummary,
        recalculateBlocking: schedule.recalculateBlocking,
        archiveRecord(collection, record) {
          state[collection] || (state[collection] = []);
          state[collection].push({ ...record, removedAt: nowIso(), removedBy: currentUser()?.id || "system" });
        },
        relationTypes: ["contains", "TI"]
      }
    });
    const canViewItem = (user, item) => !!user && !user.disabled && !!item && decideForUser(user, "view_item", item).allowed;
    const canEditItem = (user, item) => !!user && !user.disabled && !!item && decideForUser(user, "edit_item", item).allowed;
    const canCreateItem = (user, item = null) => !!user && !user.disabled && decideForUser(user, "create_item", item ? { ...item, createdBy: item.createdBy || user.id } : null).allowed;
    const canManageGpo = (user) => !!user && !user.disabled && decideForUser(user, "manage_gpo", null).allowed;
    const approvalGate = (itemOrId) => {
      const item = typeof itemOrId === "string" ? state.items.find((entry) => entry.id === itemOrId) : itemOrId;
      if (!item || item.type !== "approval") return { released: false, blockers: [] };
      const blockers = state.relations.filter((relation) => relation.targetId === item.id && relation.relationType === "TI").map((relation) => state.items.find((entry) => entry.id === relation.sourceId)).filter((source) => source && (source.status !== "done" || source.status === "blocked"));
      if (item.status === "blocked") blockers.unshift(item);
      return { released: blockers.length === 0, blockers };
    };
    const approvals = createApprovalTemplateOperations({
      state,
      currentUser,
      authorize: (operation, item) => decide(operation, item).allowed,
      canSubmitApproval: (user, item) => canViewItem(user, item) && decideForUser(user, "create_approval", item).allowed,
      canDecideApproval: (user, item) => !!user && !user.disabled && item?.type === "approval" && canViewItem(user, item) && decideForUser(user, "decide_approval", item).allowed && (item.approvalReviewerId || item.ownerId) === user.id,
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
      inclusiveFinishDate: (start, duration) => datePlusDays(start, durationEndOffset2(duration)),
      inclusiveDurationDays,
      completeStatus: (status) => status === "done"
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
        state[collection] || (state[collection] = []);
        state[collection].push({ ...record, removedAt: nowIso(), removedBy: currentUser()?.id || "system" });
      }
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
      }
    };
    return {
      state,
      functions,
      authorize,
      call(name, ...args) {
        assert(Object.hasOwn(functions, name), 422, "UNKNOWN_COMMAND", "Comando inv\xE1lido.");
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
        assert(item, 404, "ITEM_NOT_FOUND", "Item n\xE3o encontrado neste workspace.");
        authorize("view_item", item);
        if (operation !== "view_item") authorize(operation, item);
        return item;
      }
    };
  }
  function calendarDayNumber2(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
    if (!match) return NaN;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = /* @__PURE__ */ new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
    return date.getTime() / 864e5;
  }
  function inclusiveDurationDays(start, finish) {
    const difference = calendarDayNumber2(finish) - calendarDayNumber2(start);
    return Number.isFinite(difference) && difference >= 0 ? difference + 1 : 0;
  }
  function hasPlannedDuration(item) {
    const value = item?.plannedDurationDays;
    return value !== null && value !== void 0 && String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
  }
  function datePlusDays(value, days) {
    const day = calendarDayNumber2(value);
    if (!Number.isFinite(day)) return "";
    return new Date((day + Number(days || 0)) * 864e5).toISOString().slice(0, 10);
  }
  function durationEndOffset2(duration) {
    return Math.max(0, Math.ceil(Number(duration)) - 1);
  }
  function temporalStartOffset2(relation, predecessorDuration, successorDuration) {
    const lag = Number(relation.lagDays) || 0;
    if (relation.relationType === "TI") return Number(predecessorDuration) + lag;
    if (relation.relationType === "II") return lag;
    if (relation.relationType === "TT") return durationEndOffset2(predecessorDuration) + lag - durationEndOffset2(successorDuration);
    if (relation.relationType === "IF") return lag - durationEndOffset2(successorDuration);
    throw new Error(`Unknown temporal relation: ${relation.relationType}`);
  }
  function shiftedDate(value, offset) {
    const date = /* @__PURE__ */ new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + Number(offset || 0));
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }
  function byIdFallback(items, id2) {
    return items.find((item) => item.id === id2) || null;
  }
  function expandedSummaryTi2(items, relations) {
    const children = new Set(items.map((item) => item.parentId).filter(Boolean));
    const leaves = items.filter((item) => !children.has(item.id));
    const descendants = (rootId) => {
      const ids = /* @__PURE__ */ new Set([rootId]);
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
      const internalIncoming = new Set(relations.filter((entry) => entry.relationType === "TI" && targetIds.has(entry.targetId) && targetIds.has(entry.sourceId)).map((entry) => entry.targetId));
      const roots = targets.filter((item) => !internalIncoming.has(item.id));
      return (sources.length ? sources : [byIdFallback(items, relation.sourceId)]).filter(Boolean).flatMap((source) => (roots.length ? roots : [byIdFallback(items, relation.targetId)]).filter(Boolean).map((target) => ({ ...relation, sourceId: source.id, targetId: target.id })));
    });
  }
  function analyzeSchedule(items, relations, { today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) } = {}) {
    const children = new Set(items.map((item) => item.parentId).filter(Boolean));
    let tasks = items.filter((item) => !children.has(item.id) && item.status !== "cancelled");
    if (!tasks.length) tasks = items.filter((item) => item.status !== "cancelled");
    if (!tasks.length) return { valid: true, reliable: false, startDate: today, finishDate: "", durationDays: 0, rows: [], message: "N\xE3o h\xE1 atividades ativas para calcular a previs\xE3o." };
    const taskIds = new Set(tasks.map((item) => item.id));
    const dependencies = expandedSummaryTi2(items, relations).filter((relation) => taskIds.has(relation.sourceId) && taskIds.has(relation.targetId));
    const sortedDates = tasks.map((item) => item.plannedStartAt).filter(Boolean).sort();
    const startDate = sortedDates[0] || today;
    const duration = /* @__PURE__ */ new Map();
    const plannedStart = /* @__PURE__ */ new Map();
    let durationsComplete = tasks.length > 0;
    for (const item of tasks) {
      const explicitDuration = Number(item.plannedDurationDays);
      const hasExplicitDuration = item.plannedDurationDays !== null && item.plannedDurationDays !== void 0 && item.plannedDurationDays !== "" && Number.isFinite(explicitDuration) && explicitDuration >= 0;
      const hasDateRange = item.plannedStartAt && item.dueAt && item.dueAt >= item.plannedStartAt;
      const days = hasExplicitDuration ? explicitDuration : hasDateRange ? inclusiveDurationDays(item.plannedStartAt, item.dueAt) : null;
      if (days === null) durationsComplete = false;
      duration.set(item.id, days ?? 0);
      plannedStart.set(item.id, item.plannedStartAt ? Math.max(0, (/* @__PURE__ */ new Date(`${item.plannedStartAt}T12:00:00`) - /* @__PURE__ */ new Date(`${startDate}T12:00:00`)) / 864e5) : 0);
    }
    const reliable = tasks.length > 0 && durationsComplete && tasks.every((item) => item.plannedStartAt && (item.plannedDurationDays !== void 0 && item.plannedDurationDays !== null && item.plannedDurationDays !== "" || item.dueAt && item.dueAt >= item.plannedStartAt));
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
      const id2 = queue.shift();
      order.push(id2);
      for (const relation of outgoing.get(id2)) {
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
      message: "H\xE1 um ciclo nas depend\xEAncias temporais. O caminho cr\xEDtico n\xE3o pode ser calculado."
    };
    const earliest = new Map(tasks.map((item) => [item.id, plannedStart.get(item.id)]));
    const offsetFor = (relation) => temporalStartOffset2(relation, duration.get(relation.sourceId), duration.get(relation.targetId));
    for (const id2 of order) for (const relation of outgoing.get(id2)) {
      earliest.set(relation.targetId, Math.max(earliest.get(relation.targetId), earliest.get(id2) + offsetFor(relation)));
    }
    const projectFinish = Math.max(0, ...tasks.map((item) => earliest.get(item.id) + durationEndOffset2(duration.get(item.id))));
    const projectDuration = projectFinish + (tasks.some((item) => duration.get(item.id) > 0) ? 1 : 0);
    const latest = new Map(tasks.map((item) => [item.id, projectFinish - durationEndOffset2(duration.get(item.id))]));
    for (const id2 of [...order].reverse()) for (const relation of outgoing.get(id2)) {
      latest.set(id2, Math.min(latest.get(id2), latest.get(relation.targetId) - offsetFor(relation)));
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
      message: reliable ? "" : "Cronograma incompleto: informe a data inicial idealizada e uma dura\xE7\xE3o expl\xEDcita (ou in\xEDcio e t\xE9rmino v\xE1lidos) para cada atividade; nenhuma dura\xE7\xE3o \xE9 presumida."
    };
  }
  function validateState(state) {
    assert(
      state.items.length <= 2e4 && state.relations.length <= 5e4,
      422,
      "WORKSPACE_LIMIT",
      "Limite de itens ou rela\xE7\xF5es do workspace excedido."
    );
    for (const name of [
      "items",
      "relations",
      "organizations",
      "sectors",
      "users",
      "permissionProfiles",
      "permissionRules",
      "templates"
    ]) {
      const values = state[name] || [], ids = /* @__PURE__ */ new Set();
      for (const entry of values) {
        checkId(entry.id);
        assert(
          !ids.has(entry.id),
          422,
          "DUPLICATE_ID",
          `Identificador duplicado em ${name}.`
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
        orgs.has(user.organizationId) && sectors.get(user.sectorId)?.organizationId === user.organizationId,
        422,
        "USER_CONTEXT",
        "O usu\xE1rio deve pertencer a uma empresa e setor v\xE1lidos."
      );
      assert(
        typeof user.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email),
        422,
        "INVALID_EMAIL",
        "Informe um e-mail v\xE1lido."
      );
      if (user.profileId)
        assert(
          state.permissionProfiles.some((p) => p.id === user.profileId),
          422,
          "INVALID_PROFILE",
          "Perfil GPO inexistente."
        );
    }
    const children = new Set(
      state.items.filter((i) => !i.archivedAt).map((i) => i.parentId)
    );
    for (const item of state.items) {
      assert(
        typeof item.title === "string" && item.title.trim() && item.title.length <= 500,
        422,
        "INVALID_TITLE",
        "O nome do item deve ter entre 1 e 500 caracteres."
      );
      assert(
        orgs.has(item.organizationId) && sectors.get(item.sectorId)?.organizationId === item.organizationId,
        422,
        "ITEM_CONTEXT",
        "Empresa/setor inv\xE1lidos para o item.",
        { itemId: item.id }
      );
      const owner = users.get(item.ownerId);
      assert(
        owner && owner.organizationId === item.organizationId && owner.sectorId === item.sectorId,
        422,
        "OWNER_CONTEXT",
        "Empresa e setor do item devem acompanhar o respons\xE1vel.",
        { itemId: item.id }
      );
      for (const field of dateFields)
        assert(
          dateValid(item[field]),
          422,
          "INVALID_DATE",
          "Data inexistente no calend\xE1rio.",
          { itemId: item.id, field }
        );
      assert(
        item.plannedDurationDays === null || Number.isFinite(item.plannedDurationDays) && item.plannedDurationDays >= 0 && item.plannedDurationDays <= 36500,
        422,
        "INVALID_DURATION",
        "Dura\xE7\xE3o inv\xE1lida.",
        { itemId: item.id }
      );
      assert(
        Number.isFinite(item.weight) && item.weight > 0 && item.weight <= 1e9,
        422,
        "INVALID_WEIGHT",
        "O peso deve ser positivo."
      );
      assert(
        Number.isFinite(item.progressPercent) && item.progressPercent >= 0 && item.progressPercent <= 100,
        422,
        "INVALID_PROGRESS",
        "Avan\xE7o fora do intervalo de 0 a 100%."
      );
      if (item.parentId) {
        assert(
          byId.has(item.parentId),
          422,
          "ORPHAN_ITEM",
          "O item pai n\xE3o existe neste workspace."
        );
        assert(
          item.archivedAt || !byId.get(item.parentId).archivedAt,
          422,
          "ARCHIVED_PARENT",
          "Restaure o pai antes de restaurar o subitem."
        );
      }
      const visited = /* @__PURE__ */ new Set([item.id]);
      let cursor = item;
      while (cursor.parentId) {
        assert(
          !visited.has(cursor.parentId),
          422,
          "HIERARCHY_CYCLE",
          "A hierarquia n\xE3o pode conter ciclos."
        );
        visited.add(cursor.parentId);
        cursor = byId.get(cursor.parentId);
        if (!cursor) break;
      }
      if (item.status === "blocked" && !item.blockedByPropagation && !children.has(item.id))
        assert(
          String(item.blockedReason || "").trim(),
          422,
          "BLOCK_REASON_REQUIRED",
          "Bloqueio manual exige um motivo.",
          { itemId: item.id }
        );
    }
    const seen = /* @__PURE__ */ new Set(), edges = new Map(state.items.map((i) => [i.id, []])), indegree = new Map(state.items.map((i) => [i.id, 0]));
    for (const relation of state.relations) {
      assert(
        relation.relationType === "TI",
        422,
        "RELATION_TYPE",
        "Somente rela\xE7\xF5es TI s\xE3o persistidas; Cont\xE9m deriva do pai."
      );
      assert(
        byId.has(relation.sourceId) && byId.has(relation.targetId) && relation.sourceId !== relation.targetId,
        422,
        "INVALID_RELATION",
        "A rela\xE7\xE3o deve conectar dois itens do workspace."
      );
      assert(
        Number.isFinite(relation.lagDays) && Math.abs(relation.lagDays) <= 36500,
        422,
        "INVALID_LAG",
        "Defasagem inv\xE1lida."
      );
      const key = `${relation.sourceId}|${relation.targetId}`;
      assert(
        !seen.has(key),
        422,
        "DUPLICATE_RELATION",
        "Esta rela\xE7\xE3o TI j\xE1 existe."
      );
      seen.add(key);
      if (!byId.get(relation.sourceId).archivedAt && !byId.get(relation.targetId).archivedAt)
        assert(
          !children.has(relation.sourceId) && !children.has(relation.targetId),
          422,
          "RELATION_NOT_LEAF",
          "TI somente entre atividades finais."
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
      "As rela\xE7\xF5es TI n\xE3o podem conter ciclos."
    );
  }
  return __toCommonJS(domain_exports);
})();
