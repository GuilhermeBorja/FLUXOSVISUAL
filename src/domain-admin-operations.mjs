/** Small administrative/query operations with application state passed explicitly. */
export function createAdminOperations({ state, currentUser, id, nowIso }) {
  if (!state || typeof currentUser !== "function" || typeof id !== "function" || typeof nowIso !== "function") {
    throw new TypeError("createAdminOperations requires state, currentUser, id, and nowIso");
  }

  function itemTreeIds(initialIds) {
    const ids = new Set(initialIds);
    const children = new Map();
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
      id: id("event"),
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
      comment: comment || "",
    };
    state.events.push(event);
    return event;
  }

  function registryEvent(entityType, record, comment = "", eventType = "removed") {
    state.registryEvents ||= [];
    const event = {
      id: id("registry_event"),
      entityType,
      entityId: record.id,
      eventType,
      name: record.name || record.operation || record.id,
      userId: currentUser().id,
      createdAt: nowIso(),
      comment,
    };
    state.registryEvents.push(event);
    return event;
  }

  return { itemTreeIds, createEvent, registryEvent };
}
