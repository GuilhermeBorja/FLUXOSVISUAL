import { DomainError } from "./domain.mjs";

const copy = (value) => JSON.parse(JSON.stringify(value));

/**
 * Stateful item and relation operations used by the server adapter.
 *
 * Additional helpers may be supplied in `helpers`: `validateItemInput`,
 * `normalizeLegacyBlocked`, `itemDurationDays`, `inclusiveFinishDate`,
 * `completeStatus`, `canCreateItem`, `canEditItem`, `canChangeHierarchy`,
 * `syncParentSummary`, `recalculateBlocking`, and `archiveRecord`.
 */
export function createItemRelationOperations({
  state,
  actor,
  authorize,
  id,
  nowIso,
  today = () => new Date().toISOString().slice(0, 10),
  createEvent = () => {},
  registryEvent = () => {},
  schedule = () => ({ valid: true }),
  helpers = {},
}) {
  const getItem = (itemId) => state.items.find((item) => item.id === itemId) || null;
  const syncContainsRelations = (itemId) => {
    state.relations = state.relations.filter((relation) => !(relation.relationType === "contains" && relation.targetId === itemId));
  };
  const granted = (operation, item) => {
    const result = authorize(operation, item);
    return result !== false && result?.allowed !== false;
  };
  const allowed = (operation, item, message = "A regra de permiss\u00e3o n\u00e3o permite esta opera\u00e7\u00e3o.") => {
    if (!granted(operation, item)) throw new Error(message);
  };
  const canCreate = (user, item) => helpers.canCreateItem
    ? helpers.canCreateItem(user, item)
    : granted("create_item", item);
  const canEdit = (user, item) => helpers.canEditItem
    ? helpers.canEditItem(user, item)
    : !!item && granted("edit_item", item);
  const canChangeHierarchy = (user, item) => helpers.canChangeHierarchy
    ? helpers.canChangeHierarchy(user, item)
    : !!item && canEdit(user, item) && granted("change_hierarchy", item);
  const validateItemInput = (input, item) => helpers.validateItemInput?.(input, item);
  const normalizeLegacyBlocked = helpers.normalizeLegacyBlocked || ((input) => input?.blocked === true
    && !["done", "cancelled"].includes(input.status) ? { ...input, status: "blocked" } : input);
  const completeStatus = helpers.completeStatus || ((status) => status === "done");
  const itemDurationDays = helpers.itemDurationDays || ((input) => {
    const duration = input.plannedDurationDays;
    if (duration !== null && duration !== undefined && String(duration).trim() !== ""
      && Number.isFinite(Number(duration)) && Number(duration) >= 0) return Number(duration);
    if (!input.plannedStartAt || !input.dueAt) return 0;
    const start = new Date(`${input.plannedStartAt.slice(0, 10)}T12:00:00Z`);
    const due = new Date(`${input.dueAt.slice(0, 10)}T12:00:00Z`);
    const days = (due - start) / 86400000;
    return Number.isFinite(days) && days >= 0 ? days + 1 : 0;
  });
  const inclusiveFinishDate = helpers.inclusiveFinishDate || ((start, duration) => {
    if (!start) return "";
    const date = new Date(`${String(start).slice(0, 10)}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return "";
    date.setDate(date.getDate() + Math.max(0, Math.ceil(Number(duration)) - 1));
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  const snapshot = () => ({
    items: copy(state.items),
    relations: copy(state.relations),
    events: copy(state.events || []),
    archivedRelations: copy(state.archivedRelations || []),
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
      if (error instanceof DomainError || (Number.isInteger(error?.status) && typeof error?.code === "string")) throw error;
      throw new DomainError(422, "DOMAIN_VALIDATION", error?.message || String(error));
    }
  };
  const requireSchedule = () => {
    const result = schedule();
    if (!result?.valid) throw new Error(result?.message || "Cronograma inválido.");
    return result;
  };

  function createItem(input) {
    input = normalizeLegacyBlocked(input) || input;
    if (!canCreate(actor, input)) throw new Error("Sua regra GPO não permite criar itens neste escopo.");
    validateItemInput(input);
    if (input.type === "approval" && ["correction", "under_review"].includes(input.status) && !input.templateInstance)
      throw new Error("A etapa deve entrar no fluxo antes de receber uma decisão.");
    if (input.parentId && !canEdit(actor, getItem(input.parentId))) throw new Error("Sem permissão para alterar o item pai.");
    if (!canCreate(actor, { ...input, createdBy: actor.id })) throw new Error("O escopo do novo item não está autorizado.");

    const before = snapshot();
    try {
      const started = input.plannedStartAt || today();
      const duration = input.plannedDurationDays === null ? null : itemDurationDays(input);
      const item = {
        id: id("item"), title: input.title, type: input.type || "task",
        status: input.blocked === true ? "blocked" : (input.status || "backlog"),
        blocked: false,
        blockedReason: input.blocked === true ? String(input.blockedReason || "").trim() : "",
        blockedAt: input.blocked === true || input.status === "blocked" ? nowIso() : "",
        priority: input.priority || "media", ownerId: input.ownerId, createdBy: actor.id,
        organizationId: input.organizationId, sectorId: input.sectorId, state: input.state,
        parentId: input.parentId || "",
        sortOrder: Number(input.sortOrder ?? state.items.filter((entry) => entry.parentId === (input.parentId || "")).length * 100),
        description: input.description || "", plannedStartAt: started, dueAt: input.dueAt || "",
        plannedDurationDays: duration, baselineStartAt: started,
        baselineDueAt: input.baselineDueAt || input.dueAt || (duration === null ? "" : inclusiveFinishDate(started, duration)),
        replannedDueAt: "", targetStartAt: input.targetStartAt || "", targetDueAt: input.targetDueAt || "",
        weight: Number(input.weight ?? 1),
        progressPercent: Number(input.progressPercent ?? (completeStatus(input.status) ? 100 : 0)),
        completedAt: completeStatus(input.status) ? nowIso() : "", actualStartAt: "",
        createdAt: nowIso(), updatedAt: nowIso(), lastChangeAt: nowIso(),
      };
      state.items.push(item);
      createEvent(item.id, "created", "", item.status, "Item criado.", item.createdAt);
      if (item.status === "blocked") createEvent(item.id, "status_changed", "", "blocked", "Bloqueio registrado na criação.", item.createdAt);
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
    if (!item) throw new Error("Item não encontrado.");
    allowed("edit_item", item, "Sua regra GPO n\u00e3o permite editar este item.");
    input = normalizeLegacyBlocked(input, item.status) || input;
    if (item.status === "blocked" && input.status !== undefined && input.status !== "blocked") {
      if ((item.inheritedBlockedFrom || []).length) throw new Error("Resolva as fontes do bloqueio herdado antes de liberar esta atividade.");
      if (!String(comment || "").trim()) throw new Error("Informe no comentário o motivo do desbloqueio.");
    }
    if (input.ownerId !== undefined && input.ownerId !== item.ownerId) {
      const owner = state.users.find((entry) => entry.id === input.ownerId);
      if (owner) input = { ...input, organizationId: owner.organizationId || input.organizationId, sectorId: owner.sectorId || input.sectorId, state: owner.state || input.state };
    }
    validateItemInput(input, item);
    if (!Number.isFinite(new Date(effectiveAt).getTime())) throw new Error("Informe a data e hora da mudança.");
    if (item.type === "approval" && input.status !== item.status)
      throw new Error("Use a aba Aprovação para enviar, aprovar, reprovar ou iniciar uma correção.");
    if (item.type === "approval" && input.type !== "approval" && ["under_review", "correction"].includes(item.status))
      throw new Error("Conclua a decisão de aprovação em andamento antes de mudar o tipo do item.");
    if (input.type !== "approval" && ["under_review", "correction"].includes(input.status) && input.status !== item.status)
      throw new Error("Em análise e Em correção pertencem ao fluxo de aprovação.");
    const startsApproval = input.type === "approval" && item.type !== "approval";
    if (input.status === "cancelled") input = { ...input, progressPercent: item.progressPercent ?? 0 };
    else if (Number(input.progressPercent ?? item.progressPercent ?? 0) === 100
      && input.status !== "blocked" && item.status !== "blocked" && item.type !== "approval") input = { ...input, status: "done" };
    else if (Number(input.progressPercent ?? item.progressPercent ?? 0) > 0 && ["backlog", "ready"].includes(input.status)) input = { ...input, status: "in_progress" };
    const wasComplete = completeStatus(item.status);
    const complete = completeStatus(input.status);
    if (wasComplete && !complete && (input.progressPercent === undefined || Number(input.progressPercent) === Number(item.progressPercent)))
      throw new Error("Informe um novo percentual ao reabrir uma atividade concluída.");
    if (complete) input = { ...input, progressPercent: 100 };
    if (input.status === "cancelled") input = { ...input, progressPercent: item.progressPercent ?? 0 };
    if (wasComplete && complete
      && ((input.plannedStartAt ?? item.plannedStartAt) !== item.plannedStartAt || (input.dueAt ?? item.dueAt) !== item.dueAt))
      throw new Error("As datas previstas ficam bloqueadas após a conclusão.");
    const hasActiveChildren = state.items.some((entry) => entry.parentId === item.id && !entry.archivedAt);
    const calculated = ["status", "progressPercent", "plannedStartAt", "dueAt", "plannedDurationDays"];
    const attempted = calculated.filter((field) => input[field] !== undefined && input[field] !== item[field]);
    if (hasActiveChildren && attempted.length) throw new Error(`Estas propriedades do pai são calculadas pelos filhos e não podem ser editadas: ${attempted.join(", ")}.`);
    if (!canEdit(actor, { ...item, ...input })) throw new Error("O novo contexto deve permanecer dentro das regras GPO.");

    const before = snapshot();
    const eventTypes = {
      title: "title_changed", type: "type_changed", status: "status_changed", ownerId: "owner_changed",
      dueAt: "due_changed", plannedStartAt: "start_changed", plannedDurationDays: "duration_changed",
      replannedDueAt: "replanned_due_changed", targetStartAt: "target_start_changed", targetDueAt: "target_due_changed",
      weight: "weight_changed", progressPercent: "progress_changed", description: "description_changed",
      organizationId: "context_changed", sectorId: "context_changed", state: "context_changed",
    };
    let changed = false;
    try {
      if (startsApproval) {
        item.approvalRound ||= 1;
        item.approvalReviewerId ||= input.ownerId || "";
      }
      for (const field of Object.keys(eventTypes)) {
        if (input[field] === undefined && item[field] === undefined) continue;
        const rawNext = input[field] ?? item[field];
        const next = field === "plannedDurationDays" && (rawNext === null || rawNext === "") ? null
          : (["weight", "plannedDurationDays"].includes(field) || (field === "progressPercent" && rawNext !== null) ? Number(rawNext) : rawNext);
        if (next === item[field]) continue;
        const operation = field === "ownerId" ? "change_owner"
          : ["dueAt", "plannedStartAt", "plannedDurationDays", "replannedDueAt", "targetStartAt", "targetDueAt"].includes(field) ? "change_duration"
            : field === "weight" ? "change_weight" : null;
        if (operation) allowed(operation, item, "O GPO n\u00e3o permite esta altera\u00e7\u00e3o neste escopo.");
      }
      for (const field of Object.keys(eventTypes)) {
        if (input[field] === undefined && item[field] === undefined) continue;
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
      if (item.status !== "blocked") { item.blocked = false; item.blockedAt = ""; }
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
      if (comment.trim()) { createEvent(itemId, "comment", "", "", comment.trim(), effectiveAt); changed = true; }
      if (changed && item.blockedByPropagation && item.status !== "blocked") {
        item.blockedByPropagation = false;
        item.statusBeforeInheritedBlock = "";
        item.manualBlockOverride = true;
      }
      if (input.blockedReason !== undefined && item.blockedReason !== String(input.blockedReason)) {
        createEvent(itemId, "blocked_reason_changed", item.blockedReason || "", String(input.blockedReason), "Motivo do impedimento atualizado.", effectiveAt);
        item.blockedReason = String(input.blockedReason);
        changed = true;
      }
      if (changed && item.status === "blocked" && input.status === "blocked" && item.blockedByPropagation) {
        item.blockedByPropagation = false;
        item.manualBlockOverride = false;
      }
      if (changed) {
        item.updatedAt = nowIso(); item.lastChangeAt = effectiveAt;
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
    if (!(helpers.relationTypes || ["TI"]).some((type) => (typeof type === "string" ? type : type.id) === relationType)) throw new Error("Tipo de relação inválido.");
    if (!canEdit(actor, source) || !granted("create_relation", source)) throw new Error("Sem permiss\u00e3o para criar esta rela\u00e7\u00e3o a partir da origem.");
    if (!Number.isFinite(Number(lagDays))) throw new Error("Informe uma defasagem numérica.");
    if (state.relations.some((relation) => relation.sourceId === sourceId && relation.targetId === targetId && relation.relationType === relationType)) throw new Error("Essa relação já existe.");
    const relation = {
      id: id("rel"), sourceId, targetId, relationType, lagDays: Number(lagDays) || 0,
      description: String(description || "").trim(), createdBy: actor?.id || "system", createdAt: nowIso(),
    };
    const before = snapshot();
    state.relations.push(relation);
    try {
      requireSchedule();
      createEvent(targetId, "relation_created", "", relationType, relation.description || `Relação criada a partir de ${source.title}.`);
      if (relationType === "TI") helpers.recalculateBlocking?.();
      return relation;
    } catch (error) {
      restore(before);
      throw error;
    }
  }

  function updateRelation(relationId, input) {
    const relation = state.relations.find((entry) => entry.id === relationId);
    if (!relation) throw new Error("Relação não encontrada.");
    const source = getItem(input.sourceId), target = getItem(input.targetId);
    if (!source || !target || source.id === target.id) throw new Error("Escolha dois itens diferentes.");
    if (!(helpers.relationTypes || ["TI", "contains"]).some((type) => (typeof type === "string" ? type : type.id) === input.relationType)) throw new Error("Tipo de relação inválido.");
    if (!canEdit(actor, getItem(relation.sourceId)) || !canEdit(actor, getItem(relation.targetId)) || !canEdit(actor, source) || !canEdit(actor, target)) throw new Error("O GPO não permite alterar esta relação ou seus itens.");
    allowed("edit_relation", target, "O GPO n\u00e3o permite alterar rela\u00e7\u00f5es neste escopo.");
    if (!Number.isFinite(Number(input.lagDays))) throw new Error("Informe uma defasagem numérica.");
    if (state.relations.some((entry) => entry.id !== relationId && entry.sourceId === source.id && entry.targetId === target.id && entry.relationType === input.relationType)) throw new Error("Esta relação já existe.");
    if (input.relationType === "contains") {
      let cursor = source;
      const seen = new Set();
      while (cursor && !seen.has(cursor.id)) {
        if (cursor.id === target.id) throw new Error("A hierarquia não pode conter ciclos.");
        seen.add(cursor.id);
        cursor = getItem(cursor.parentId);
      }
      const existingParent = relation.relationType === "contains" && relation.targetId === target.id ? relation.sourceId : "";
      if (target.parentId && target.parentId !== source.id && target.parentId !== existingParent)
        throw new Error("O item de destino já possui outro pai.");
    }
    const beforeState = snapshot();
    const before = { ...relation };
    const affectedParents = new Set();
    try {
      if (relation.relationType === "contains"
        && (relation.sourceId !== source.id || relation.targetId !== target.id || input.relationType !== "contains")) {
        const priorTarget = getItem(relation.targetId);
        if (priorTarget?.parentId === relation.sourceId) {
          priorTarget.parentId = "";
          affectedParents.add(relation.sourceId);
        }
      }
      Object.assign(relation, {
        sourceId: source.id, targetId: target.id, relationType: input.relationType,
        lagDays: Number(input.lagDays) || 0, description: String(input.description || "").trim(),
        updatedAt: nowIso(), updatedBy: actor.id, previousSourceId: before.sourceId,
        previousTargetId: before.targetId, previousRelationType: before.relationType,
      });
      if (input.relationType === "contains") {
        if (!target.parentId || target.parentId === source.id) target.parentId = source.id;
        affectedParents.add(source.id);
      }
      requireSchedule();
      if (before.relationType === "contains") syncContainsRelations(before.targetId);
      if (relation.relationType === "contains") syncContainsRelations(target.id);
      if (before.relationType !== relation.relationType)
        createEvent(target.id, "relation_updated", before.relationType, relation.relationType, `Relação com ${source.title}.`);
      if (Number(before.lagDays || 0) !== Number(relation.lagDays || 0))
        createEvent(target.id, "relation_lag_changed", String(Number(before.lagDays || 0)), String(Number(relation.lagDays || 0)), `Defasagem da relação com ${source.title}.`);
      if ((before.description || "") !== (relation.description || ""))
        createEvent(target.id, "relation_description_changed", before.description || "", relation.description || "", `Descrição da relação com ${source.title}.`);
      if (before.sourceId !== source.id) createEvent(target.id, "relation_retargeted", before.sourceId, source.id, "Origem da relação alterada.");
      if (target.id !== before.targetId) {
        createEvent(before.targetId, "relation_retargeted", before.targetId, target.id, "Relação transferida para outro item.");
        createEvent(target.id, "relation_retargeted", before.targetId, target.id, relation.description || "Relação transferida para este item.");
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
    if (!item) throw new Error("Item não encontrado.");
    if (nextParentId && !nextParent) throw new Error("Novo item pai não encontrado.");
    if (!canChangeHierarchy(actor, item) || (nextParent && !canEdit(actor, nextParent))) throw new Error("O GPO não permite alterar esta hierarquia.");
    if ((item.parentId || "") === nextParentId) return false;
    for (let cursor = nextParent, seen = new Set(); cursor && !seen.has(cursor.id); cursor = getItem(cursor.parentId)) {
      if (cursor.id === item.id) throw new Error("A hierarquia não pode conter ciclos.");
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
      const pending = [item.id], visited = new Set();
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
    } catch (error) { restore(before); throw error; }
  }

  function reorderItem(itemId, targetId, after = false) {
    const item = getItem(itemId), target = getItem(targetId);
    if (!item || !target || item.id === target.id) return false;
    if (item.parentId !== target.parentId) throw new Error("A ordenação mantém os itens no mesmo nível hierárquico.");
    if (!canChangeHierarchy(actor, item) || !canChangeHierarchy(actor, target)) throw new Error("O GPO não permite reordenar estes itens.");
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
    if (!relation) throw new Error("Relação não encontrada.");
    const source = getItem(relation.sourceId), target = getItem(relation.targetId);
    if (relation.relationType === "TI") {
      if (!canEdit(actor, source)) throw new Error("Somente quem pode editar a origem pode remover esta TI.");
    } else if (!granted("delete_relation", target) || !canEdit(actor, source) || !canEdit(actor, target)) {
      throw new Error("Sem permissão para alterar esta relação hierárquica.");
    }
    if (relation.relationType === "contains" && target) target.parentId = "";
    createEvent(relation.targetId, "relation_removed", relation.relationType, "", `Relação com ${source?.title || "item"} removida.`);
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
    reorderItem: wrap(reorderItem),
  };
}
