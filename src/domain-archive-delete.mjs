/** Archive and deletion operations with state and application policy passed explicitly. */
export function createArchiveDeleteOperations(deps) {
  const {
    state,
    currentUser,
    id,
    nowIso,
    canEditItem,
    canRemoveItem,
    canManageUsers,
    canManageOrganization,
    createEvent,
    registryEvent,
    itemTreeIds,
    syncParentSummary = () => {},
    recalculatePlannedDates = () => ({ valid: true }),
    syncContainsRelations = () => {},
    archiveRecord = defaultArchiveRecord,
  } = deps;

  for (const key of ["state", "currentUser", "id", "nowIso", "canEditItem", "canRemoveItem", "canManageUsers", "canManageOrganization", "createEvent", "registryEvent", "itemTreeIds"])
    if (!deps[key]) throw new TypeError(`Missing archive/delete dependency: ${key}`);

  const getItem = (itemId) => state.items.find((item) => item.id === itemId) || null;

  function requireDeletionPermission(item = null) {
    if (!canRemoveItem(currentUser(), item)) {
      throw new Error(item ? "Sua regra GPO não permite excluir este item." : "Sua regra GPO não permite excluir este cadastro.");
    }
  }

  function archiveItem(itemId) {
    const user = currentUser();
    const root = getItem(itemId);
    if (!root || !canEditItem(user, root)) throw new Error("O GPO não permite arquivar este item.");
    const ids = [];
    const seen = new Set();
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
    if (!root || !root.archivedAt || !canEditItem(user, root)) throw new Error("O GPO não permite restaurar este item.");
    const ids = [];
    const seen = new Set();
    const queue = [root.id];
    while (queue.length) {
      const currentId = queue.shift();
      if (seen.has(currentId)) continue;
      seen.add(currentId);
      const item = getItem(currentId);
      if (!item) continue;
      ids.push(item);
      state.items.filter((child) => child.parentId === currentId && child.archivedAt)
        .forEach((child) => queue.push(child.id));
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
    if (!item) throw new Error("Item não encontrado.");
    const treeIds = itemTreeIds([itemId]);
    const ids = cascade ? treeIds : new Set([itemId]);
    return {
      item,
      ids,
      descendantCount: treeIds.size - 1,
      items: state.items.filter((entry) => ids.has(entry.id)),
      relations: state.relations.filter((relation) => ids.has(relation.sourceId) || ids.has(relation.targetId)),
      detached: state.items.filter((entry) => !ids.has(entry.id) && ids.has(entry.parentId)),
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
      createEvent(item.id, "parent_changed", getItem(item.parentId)?.title || item.parentId, "", "Item pai excluído; subitem mantido como item independente.", effectiveAt);
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
        createEvent(endpoint, "relation_removed", relation.relationType, "", `Relação com ${other?.title || "item excluído"} removida pela exclusão do item.`, effectiveAt);
      }
    }
    for (const item of removed) {
      createEvent(item.id, "item_removed", item.title, "", reason, effectiveAt);
      archiveRecord("archivedItems", item);
    }
    state.archivedAttachments ||= [];
    const removedAttachments = (state.attachments || []).filter((attachment) => ids.has(attachment.itemId));
    removedAttachments.forEach((attachment) => state.archivedAttachments.push({
      ...attachment,
      deletedAt: effectiveAt,
      deletedBy: currentUser()?.id || "system",
    }));
    state.attachments = (state.attachments || []).filter((attachment) => !ids.has(attachment.itemId));
    state.items = state.items.filter((item) => !ids.has(item.id));
    state.relations = state.relations.filter((relation) => !ids.has(relation.sourceId) && !ids.has(relation.targetId));

    const pending = [...detachedRoots];
    const visited = new Set();
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
    if (plan.descendantCount && !cascade && !keepChildren) throw new Error("Escolha excluir os subitens ou mantê-los como itens independentes.");
    return removeItemsByIds(plan.ids, `Item excluído${cascade ? " com seus subitens" : ""}. Histórico preservado.`);
  }

  function removeUser(userId, { replacementId = "" } = {}) {
    const user = state.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Usuário não encontrado.");
    if (!canManageUsers(currentUser(), user.organizationId)) throw new Error("O GPO não permite gerenciar usuários nesta empresa.");
    if (user.id === currentUser()?.id) throw new Error("Entre com outro administrador para excluir o usuário conectado.");
    const replacement = replacementId && state.users.find((entry) => entry.id === replacementId && entry.id !== userId && !entry.disabled);
    if (replacementId && !replacement) throw new Error("Selecione um responsável substituto ativo.");
    const items = state.items.filter((item) => item.ownerId === userId);
    const effectiveAt = nowIso();
    for (const item of items) {
      createEvent(item.id, "owner_changed", userId, replacementId, `Usuário ${user.name} excluído. ${replacement ? `Responsabilidade transferida para ${replacement.name}.` : "Item mantido sem responsável."}`, effectiveAt);
      item.ownerId = replacementId;
      item.updatedAt = effectiveAt;
      item.lastChangeAt = effectiveAt;
    }
    archiveRecord("archivedUsers", user);
    registryEvent("user", user, `${items.length} itens ${replacement ? "repassados" : "mantidos sem responsável"}.`);
    state.users = state.users.filter((entry) => entry.id !== userId);
    if (state.filters?.owner === userId) state.filters.owner = "all";
    return { users: 1, reassigned: items.length };
  }

  function removeSector(sectorId, { replacementId = "" } = {}) {
    const sector = state.sectors.find((entry) => entry.id === sectorId);
    if (!sector) throw new Error("Setor não encontrado.");
    if (!canManageOrganization(currentUser(), sector.organizationId)) throw new Error("O GPO não permite administrar esta empresa.");
    const users = state.users.filter((user) => user.sectorId === sectorId);
    const items = state.items.filter((item) => item.sectorId === sectorId);
    const replacement = replacementId && state.sectors.find((entry) => entry.id === replacementId && entry.id !== sectorId && entry.organizationId === sector.organizationId);
    if ((items.length || users.length || replacementId) && !replacement) throw new Error("Escolha outro setor da mesma empresa para receber os itens e usuários vinculados.");
    const effectiveAt = nowIso();
    for (const item of items) {
      createEvent(item.id, "context_changed", sector.name, replacement.name, "Setor excluído; item transferido para outro setor da mesma empresa.", effectiveAt);
      item.sectorId = replacement.id;
      item.updatedAt = effectiveAt;
      item.lastChangeAt = effectiveAt;
    }
    users.forEach((user) => { user.sectorId = replacement.id; });
    archiveRecord("archivedSectors", sector);
    registryEvent("sector", sector, `${items.length} itens e ${users.length} usuários transferidos${replacement ? ` para ${replacement.name}` : ""}.`);
    state.sectors = state.sectors.filter((entry) => entry.id !== sectorId);
    return { sectors: 1, items: items.length, users: users.length };
  }

  function organizationRemovalPlan(organizationId) {
    const organization = state.organizations.find((entry) => entry.id === organizationId);
    if (!organization) throw new Error("Empresa não encontrada.");
    if (!canManageOrganization(currentUser(), organizationId)) throw new Error("O GPO não permite administrar esta empresa.");
    const sectors = state.sectors.filter((sector) => sector.organizationId === organizationId);
    const sectorIds = new Set(sectors.map((sector) => sector.id));
    const users = state.users.filter((user) => user.organizationId === organizationId || sectorIds.has(user.sectorId));
    if (currentUser()?.organizationId === organizationId || users.some((user) => user.id === currentUser()?.id)) {
      throw new Error("Entre com um administrador de outra empresa para excluir a empresa do usuário conectado.");
    }
    const ids = itemTreeIds(state.items.filter((item) => item.organizationId === organizationId || sectorIds.has(item.sectorId)).map((item) => item.id));
    const userIds = new Set(users.map((user) => user.id));
    return {
      organization,
      sectors,
      users,
      ids,
      unassigned: state.items.filter((item) => !ids.has(item.id) && userIds.has(item.ownerId)),
    };
  }

  function removeOrganization(organizationId) {
    const plan = organizationRemovalPlan(organizationId);
    const result = removeItemsByIds(plan.ids, `Empresa ${plan.organization.name} excluída com seus itens e subitens. Histórico preservado.`);
    plan.users.forEach((user) => removeUser(user.id));
    plan.sectors.forEach((sector) => removeSector(sector.id));
    archiveRecord("archivedOrganizations", plan.organization);
    registryEvent("organization", plan.organization, `${result.items} itens, ${plan.users.length} usuários e ${plan.sectors.length} setores excluídos.`);
    state.organizations = state.organizations.filter((entry) => entry.id !== organizationId);
    return { ...result, users: plan.users.length, sectors: plan.sectors.length, organizations: 1 };
  }

  function defaultArchiveRecord(collection, record) {
    state[collection] ||= [];
    state[collection].push({ ...record, removedAt: nowIso(), removedBy: currentUser()?.id || "system" });
  }

  return { archiveItem, restoreArchivedItem, removeItem, removeUser, removeSector, removeOrganization };
}
