/** GPO rule and permitted-item queries with ambient UI state supplied explicitly. */
export function createGpoOperations({
  state,
  currentUser,
  canManageGpo,
  canViewItem,
  operationLabels,
  evaluatePermission,
  id,
  nowIso,
  registryEvent,
  itemById = (itemId) => state.items.find((item) => item.id === itemId),
  isBlocked = (item) => item?.status === "blocked",
  isOverdue = () => false,
  isAtRisk = () => false,
  orgName = (organizationId) => state.organizations.find((entry) => entry.id === organizationId)?.name
    || state.archivedOrganizations?.find((entry) => entry.id === organizationId)?.name || "-",
  sectorName = (sectorId) => state.sectors.find((entry) => entry.id === sectorId)?.name
    || state.archivedSectors?.find((entry) => entry.id === sectorId)?.name || "-",
  userName = (userId) => state.users.find((entry) => entry.id === userId)?.name
    || state.archivedUsers?.find((entry) => entry.id === userId)?.name || "Sem responsável",
} = {}) {
  for (const [name, value] of Object.entries({ state, currentUser, canManageGpo, canViewItem, operationLabels, evaluatePermission, id, nowIso, registryEvent })) {
    if (!value) throw new TypeError(`createGpoOperations requires ${name}`);
  }

  function gpoDecision(user, operation, item = null) {
    const decision = evaluatePermission(state, user, operation, item);
    return decision.reason === "no_applicable_rule" ? null : decision.allowed;
  }

  function createPermissionRule(input) {
    const user = currentUser();
    if (!canManageGpo(user)) throw new Error("Sua regra GPO não permite configurar permissões.");
    if (!Object.hasOwn(operationLabels, input.operation)) throw new Error("Selecione uma operação do GPO.");
    if (!["user", "profile"].includes(input.subjectType)) throw new Error("Selecione um usuário ou perfil GPO.");
    if (input.subjectType === "user" && !state.users.some((entry) => entry.id === input.subjectId && !entry.disabled)) throw new Error("Selecione um usuário ativo.");
    if (input.subjectType === "profile" && !(state.permissionProfiles || []).some((entry) => entry.id === input.subjectId)) throw new Error("Selecione um perfil GPO existente.");
    if (!["global", "state", "organization", "sector", "project", "item"].includes(input.scopeType)) throw new Error("Selecione um escopo válido.");
    if (input.scopeType === "state" && !/^[A-Z]{2}$/.test(input.scopeId || "")) throw new Error("Selecione um estado válido.");
    if (input.scopeType === "organization" && !state.organizations.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione uma empresa.");
    if (input.scopeType === "sector" && !state.sectors.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione um setor.");
    if (input.scopeType === "project" && !state.items.some((entry) => entry.id === input.scopeId && entry.type === "project")) throw new Error("Selecione um projeto.");
    if (input.scopeType === "item" && !itemById(input.scopeId)) throw new Error("Selecione um item.");
    if (input.operation === "manage_gpo" && input.scopeType !== "global") throw new Error("A configuração de GPO exige escopo global.");
    if (input.operation === "manage_organization" && !["global", "organization"].includes(input.scopeType)) throw new Error("A administração organizacional exige escopo global ou de empresa.");
    if (!["allow", "deny"].includes(input.effect)) throw new Error("Selecione permitir ou negar.");
    state.permissionRules ||= [];
    const scopeId = input.scopeId || "";
    const duplicate = state.permissionRules.some((rule) => rule.subjectType === input.subjectType
      && rule.subjectId === input.subjectId && rule.operation === input.operation
      && rule.scopeType === input.scopeType && rule.scopeId === scopeId && rule.effect === input.effect);
    if (duplicate) throw new Error("Esta regra GPO já existe.");
    const rule = { id: id("gpo"), ...input, scopeId, createdBy: user.id, createdAt: nowIso() };
    state.permissionRules.push(rule);
    registryEvent("permission", rule, "Regra GPO demonstrativa criada.", "created");
    return rule;
  }

  function removePermissionRule(ruleId) {
    if (!canManageGpo(currentUser())) throw new Error("Sua regra GPO não permite alterar permissões.");
    const rule = state.permissionRules?.find((entry) => entry.id === ruleId);
    if (!rule) throw new Error("Regra GPO não encontrada.");
    state.permissionRules = state.permissionRules.filter((entry) => entry.id !== ruleId);
    registryEvent("permission", rule, "Regra GPO demonstrativa removida.", "removed");
  }

  function visibleItems() {
    const user = currentUser();
    const filters = state.filters;
    const query = String(filters.query || "").trim().toLowerCase();
    return state.items
      .filter((item) => !item.archivedAt && canViewItem(user, item))
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .filter((item) => (filters.indicator || "all") === "all"
        || (filters.indicator === "blocked" && isBlocked(item))
        || (filters.indicator === "overdue" && isOverdue(item))
        || (filters.indicator === "risk" && isAtRisk(item)))
      .filter((item) => filters.type === "all" || item.type === filters.type)
      .filter((item) => filters.owner === "all" || item.ownerId === filters.owner)
      .filter((item) => filters.organization === "all" || item.organizationId === filters.organization)
      .filter((item) => filters.sector === "all" || item.sectorId === filters.sector)
      .filter((item) => filters.state === "all" || item.state === filters.state)
      .filter((item) => !query || [item.title, item.description, item.status, item.type,
        orgName(item.organizationId), sectorName(item.sectorId), userName(item.ownerId)]
        .join(" ").toLowerCase().includes(query));
  }

  return { gpoDecision, createPermissionRule, removePermissionRule, visibleItems };
}
