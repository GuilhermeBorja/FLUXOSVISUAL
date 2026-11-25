/** Approval and reusable-flow operations with all ambient application behavior injected. */
export function createApprovalTemplateOperations(deps) {
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
    id,
    nowIso,
    today = () => new Date().toISOString().slice(0, 10),
    shiftedDate = defaultShiftedDate,
    inclusiveFinishDate = defaultInclusiveFinishDate,
    inclusiveDurationDays = defaultInclusiveDurationDays,
    completeStatus = (status) => status === "done",
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
    if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprovação.");
    if (!canSubmitApproval(user, item)) throw new Error("Sua regra GPO não permite enviar esta etapa para aprovação.");
    if (!approvalGate(item).released) throw new Error("A aprovação ainda depende da conclusão de suas predecessoras.");
    if (!["backlog", "ready", "in_progress", "correction"].includes(item.status)) throw new Error("Esta etapa não está pronta para ser enviada.");
    if (item.status === "correction" && item.correctionOwnerId !== user.id && !isAuthorized("decide_approval", item))
      throw new Error("Somente o responsável pela correção ou usuário autorizado no GPO pode reenviar esta etapa.");
    item.approvalRound ||= 1;
    const reason = note.trim();
    state.approvalDecisions ||= [];
    const submission = {
      id: id("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id,
      round: item.approvalRound, kind: "submitted", outcome: "under_review",
      reviewerId: item.approvalReviewerId || item.ownerId || "",
      correctionOwnerId: item.correctionOwnerId || "", reason,
      previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso(),
    };
    item.approvalRequestId ||= item.id;
    state.approvalDecisions.push(submission);
    setApprovalStatus(item, "under_review", "approval_submitted", reason || "Etapa enviada para decisão.");
    return submission;
  }

  function decideApproval(itemId, outcome, reason = "", correctionOwnerId = "") {
    const item = getItem(itemId), user = currentUser(), cleanReason = reason.trim();
    if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprovação.");
    if (!canDecideApproval(user, item)) throw new Error("Apenas o responsável pela decisão ou uma regra GPO autorizada pode decidir.");
    if (item.status !== "under_review") throw new Error("Esta etapa não está aguardando decisão.");
    if (!approvalGate(item).released) throw new Error("A aprovação ainda depende da conclusão de suas predecessoras.");
    if (!["approved", "rejected"].includes(outcome)) throw new Error("Selecione aprovar ou reprovar.");
    if (outcome === "rejected" && !cleanReason) throw new Error("Informe o motivo da reprovação.");
    let correctionOwner = null;
    if (outcome === "rejected") {
      correctionOwner = state.users.find((entry) => entry.id === correctionOwnerId && !entry.disabled && entry.organizationId === item.organizationId);
      if (!correctionOwner) throw new Error("Selecione um responsável ativo da mesma empresa para a correção.");
    }
    state.approvalDecisions ||= [];
    const decision = {
      id: id("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id,
      round: item.approvalRound || 1, kind: "decision", outcome, reviewerId: user.id,
      correctionOwnerId: correctionOwner?.id || item.correctionOwnerId || "", reason: cleanReason,
      previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso(),
    };
    state.approvalDecisions.push(decision);
    item.lastDecisionId = decision.id;
    if (outcome === "approved") {
      decision.revisionId = item.id;
      setApprovalStatus(item, "done", "approval_decided", cleanReason || "Aprovado e concluído.");
      return decision;
    }

    const originalParent = item.parentId || "", round = (item.approvalRound || 1) + 1;
    item.approvalRound = round;
    item.correctionOwnerId = correctionOwner.id;
    item.superseded = false;
    const startDate = item.plannedStartAt || today(), timestamp = nowIso();
    const correction = {
      id: id("item"), title: `Corrigir: ${item.title}`, type: "task", status: "backlog",
      blocked: false, blockedReason: "", blockedAt: "", priority: "media",
      ownerId: correctionOwner.id, createdBy: correctionOwner.id,
      organizationId: correctionOwner.organizationId, sectorId: correctionOwner.sectorId,
      state: correctionOwner.state || item.state, parentId: originalParent,
      sortOrder: state.items.filter((entry) => entry.parentId === originalParent).length * 100,
      description: cleanReason, plannedStartAt: startDate, dueAt: startDate,
      plannedDurationDays: 1, baselineStartAt: startDate, baselineDueAt: startDate,
      replannedDueAt: "", weight: 1, progressPercent: 0, completedAt: "", actualStartAt: "",
      createdAt: timestamp, updatedAt: timestamp, lastChangeAt: timestamp,
      correctionFor: item.id, approvalRound: round,
    };
    state.items.push(correction);
    const relation = {
      id: id("rel"), sourceId: correction.id, targetId: item.id, relationType: "TI", lagDays: 0,
      description: "Correção obrigatória antes do reenvio.", createdBy: user.id, createdAt: timestamp,
    };
    state.relations.push(relation);
    item.correctionItemId = correction.id;
    decision.correctionItemId = correction.id;
    createEvent(correction.id, "created", "", correction.title, "Correção vinculada à aprovação original.");
    createEvent(item.id, "relation_created", "", "TI", "Correção vinculada por precedência TI.");
    recalculatePlannedDates();
    setApprovalStatus(item, "correction", "approval_decided", cleanReason);
    createEvent(correction.id, "approval_revision_started", item.id, correction.id, cleanReason);
    syncParentSummary(originalParent);
    return decision;
  }

  function reopenApproval(itemId, note = "", progressPercent) {
    const item = getItem(itemId), user = currentUser(), cleanNote = note.trim(), progress = Number(progressPercent);
    if (!item || item.type !== "approval" || item.status !== "done") throw new Error("Somente uma aprovação concluída pode ser reaberta.");
    if (!canDecideApproval(user, item)) throw new Error("Sua regra GPO não permite reabrir esta aprovação.");
    if (!cleanNote) throw new Error("Descreva o motivo da reabertura.");
    if (!Number.isFinite(progress) || progress < 0 || progress >= 100 || progress === Number(item.progressPercent))
      throw new Error("Informe um novo percentual entre 0% e 99% ao reabrir a aprovação.");
    item.approvalRound = (item.approvalRound || 1) + 1;
    state.approvalDecisions ||= [];
    const reopened = {
      id: id("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id,
      round: item.approvalRound, kind: "reopened", outcome: "backlog", reviewerId: item.ownerId || "",
      correctionOwnerId: item.ownerId || "", reason: cleanNote, previousDecisionId: item.lastDecisionId || "",
      createdBy: user.id, createdAt: nowIso(),
    };
    state.approvalDecisions.push(reopened);
    setApprovalStatus(item, "backlog", "approval_reopened", cleanNote);
    createEvent(item.id, "progress_changed", 100, progress, "Percentual informado ao reabrir a aprovação.");
    item.progressPercent = progress;
    return reopened;
  }

  function saveFlowTemplate(rootId, name) {
    const root = getItem(rootId), user = currentUser();
    if (!root || !canEditItem(user, root)) throw new Error("Sua regra GPO não permite salvar este fluxo como modelo.");
    const ids = itemTreeIds(new Set([rootId]));
    const eligibleItems = state.items.filter((item) => ids.has(item.id) && canViewItem(user, item));
    if (eligibleItems.length !== ids.size || eligibleItems.some((item) => !canEditItem(user, item)))
      throw new Error("Edite todos os itens do fluxo antes de criar um modelo.");
    const children = new Map();
    for (const item of eligibleItems) {
      if (!children.has(item.parentId)) children.set(item.parentId, []);
      children.get(item.parentId).push(item);
    }
    for (const siblings of children.values()) siblings.sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0));
    const sourceItems = [], visited = new Set(), pending = [root];
    while (pending.length) {
      const item = pending.pop();
      if (visited.has(item.id)) throw new Error("A estrutura do modelo contém um ciclo.");
      visited.add(item.id); sourceItems.push(item);
      pending.push(...[...(children.get(item.id) || [])].reverse());
    }
    if (sourceItems.length !== eligibleItems.length) throw new Error("A estrutura do modelo contém um item sem pai válido.");
    const baseDate = root.plannedStartAt || today();
    const items = sourceItems.map((item) => ({
      key: item.id, parentKey: ids.has(item.parentId) ? item.parentId : "", title: item.title,
      type: item.type, status: item.status, ownerId: item.ownerId || "", description: item.description || "",
      plannedDurationDays: item.plannedDurationDays == null || item.plannedDurationDays === "" ? null : Number(item.plannedDurationDays),
      startOffset: Math.round((new Date(`${item.plannedStartAt || baseDate}T12:00:00`) - new Date(`${baseDate}T12:00:00`)) / 86400000),
      dueOffset: item.dueAt ? Math.round((new Date(`${item.dueAt}T12:00:00`) - new Date(`${baseDate}T12:00:00`)) / 86400000) : null,
      weight: Number(item.weight ?? 1),
    }));
    const relations = state.relations.filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId) && relation.relationType !== "contains")
      .map((relation) => ({ sourceKey: relation.sourceId, targetKey: relation.targetId, relationType: relation.relationType, lagDays: relation.lagDays || 0 }));
    state.templates ||= [];
    const template = { id: id("template"), name: name.trim(), organizationId: root.organizationId, createdBy: user.id, createdAt: nowIso(), rootTitle: root.title, items, relations };
    state.templates.push(template);
    registryEvent("template", template, "Fluxo salvo como modelo.", "created");
    return template;
  }

  function applyFlowTemplate(templateId, input) {
    const user = currentUser(), template = state.templates?.find((entry) => entry.id === templateId);
    if (!template) throw new Error("Modelo não encontrado.");
    if (template.organizationId !== user?.organizationId && !canManageGpo(user)) throw new Error("Este modelo pertence a outra empresa.");
    const parent = { type: "project", organizationId: input.organizationId, sectorId: input.sectorId, state: input.state, createdBy: user?.id };
    if (!canCreateItem(user, parent)) throw new Error("Sua regra GPO não permite criar itens neste contexto.");
    if (!template.items?.length) throw new Error("O modelo não contém itens.");
    const snapshot = JSON.stringify(state);
    try {
      const ids = new Map(), created = [];
      for (const source of template.items) {
        const parentId = source.parentKey ? ids.get(source.parentKey) : "";
        if (source.parentKey && !parentId) throw new Error("A estrutura do modelo está inconsistente.");
        const eligibleOwners = state.users.filter((entry) => !entry.disabled && entry.organizationId === input.organizationId);
        const requestedOwner = input.ownerSelections?.[source.key] || source.ownerId;
        const ownerId = eligibleOwners.some((entry) => entry.id === requestedOwner) ? requestedOwner
          : eligibleOwners.some((entry) => entry.id === user.id) ? user.id : eligibleOwners[0]?.id || "";
        const owner = eligibleOwners.find((entry) => entry.id === ownerId);
        if (!owner) throw new Error("O modelo precisa de um responsável ativo na empresa de destino.");
        const status = source.type === "approval" ? "backlog" : input.statusSelections?.[source.key] || source.status || "backlog";
        const plannedStartAt = shiftedDate(input.startDate || today(), source.startOffset);
        const plannedDurationDays = Object.hasOwn(source, "plannedDurationDays")
          ? (source.plannedDurationDays == null || source.plannedDurationDays === "" ? null : Number(source.plannedDurationDays))
          : (source.dueOffset == null ? null : inclusiveDurationDays(plannedStartAt, shiftedDate(input.startDate || today(), source.dueOffset)));
        const item = createItem({
          title: source.key === template.items[0].key ? input.title.trim() : source.title,
          type: source.type, status, ownerId, organizationId: owner.organizationId, sectorId: owner.sectorId,
          state: owner.state, parentId, description: source.description, plannedStartAt, plannedDurationDays,
          dueAt: plannedDurationDays === null ? "" : inclusiveFinishDate(plannedStartAt, plannedDurationDays),
          weight: source.weight ?? 1, progressPercent: completeStatus(status) ? 100 : 0, templateInstance: true,
        });
        ids.set(source.key, item.id); created.push(item);
      }
      for (const relation of template.relations || []) {
        const sourceId = ids.get(relation.sourceKey), targetId = ids.get(relation.targetKey);
        if (!sourceId || !targetId) throw new Error("Uma relação do modelo perdeu sua referência.");
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
    if (!template) throw new Error("Modelo não encontrado.");
    if (template.createdBy !== user?.id && !canManageGpo(user)) throw new Error("Somente quem criou o modelo ou alguém autorizado no GPO pode removê-lo.");
    state.templates = state.templates.filter((entry) => entry.id !== templateId);
    registryEvent("template", template, "Modelo removido.", "removed");
  }

  return { submitApprovalForReview, decideApproval, reopenApproval, saveFlowTemplate, applyFlowTemplate, removeFlowTemplate };
}

function defaultShiftedDate(value, offset = 0) {
  const date = new Date(`${value || new Date().toISOString().slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() + Number(offset || 0));
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function defaultInclusiveDurationDays(start, finish) {
  return Math.max(0, Math.round((new Date(`${finish}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) + 1);
}

function defaultInclusiveFinishDate(start, duration) {
  if (Number(duration) <= 0) return start;
  return defaultShiftedDate(start, Math.ceil(Number(duration)) - 1);
}
