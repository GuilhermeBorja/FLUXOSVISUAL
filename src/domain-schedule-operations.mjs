import { analyzeSchedule } from "./domain.mjs";

const activeItems = (state) => state.items.filter((item) => !item.archivedAt);

function calendarDayNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").slice(0, 10));
  if (!match) return NaN;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return NaN;
  return date.getTime() / 86400000;
}

function addDays(value, days) {
  if (!value || !Number.isFinite(calendarDayNumber(value))) return "";
  const date = new Date(calendarDayNumber(value) * 86400000);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function durationEndOffset(duration) {
  return Math.max(0, Math.ceil(Number(duration)) - 1);
}

function durationOf(item) {
  const duration = item.plannedDurationDays;
  if (duration !== null && duration !== undefined && String(duration).trim() !== ""
    && Number.isFinite(Number(duration)) && Number(duration) >= 0) return Number(duration);
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
    const ids = new Set([rootId]);
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
    const internalIncoming = new Set(relations.filter((entry) => entry.relationType === "TI"
      && targetIds.has(entry.targetId) && targetIds.has(entry.sourceId)).map((entry) => entry.targetId));
    const roots = targets.filter((item) => !internalIncoming.has(item.id));
    const byId = (id) => items.find((item) => item.id === id) || null;
    return (sources.length ? sources : [byId(relation.sourceId)]).filter(Boolean)
      .flatMap((source) => (roots.length ? roots : [byId(relation.targetId)]).filter(Boolean)
        .map((target) => ({ ...relation, sourceId: source.id, targetId: target.id })));
  });
}

export function createScheduleOperations({ state, authorize = () => true, id, nowIso, createEvent, syncParentSummary } = {}) {
  if (!state || !Array.isArray(state.items) || !Array.isArray(state.relations)) {
    throw new TypeError("createScheduleOperations requires a state with items and relations arrays");
  }
  const timestamp = nowIso || (() => new Date().toISOString());
  const emit = createEvent || ((itemId, eventType, fromValue, toValue, comment, effectiveAt = timestamp()) => {
    const item = state.items.find((entry) => entry.id === itemId);
    state.events ||= [];
    state.events.push({
      id: id ? id("event") : `event_${state.events.length + 1}`,
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
      comment: comment || "",
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
    const dependencies = expandedSummaryTi(items, state.relations)
      .filter((relation) => byId.has(relation.sourceId) && byId.has(relation.targetId));
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
    if (order.length !== items.length) return { valid: false, message: "Há um ciclo nas dependências temporais. As datas não foram recalculadas." };

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
        starts.set(itemId, earliestAllowed && dependencyStart
          ? (earliestAllowed > dependencyStart ? earliestAllowed : dependencyStart)
          : earliestAllowed || dependencyStart);
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
      const seen = new Set();
      while (cursor?.parentId && !seen.has(cursor.parentId)) {
        seen.add(cursor.parentId);
        cursor = byId.get(cursor.parentId);
        if (cursor) depth++;
      }
      return depth;
    };
    const groups = items.filter((item) => items.some((child) => child.parentId === item.id && child.status !== "cancelled"))
      .sort((a, b) => depthOf(a) - depthOf(b));
    for (const group of groups) if (group.replannedDueAt) {
      const descendants = items.filter((item) => {
        let cursor = item;
        const seen = new Set();
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
    for (const relation of state.relations) if (relation.relationType === "TI"
      && byId.has(relation.sourceId) && byId.has(relation.targetId)) outgoing.get(relation.sourceId).push(relation.targetId);
    const sources = new Map(items.map((item) => [item.id, new Set()]));
    const queue = items.filter((item) => item.status === "blocked" && !item.blockedByPropagation)
      .map((item) => ({ id: item.id, source: item.id }));
    const seen = new Set();
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
    const changedParentIds = new Set();
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
