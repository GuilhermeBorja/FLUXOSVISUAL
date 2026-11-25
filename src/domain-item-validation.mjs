export const itemTypeIds = [
  "project", "process", "stage", "substage", "task", "approval", "deliverable", "milestone", "document",
];

export const statusIds = [
  "backlog", "ready", "in_progress", "waiting", "blocked", "under_review", "correction", "done", "cancelled",
];

export function normalizeLegacyBlocked(input) {
  if (input?.blocked === true && input.status !== "done" && input.status !== "cancelled") {
    return { ...input, status: "blocked" };
  }
  return input;
}

export function validateItemInput(input, existing = null, state) {
  if (!state || !Array.isArray(state.organizations) || !Array.isArray(state.sectors) || !Array.isArray(state.users)) {
    throw new TypeError("validateItemInput requires workspace organizations, sectors, and users");
  }
  if (!input.title?.trim()) throw new Error("Informe o nome do item.");
  if (!input.ownerId) throw new Error("Selecione um responsável.");
  // A block inherited from another activity does not need a manual reason.
  if (input.status === "blocked" && !existing?.blockedByPropagation
    && !String(input.blockedReason ?? existing?.blockedReason ?? "").trim()) {
    throw new Error("Informe o motivo do bloqueio manual.");
  }

  if (!itemTypeIds.includes(input.type)) throw new Error("Tipo de item inválido.");
  if (input.status !== undefined && !statusIds.includes(input.status)) throw new Error("Status inválido.");
  if (!state.organizations.some((organization) => organization.id === input.organizationId)) {
    throw new Error("Selecione uma empresa.");
  }
  if (!state.sectors.some((sector) => sector.id === input.sectorId && sector.organizationId === input.organizationId)) {
    throw new Error("Cadastre ou selecione um setor desta empresa.");
  }
  if (!/^[A-Z]{2}$/.test(input.state || "")) throw new Error("Informe a UF com duas letras.");
  if (input.ownerId && !state.users.some((user) => user.id === input.ownerId && (!user.disabled || existing?.ownerId === user.id))) {
    throw new Error("Selecione um responsável ativo.");
  }
  if (input.weight !== undefined && (!Number.isFinite(Number(input.weight)) || Number(input.weight) <= 0)) {
    throw new Error("O peso deve ser maior que zero.");
  }
  if (input.progressPercent !== undefined && (!Number.isFinite(Number(input.progressPercent)) || Number(input.progressPercent) < 0 || Number(input.progressPercent) > 100)) {
    throw new Error("O percentual deve ficar entre 0 e 100.");
  }
  if (input.plannedDurationDays !== undefined && input.plannedDurationDays !== null && input.plannedDurationDays !== ""
    && (!Number.isFinite(Number(input.plannedDurationDays)) || Number(input.plannedDurationDays) < 0)) {
    throw new Error("A duração deve ser um número de dias corridos igual ou maior que zero.");
  }
  if (input.replannedDueAt && (!/^\d{4}-\d{2}-\d{2}$/.test(input.replannedDueAt)
    || !Number.isFinite(new Date(`${input.replannedDueAt}T12:00:00`).getTime()))) {
    throw new Error("Informe uma data válida para a repactuação.");
  }
  for (const field of ["targetStartAt", "targetDueAt"]) {
    if (input[field] && (!/^\d{4}-\d{2}-\d{2}$/.test(input[field])
      || !Number.isFinite(new Date(`${input[field]}T12:00:00`).getTime()))) {
      throw new Error("Informe uma data-meta válida.");
    }
  }
  const targetStart = input.targetStartAt || existing?.targetStartAt || existing?.baselineStartAt || "";
  const targetEnd = input.targetDueAt || existing?.targetDueAt || existing?.baselineDueAt || "";
  if (targetStart && targetEnd && targetEnd < targetStart) {
    throw new Error("O término-meta não pode ser anterior ao início-meta.");
  }
  for (const field of ["plannedStartAt", "dueAt"]) {
    if (input[field] && (!/^\d{4}-\d{2}-\d{2}$/.test(input[field])
      || !Number.isFinite(new Date(`${input[field]}T12:00:00`).getTime()))) {
      throw new Error("Informe uma data válida.");
    }
  }
  const changedDates = !existing || existing.plannedStartAt !== input.plannedStartAt || existing.dueAt !== input.dueAt;
  if (changedDates && input.plannedStartAt && input.dueAt && input.dueAt < input.plannedStartAt) {
    throw new Error("O término ideal deve ser igual ou posterior ao início previsto.");
  }
}
