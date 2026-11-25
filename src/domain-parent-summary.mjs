/** Aggregate child state into a parent while keeping mutations and events explicit. */
export function createParentSummary({
  state,
  createEvent,
  nowIso,
  completeStatus,
  inclusiveDurationDays,
} = {}) {
  if (!state || !Array.isArray(state.items) || typeof createEvent !== "function"
    || typeof nowIso !== "function" || typeof completeStatus !== "function"
    || typeof inclusiveDurationDays !== "function") {
    throw new TypeError("createParentSummary requires state, event, time, status, and duration dependencies");
  }

  const getItem = (itemId) => state.items.find((item) => item.id === itemId) || null;

  function syncParentSummary(parentId, effectiveAt = nowIso()) {
    const parent = getItem(parentId);
    if (!parent) return;

    const children = state.items.filter((item) => item.parentId === parentId
      && item.status !== "cancelled" && !item.archivedAt);
    if (!parent.baselineStartAt) {
      parent.baselineStartAt = children.map((item) => item.baselineStartAt || item.plannedStartAt)
        .filter(Boolean).sort()[0] || parent.plannedStartAt || "";
    }
    if (!parent.baselineDueAt) {
      parent.baselineDueAt = children.map((item) => item.baselineDueAt || item.dueAt)
        .filter(Boolean).sort().at(-1) || parent.dueAt || "";
    }
    if (!state.items.some((child) => child.parentId === parentId && !child.archivedAt)) return;

    const wasComplete = completeStatus(parent.status);
    const allChildren = state.items.filter((child) => child.parentId === parent.id && !child.archivedAt);
    const active = allChildren.filter((child) => child.status !== "cancelled");
    const leaves = [];
    const seen = new Set();
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
        total.value += weight * (leaf.status === "done"
          ? 100
          : Math.max(0, Math.min(100, Number(leaf.progressPercent || 0))));
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
      plannedDurationDays: active.every((child) => child.plannedStartAt && child.dueAt)
        ? inclusiveDurationDays(active.map((child) => child.plannedStartAt).sort()[0], active.map((child) => child.dueAt).sort().at(-1))
        : null,
      plannedStartAt: active.map((child) => child.plannedStartAt).filter(Boolean).sort()[0] || parent.plannedStartAt || "",
      dueAt: active.map((child) => child.dueAt).filter(Boolean).sort().at(-1) || parent.dueAt || "",
    };
    let changed = false;
    for (const field of Object.keys(next)) {
      if (parent[field] === next[field]) continue;
      const eventType = field === "status" ? "status_changed"
        : field === "progressPercent" ? "progress_changed"
          : field === "plannedStartAt" ? "start_changed"
            : field === "plannedDurationDays" ? "duration_changed" : "due_changed";
      createEvent(parent.id, eventType, parent[field] || "", next[field] ?? "", "Resumo herdado dos subitens.", effectiveAt);
      parent[field] = next[field];
      changed = true;
    }

    if (completeStatus(next.status)) {
      parent.completedAt = children.map((item) => item.completedAt).filter(Boolean).sort().at(-1)
        || parent.completedAt || effectiveAt;
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
