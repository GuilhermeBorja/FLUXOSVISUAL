const STORAGE_KEY = "fluxosVisualState.v2";

const permissionLevels = {
  1: "Visualizar e editar apenas dados criados por você",
  2: "Apenas visualizar todos os dados do seu estado",
  3: "Visualizar e editar todos os dados do seu estado",
  4: "Apenas visualizar todos os dados do seu setor",
  5: "Visualizar e editar todos os dados do seu setor",
  6: "Apenas visualizar todos os dados da sua empresa",
  7: "Visualizar e editar todos os dados da sua empresa",
  8: "Visualizar todos os dados",
  9: "Visualizar e editar todos os dados",
  10: "Visualizar, editar e remover todos os dados, criar e apagar usuários",
};

const statusCatalog = [
  { id: "backlog", label: "Backlog" },
  { id: "ready", label: "Pronto" },
  { id: "in_progress", label: "Em execução" },
  { id: "waiting", label: "Aguardando" },
  { id: "blocked", label: "Bloqueado" },
  { id: "under_review", label: "Em análise" },
  { id: "approved", label: "Aprovado" },
  { id: "rejected", label: "Rejeitado" },
  { id: "correction", label: "Em correção" },
  { id: "done", label: "Concluído" },
  { id: "cancelled", label: "Cancelado" },
];

const itemTypes = [
  { id: "project", label: "Projeto" },
  { id: "process", label: "Processo" },
  { id: "stage", label: "Etapa" },
  { id: "substage", label: "Subetapa" },
  { id: "task", label: "Tarefa" },
  { id: "approval", label: "Aprovação" },
  { id: "blocker", label: "Bloqueio" },
  { id: "deliverable", label: "Entrega" },
  { id: "milestone", label: "Marco" },
  { id: "document", label: "Documento" },
];

const relationTypes = [
  { id: "contains", label: "Contém" },
  { id: "TI", label: "TI · Término / Início" },
  { id: "II", label: "II · Início / Início" },
  { id: "TT", label: "TT · Término / Término" },
  { id: "IF", label: "IF · Início / Fim" },
  { id: "blocks", label: "Bloqueia" },
  { id: "approves", label: "Aprova" },
  { id: "relates_to", label: "Conecta" },
];

const permissionOperationLabels = {
  view_item: "Visualizar item",
  create_item: "Criar item",
  edit_item: "Editar item",
  delete_item: "Excluir item",
  create_relation: "Criar relação",
  delete_relation: "Excluir relação",
  change_owner: "Alterar responsável",
  change_due: "Alterar prazo",
  create_approval: "Configurar aprovação",
  decide_approval: "Decidir aprovação",
  manage_users: "Gerenciar usuários",
};

const app = document.querySelector("#app");
let state = loadState();
let ui = {
  selectedItemId: "",
  overviewMode: "table",
  showSubitems: false,
  expanded: new Set(),
  grouping: "project",
  scopeId: "all",
  positions: {},
  panel: "",
  panelTab: "details",
  adminTab: "users",
  createParentId: "",
  filtersOpen: false,
};

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function today(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function nowIso() {
  return new Date().toISOString();
}

function toLocalInput(value = nowIso()) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return "Sem prazo";
  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function labelOf(collection, id) {
  return collection.find((item) => item.id === id)?.label || id || "-";
}

function option(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || null;
}

function orgName(id) {
  return state.organizations.find((org) => org.id === id)?.name || state.archivedOrganizations?.find((org) => org.id === id)?.name || "-";
}

function sectorName(id) {
  return state.sectors.find((sector) => sector.id === id)?.name || state.archivedSectors?.find((sector) => sector.id === id)?.name || "-";
}

function userName(id) {
  return state.users.find((user) => user.id === id)?.name || state.archivedUsers?.find((user) => user.id === id)?.name || "Sem responsável";
}

function getItem(id) {
  return state.items.find((item) => item.id === id);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.version === 2) {
        parsed.permissionRules ||= [];
        parsed.approvalDecisions ||= [];
        parsed.templates ||= [];
        for (const item of parsed.items || []) if (item.type === "approval") item.approvalRound ||= 1;
        return parsed;
      }
    } catch (error) {
      console.warn("Estado local invalido. Restaurando exemplo.", error);
    }
  }
  const seeded = seedState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function seedState() {
  const base = {
    version: 2,
    currentUserId: "",
    activePage: "overview",
    filters: { query: "", status: "all", type: "all", owner: "all" },
    organizations: [
      { id: "org_castro", name: "Castro Industrial", state: "PE" },
      { id: "org_dmk", name: "DMK / Rocha", state: "PE" },
      { id: "org_partner", name: "Parceiros Tecnicos", state: "PE" },
    ],
    sectors: [
      { id: "sec_pmo", organizationId: "org_castro", name: "PMO" },
      { id: "sec_obra", organizationId: "org_castro", name: "Obra" },
      { id: "sec_rh", organizationId: "org_castro", name: "RH" },
      { id: "sec_diretoria", organizationId: "org_castro", name: "Diretoria" },
      { id: "sec_ti", organizationId: "org_castro", name: "TI" },
      { id: "sec_fornecedor", organizationId: "org_dmk", name: "Fornecedor" },
      { id: "sec_tecnico", organizationId: "org_partner", name: "Projetos" },
    ],
    users: [
      {
        id: "u_luis",
        name: "Luis",
        email: "luis@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_pmo",
        permissionLevel: 10,
      },
      {
        id: "u_virginia",
        name: "Virginia",
        email: "virginia@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_diretoria",
        permissionLevel: 7,
      },
      {
        id: "u_eduardo",
        name: "Eduardo",
        email: "eduardo@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_diretoria",
        permissionLevel: 8,
      },
      {
        id: "u_enrique",
        name: "Enrique",
        email: "enrique@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_obra",
        permissionLevel: 5,
      },
      {
        id: "u_mateus",
        name: "Mateus",
        email: "mateus@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_rh",
        permissionLevel: 3,
      },
      {
        id: "u_dmk",
        name: "Fornecedor DMK",
        email: "contato@dmk.com",
        state: "PE",
        organizationId: "org_dmk",
        sectorId: "sec_fornecedor",
        permissionLevel: 2,
      },
    ],
    items: [],
    relations: [],
    events: [],
    permissionRules: [],
    approvalDecisions: [],
    templates: [],
  };

  const adm = createSeedItem(base, {
    id: "item_adm",
    title: "Contratacao de novo ADM",
    type: "project",
    status: "in_progress",
    ownerId: "u_mateus",
    sectorId: "sec_rh",
    dueAt: today(24),
    description: "Projeto de contratacao de um novo administrativo para a obra.",
  });

  const admSteps = [
    ["item_adm_scope", "Elaborar escopo da vaga", "stage", "done", "u_mateus", 2],
    ["item_adm_publish", "Publicar nos locais", "substage", "done", "u_mateus", 4],
    ["item_adm_cv", "Receber todos os curriculos", "substage", "in_progress", "u_mateus", 10],
    ["item_adm_triage", "Triar candidatos", "substage", "waiting", "u_mateus", 14],
    ["item_adm_interview", "Entrevista com gestor", "substage", "backlog", "u_enrique", 18],
    ["item_adm_approval", "Aprovar contratacao", "approval", "under_review", "u_eduardo", 22],
  ].map(([id, title, type, status, ownerId, due]) =>
    createSeedItem(base, {
      id,
      title,
      type,
      status,
      ownerId,
      sectorId: "sec_rh",
      parentId: adm.id,
      dueAt: today(due),
      description: `Subetapa do fluxo ${adm.title}.`,
    })
  );
  admSteps.forEach((item) => createSeedRelation(base, adm.id, item.id, "contains"));
  for (let index = 0; index < admSteps.length - 1; index += 1) {
    createSeedRelation(base, admSteps[index].id, admSteps[index + 1].id, "TI");
  }

  const doors = createSeedItem(base, {
    id: "item_doors",
    title: "Contratar portas de madeira",
    type: "process",
    status: "under_review",
    ownerId: "u_luis",
    sectorId: "sec_pmo",
    dueAt: today(6),
    description: "Equalizacao e decisao de fornecedor para portas do Parque Suassuna.",
  });
  const doorsApproval = createSeedItem(base, {
    id: "item_doors_approval",
    title: "Validar condicoes criticas com diretoria",
    type: "approval",
    status: "under_review",
    ownerId: "u_eduardo",
    sectorId: "sec_diretoria",
    parentId: doors.id,
    dueAt: today(2),
    description: "Diretoria decide se negocia condicoes ou autoriza contratacao.",
  });
  const doorsRisk = createSeedItem(base, {
    id: "item_doors_risk",
    title: "Clausulas leoninas DMK",
    type: "blocker",
    status: "blocked",
    ownerId: "u_virginia",
    sectorId: "sec_diretoria",
    parentId: doors.id,
    dueAt: today(-1),
    description: "Multa de 50% e reprogramacao precisam de ciencia ou ajuste.",
  });
  createSeedRelation(base, doors.id, doorsApproval.id, "contains");
  createSeedRelation(base, doors.id, doorsRisk.id, "contains");
  createSeedRelation(base, doorsRisk.id, doorsApproval.id, "blocks");

  return base;
}

function createSeedItem(base, input) {
  const item = {
    id: input.id || uid("item"),
    title: input.title,
    type: input.type || "task",
    status: input.status || "backlog",
    priority: input.priority || "media",
    ownerId: input.ownerId || "u_luis",
    createdBy: input.createdBy || "u_luis",
    organizationId: input.organizationId || "org_castro",
    sectorId: input.sectorId || "sec_pmo",
    state: input.state || "PE",
    parentId: input.parentId || "",
    description: input.description || "",
    plannedStartAt: input.plannedStartAt || today(),
    dueAt: input.dueAt || "",
    completedAt: ["done", "approved"].includes(input.status) ? nowIso() : "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastChangeAt: nowIso(),
  };
  base.items.push(item);
  base.events.push({
    id: uid("event"),
    itemId: item.id,
    eventType: "created",
    fromValue: "",
    toValue: item.status,
    userId: item.createdBy,
    createdAt: item.createdAt,
    effectiveAt: item.createdAt,
    comment: "Item criado no exemplo inicial.",
  });
  return item;
}

function createSeedRelation(base, sourceId, targetId, type, lagDays = 0) {
  base.relations.push({
    id: uid("rel"),
    sourceId,
    targetId,
    relationType: type,
    lagDays,
    createdBy: "u_luis",
    createdAt: nowIso(),
  });
}

function projectRootId(item) {
  const seen = new Set();
  let cursor = item;
  let root = item;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (cursor.type === "project") return cursor.id;
    root = cursor;
    cursor = getItem(cursor.parentId);
  }
  return root?.id || "";
}

function gpoDecision(user, operation, item = null) {
  if (!user || user.disabled) return false;
  const ranks = { global: 1, organization: 2, sector: 3, project: 4, item: 5 };
  const matches = (state.permissionRules || []).filter((rule) => {
    const subjectMatches = rule.subjectType === "user"
      ? rule.subjectId === user.id
      : rule.subjectType === "level" && Number(rule.subjectId) === user.permissionLevel;
    if (!subjectMatches || rule.operation !== operation) return false;
    if (rule.scopeType === "global") return true;
    if (!item) return false;
    if (rule.scopeType === "organization") return item.organizationId === rule.scopeId;
    if (rule.scopeType === "sector") return item.sectorId === rule.scopeId;
    if (rule.scopeType === "item") return item.id === rule.scopeId;
    if (rule.scopeType === "project") return projectRootId(item) === rule.scopeId;
    return false;
  });
  if (!matches.length) return null;
  matches.sort((left, right) =>
    (ranks[right.scopeType] || 0) - (ranks[left.scopeType] || 0) ||
    Number(right.subjectType === "user") - Number(left.subjectType === "user") ||
    Number(left.effect === "allow") - Number(right.effect === "allow")
  );
  return matches[0].effect === "allow";
}

function canViewItem(user, item) {
  if (!user || user.disabled || !item) return false;
  const rule = gpoDecision(user, "view_item", item);
  if (rule !== null) return rule;
  if (user.permissionLevel === 1) return item.createdBy === user.id;
  if ([2, 3].includes(user.permissionLevel)) return item.state === user.state;
  if ([4, 5].includes(user.permissionLevel)) return item.sectorId === user.sectorId;
  if ([6, 7].includes(user.permissionLevel)) return item.organizationId === user.organizationId;
  if ([8, 9, 10].includes(user.permissionLevel)) return true;
  return false;
}

function canEditItem(user, item) {
  if (!user || user.disabled || !item) return false;
  const rule = gpoDecision(user, "edit_item", item);
  if (rule !== null) return rule;
  if (user.permissionLevel === 1) return item.createdBy === user.id;
  if (user.permissionLevel === 3) return item.state === user.state;
  if (user.permissionLevel === 5) return item.sectorId === user.sectorId;
  if (user.permissionLevel === 7) return item.organizationId === user.organizationId;
  if ([9, 10].includes(user.permissionLevel)) return true;
  return false;
}

function canCreateItem(user, item = null) {
  if (!user || user.disabled) return false;
  const rule = gpoDecision(user, "create_item", item);
  if (rule !== null) return rule;
  if (!item && (state.permissionRules || []).some((entry) =>
    entry.operation === "create_item" && entry.effect === "allow" &&
    (entry.subjectType === "user" ? entry.subjectId === user.id : Number(entry.subjectId) === user.permissionLevel)
  )) return true;
  return [1, 3, 5, 7, 9, 10].includes(user.permissionLevel);
}

function canRemoveItem(user, item = null) {
  if (!user || user.disabled) return false;
  const rule = gpoDecision(user, "delete_item", item);
  if (rule !== null) return rule;
  return user.permissionLevel === 10;
}

function canManageUsers(user) {
  if (!user || user.disabled) return false;
  if (user.permissionLevel === 10) return true;
  const rule = gpoDecision(user,"manage_users",null);
  return rule === true;
}

function canManageGpo(user) {
  return !!user && !user.disabled && user.permissionLevel === 10;
}

function createPermissionRule(input) {
  const user = currentUser();
  if (!canManageGpo(user)) throw new Error("Somente o nível 10 pode configurar o GPO demonstrativo.");
  if (!Object.hasOwn(permissionOperationLabels, input.operation)) throw new Error("Selecione uma operação do GPO.");
  if (!["user", "level"].includes(input.subjectType)) throw new Error("Selecione um usuário ou nível.");
  if (input.subjectType === "user" && !state.users.some((entry) => entry.id === input.subjectId && !entry.disabled)) throw new Error("Selecione um usuário ativo.");
  if (input.subjectType === "level" && !Object.hasOwn(permissionLevels, input.subjectId)) throw new Error("Selecione um nível válido.");
  if (!["global", "organization", "sector", "project", "item"].includes(input.scopeType)) throw new Error("Selecione um escopo válido.");
  if (input.scopeType === "organization" && !state.organizations.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione uma empresa.");
  if (input.scopeType === "sector" && !state.sectors.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione um setor.");
  if (input.scopeType === "project" && !state.items.some((entry) => entry.id === input.scopeId && entry.type === "project")) throw new Error("Selecione um projeto.");
  if (input.scopeType === "item" && !getItem(input.scopeId)) throw new Error("Selecione um item.");
  if (input.operation === "manage_users" && input.scopeType !== "global") throw new Error("A gestão de usuários exige uma regra global nesta versão demonstrativa.");
  if (!["allow", "deny"].includes(input.effect)) throw new Error("Selecione permitir ou negar.");
  state.permissionRules ||= [];
  const duplicate = state.permissionRules.some((rule) =>
    rule.subjectType === input.subjectType && rule.subjectId === input.subjectId &&
    rule.operation === input.operation && rule.scopeType === input.scopeType &&
    rule.scopeId === (input.scopeId || "") && rule.effect === input.effect
  );
  if (duplicate) throw new Error("Esta regra GPO já existe.");
  const rule = { id: uid("gpo"), ...input, scopeId: input.scopeId || "", createdBy: user.id, createdAt: nowIso() };
  state.permissionRules.push(rule);
  registryEvent("permission", rule, "Regra GPO demonstrativa criada.", "created");
  return rule;
}

function removePermissionRule(id) {
  if (!canManageGpo(currentUser())) throw new Error("Somente o nível 10 pode alterar o GPO demonstrativo.");
  const rule = state.permissionRules?.find((entry) => entry.id === id);
  if (!rule) throw new Error("Regra GPO não encontrada.");
  state.permissionRules = state.permissionRules.filter((entry) => entry.id !== id);
  registryEvent("permission", rule, "Regra GPO demonstrativa removida.", "removed");
}

function approvalGate(itemOrId) {
  const item = typeof itemOrId === "string" ? getItem(itemOrId) : itemOrId;
  if (!item || item.type !== "approval") return { released: false, blockers: [] };
  const prerequisiteTypes = new Set(["TI", "II", "TT", "IF", "blocks", "approves"]);
  const blockers = (state.relations || [])
    .filter((relation) => relation.targetId === item.id && prerequisiteTypes.has(relation.relationType))
    .map((relation) => getItem(relation.sourceId))
    .filter((source) => source && !["done", "approved"].includes(source.status));
  return { released: blockers.length === 0, blockers };
}

function canDecideApproval(user, item) {
  if (!user || user.disabled || !item || item.type !== "approval" || !canViewItem(user, item)) return false;
  const rule = gpoDecision(user, "decide_approval", item);
  if (rule !== null) return rule;
  return canEditItem(user, item) && (item.ownerId === user.id || user.permissionLevel === 10);
}

function canSubmitApproval(user, item) {
  if (!user || user.disabled || !item || item.type !== "approval" || !canEditItem(user, item)) return false;
  const rule = gpoDecision(user, "create_approval", item);
  return rule === null ? true : rule;
}

function setApprovalStatus(item, nextStatus, eventType, comment = "") {
  const previous = item.status;
  item.status = nextStatus;
  item.updatedAt = nowIso();
  item.lastChangeAt = item.updatedAt;
  item.completedAt = ["approved", "done"].includes(nextStatus) ? item.updatedAt : "";
  createEvent(item.id, eventType, previous, nextStatus, comment, item.updatedAt);
}

function submitApprovalForReview(id, note = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprovação.");
  if (!canSubmitApproval(user, item)) throw new Error("Sua alçada não permite enviar esta etapa para aprovação.");
  if (!approvalGate(item).released) throw new Error("A aprovação ainda depende da conclusão de suas predecessoras.");
  if (!["backlog", "ready", "in_progress", "correction"].includes(item.status)) throw new Error("Esta etapa não está pronta para ser enviada.");
  if (item.status === "correction" && item.correctionOwnerId !== user.id && user.permissionLevel !== 10) throw new Error("Somente o responsável pela correção pode reenviar esta etapa.");
  item.approvalRound ||= 1;
  const previousDecision = item.lastDecisionId || "";
  state.approvalDecisions ||= [];
  const submission = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound, kind: "submitted", outcome: "under_review", reviewerId: item.ownerId || "", correctionOwnerId: item.correctionOwnerId || "", reason: note.trim(), previousDecisionId: previousDecision, createdBy: user.id, createdAt: nowIso() };
  item.approvalRequestId ||= item.id;
  state.approvalDecisions.push(submission);
  setApprovalStatus(item, "under_review", "approval_submitted", note.trim() || "Etapa enviada para decisão.");
  return submission;
}

function decideApproval(id, outcome, reason = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprovação.");
  if (!canDecideApproval(user, item)) throw new Error("Apenas o responsável pela decisão ou uma alçada autorizada pode decidir.");
  if (item.status !== "under_review") throw new Error("Esta etapa não está aguardando decisão.");
  if (!approvalGate(item).released) throw new Error("A aprovação ainda depende da conclusão de suas predecessoras.");
  if (!["approved", "rejected"].includes(outcome)) throw new Error("Selecione aprovar ou reprovar.");
  if (outcome === "rejected" && !reason.trim()) throw new Error("Informe o motivo da reprovação.");
  state.approvalDecisions ||= [];
  const decision = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound || 1, kind: "decision", outcome, reviewerId: user.id, correctionOwnerId: item.correctionOwnerId || "", reason: reason.trim(), previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso() };
  state.approvalDecisions.push(decision);
  item.lastDecisionId = decision.id;
  setApprovalStatus(item, outcome, "approval_decided", reason.trim() || (outcome === "approved" ? "Aprovado." : "Reprovado."));
  return decision;
}

function startApprovalRevision(id, correctionOwnerId, note = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval" || item.status !== "rejected") throw new Error("Somente uma etapa reprovada pode iniciar correção.");
  if (!canDecideApproval(user, item)) throw new Error("Sua alçada não permite iniciar este ciclo de correção.");
  const owner = state.users.find((entry) => entry.id === correctionOwnerId && !entry.disabled && entry.organizationId === item.organizationId);
  if (!owner) throw new Error("Selecione um responsável ativo da mesma empresa.");
  if (!note.trim()) throw new Error("Descreva a correção solicitada.");
  item.approvalRound = (item.approvalRound || 1) + 1;
  item.correctionOwnerId = owner.id;
  state.approvalDecisions ||= [];
  const revision = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound, kind: "correction_started", outcome: "correction", reviewerId: item.ownerId || "", correctionOwnerId: owner.id, reason: note.trim(), previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso() };
  state.approvalDecisions.push(revision);
  setApprovalStatus(item, "correction", "approval_revision_started", note.trim());
  return revision;
}

function visibleItems() {
  const user = currentUser();
  const query = state.filters.query.trim().toLowerCase();
  return state.items
    .filter((item) => canViewItem(user, item))
    .filter((item) => state.filters.status === "all" || item.status === state.filters.status)
    .filter((item) => state.filters.type === "all" || item.type === state.filters.type)
    .filter((item) => state.filters.owner === "all" || item.ownerId === state.filters.owner)
    .filter((item) => {
      if (!query) return true;
      return [
        item.title,
        item.description,
        item.status,
        item.type,
        orgName(item.organizationId),
        sectorName(item.sectorId),
        userName(item.ownerId),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
}

function visibleRelations() {
  const ids = new Set(visibleItems().map((item) => item.id));
  return state.relations.filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId));
}

function visibleEvents() {
  const ids = new Set(visibleItems().map((item) => item.id));
  return state.events
    .filter((event) => ids.has(event.itemId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function isOverdue(item) {
  if (!item.dueAt || ["done", "approved", "cancelled"].includes(item.status)) return false;
  return new Date(`${item.dueAt}T00:00:00`) < new Date(`${today()}T00:00:00`);
}

function signalOf(item) {
  if (item.status === "blocked" || isOverdue(item)) return "red";
  if (["done", "approved"].includes(item.status)) return "green";
  if (["in_progress"].includes(item.status)) return "blue";
  if (["waiting", "under_review", "ready", "correction"].includes(item.status)) return "yellow";
  return "gray";
}

function createItem(input) {
  const user = currentUser();
  if (!canCreateItem(user, input)) throw new Error("Sua alçada não permite criar itens neste escopo.");
  validateItemInput(input);
  if (input.type === "approval" && ["approved", "rejected", "correction", "under_review"].includes(input.status)) throw new Error("A etapa deve entrar no fluxo antes de receber uma decisão.");
  if (input.parentId && !canEditItem(user, getItem(input.parentId))) throw new Error("Sem permissao para alterar o item pai.");
  if (!canCreateItem(user, { ...input, createdBy: user.id })) throw new Error("O escopo do novo item não está autorizado.");
  const item = {
    id: uid("item"),
    title: input.title,
    type: input.type || "task",
    status: input.status || "backlog",
    priority: input.priority || "media",
    ownerId: input.ownerId,
    createdBy: user.id,
    organizationId: input.organizationId,
    sectorId: input.sectorId,
    state: input.state,
    parentId: input.parentId || "",
    description: input.description || "",
    plannedStartAt: input.plannedStartAt || today(),
    dueAt: input.dueAt || "",
    completedAt: ["done", "approved"].includes(input.status) ? nowIso() : "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastChangeAt: nowIso(),
  };
  state.items.push(item);
  createEvent(item.id, "created", "", item.status, "Item criado.", item.createdAt);
  if (item.parentId) createRelation(item.parentId, item.id, "contains", 0);
  return item;
}

function createRelation(sourceId, targetId, relationType, lagDays = 0) {
  const source = getItem(sourceId);
  const target = getItem(targetId);
  if (!source || !target || sourceId === targetId) throw new Error("Escolha dois itens diferentes.");
  if (!relationTypes.some((type) => type.id === relationType)) throw new Error("Tipo de relacao invalido.");
  const user = currentUser();
  const targetIsNewlyOwned = target.createdBy === user?.id && canCreateItem(user,target);
  if (!canEditItem(user, source) || (!canEditItem(user, target) && !targetIsNewlyOwned)) throw new Error("Sua alçada deve permitir editar os dois itens.");
  if (gpoDecision(currentUser(), "create_relation", target) === false) throw new Error("O GPO nega a criação de relações neste escopo.");
  if (!Number.isFinite(Number(lagDays))) throw new Error("Informe uma defasagem numerica.");
  if (relationType === "contains") {
    const ancestors = new Set();
    let cursor = source;
    while (cursor && !ancestors.has(cursor.id)) {
      if (cursor.id === targetId) throw new Error("A hierarquia nao pode conter ciclos.");
      ancestors.add(cursor.id);
      cursor = getItem(cursor.parentId);
    }
    if (target.parentId && target.parentId !== sourceId) throw new Error("O item ja possui um pai. Use outra relacao para conexoes transversais.");
  }
  const exists = state.relations.some(
    (relation) =>
      relation.sourceId === sourceId &&
      relation.targetId === targetId &&
      relation.relationType === relationType
  );
  if (exists) throw new Error("Essa relacao ja existe.");
  const relation = {
    id: uid("rel"),
    sourceId,
    targetId,
    relationType,
    lagDays: Number(lagDays) || 0,
    createdBy: currentUser()?.id || "system",
    createdAt: nowIso(),
  };
  state.relations.push(relation);
  if (relationType === "contains") target.parentId = sourceId;
  createEvent(targetId, "relation_created", "", relationType, `Relacao criada a partir de ${getItem(sourceId)?.title}.`);
  return relation;
}

function createEvent(itemId, eventType, fromValue, toValue, comment, effectiveAt = nowIso()) {
  state.events.push({
    id: uid("event"),
    itemId,
    eventType,
    fromValue,
    toValue,
    userId: currentUser()?.id || "system",
    createdAt: nowIso(),
    effectiveAt,
    comment: comment || "",
  });
}

function validateItemInput(input, existing = null) {
  if (!input.title?.trim()) throw new Error("Informe o nome do item.");
  if (!itemTypes.some((type) => type.id === input.type)) throw new Error("Tipo de item inválido.");
  if (!statusCatalog.some((status) => status.id === input.status)) throw new Error("Status inválido.");
  if (!state.organizations.some((org) => org.id === input.organizationId)) throw new Error("Selecione uma empresa.");
  if (!state.sectors.some((sector) => sector.id === input.sectorId && sector.organizationId === input.organizationId)) throw new Error("Cadastre ou selecione um setor desta empresa.");
  if (!/^[A-Z]{2}$/.test(input.state || "")) throw new Error("Informe a UF com duas letras.");
  if (input.ownerId && !state.users.some((user) => user.id === input.ownerId && (!user.disabled || existing?.ownerId === user.id))) throw new Error("Selecione um responsável ativo.");
  for (const field of ["plannedStartAt", "dueAt"]) {
    if (input[field] && (!/^\d{4}-\d{2}-\d{2}$/.test(input[field]) || !Number.isFinite(new Date(`${input[field]}T12:00:00`).getTime()))) throw new Error("Informe uma data válida.");
  }
  const changedDates = !existing || existing.plannedStartAt !== input.plannedStartAt || existing.dueAt !== input.dueAt;
  if (changedDates && input.plannedStartAt && input.dueAt && input.dueAt < input.plannedStartAt) throw new Error("O término ideal deve ser igual ou posterior ao início previsto.");
}

function updateItem(id, input, effectiveAt = nowIso(), comment = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!canEditItem(user,item)) throw new Error("Sua alçada não permite editar este item.");
  validateItemInput(input,item);
  if (!canEditItem(user,{...item,...input})) throw new Error("O novo contexto deve permanecer dentro da sua alçada.");
  if (!Number.isFinite(new Date(effectiveAt).getTime())) throw new Error("Informe a data e hora da mudança.");
  if (item.type === "approval" && input.status !== item.status) throw new Error("Use a aba Aprovação para enviar, aprovar, reprovar ou iniciar uma correção.");
  if ((item.type === "approval") !== (input.type === "approval")) throw new Error("Crie um novo item para alterar o tipo de uma etapa de aprovação.");
  const fields = {title:"title_changed",type:"type_changed",status:"status_changed",ownerId:"owner_changed",dueAt:"due_changed",plannedStartAt:"start_changed",description:"description_changed",organizationId:"context_changed",sectorId:"context_changed",state:"context_changed"};
  let changed = false;
  const wasComplete = ["done","approved"].includes(item.status);
  for (const [field,eventType] of Object.entries(fields)) {
    const next = input[field] ?? item[field];
    if (next === item[field]) continue;
    const operation = field === "ownerId" ? "change_owner" : ["dueAt", "plannedStartAt"].includes(field) ? "change_due" : "";
    if (operation && gpoDecision(user, operation, item) === false) throw new Error("O GPO nega esta alteração neste escopo.");
    createEvent(id,eventType,item[field],next,"",effectiveAt);
    item[field] = next; changed = true;
  }
  const complete = ["done","approved"].includes(item.status);
  if (complete && !wasComplete) { item.completedAt = effectiveAt; createEvent(id,"completed","",item.status,"",effectiveAt); }
  if (wasComplete && !complete) { item.completedAt = ""; createEvent(id,"reopened","","","Item reaberto.",effectiveAt); }
  if (comment.trim()) { createEvent(id,"comment","","",comment.trim(),effectiveAt); changed = true; }
  if (changed) { item.updatedAt = nowIso(); item.lastChangeAt = effectiveAt; }
  return changed;
}

function reopenApproval(id, note = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval" || item.status !== "approved") throw new Error("Somente uma aprovação concluída pode ser reaberta.");
  if (!canDecideApproval(user, item)) throw new Error("Sua alçada não permite reabrir esta aprovação.");
  if (!note.trim()) throw new Error("Descreva o motivo da reabertura.");
  item.approvalRound = (item.approvalRound || 1) + 1;
  state.approvalDecisions ||= [];
  const reopened = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound, kind: "reopened", outcome: "backlog", reviewerId: item.ownerId || "", correctionOwnerId: item.ownerId || "", reason: note.trim(), previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso() };
  state.approvalDecisions.push(reopened);
  setApprovalStatus(item, "backlog", "approval_reopened", note.trim());
  return reopened;
}

function shiftedDate(value, offset = 0) {
  const date = new Date((value || today()) + "T12:00:00");
  date.setDate(date.getDate() + Number(offset || 0));
  return [date.getFullYear(),String(date.getMonth() + 1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}

function saveFlowTemplate(rootId, name) {
  const root = getItem(rootId);
  const user = currentUser();
  if (!root || !canEditItem(user,root)) throw new Error("Sua alçada não permite salvar este fluxo como modelo.");
  const ids = itemTreeIds(new Set([rootId]));
  const sourceItems = state.items.filter((item) => ids.has(item.id) && canViewItem(user,item));
  if (sourceItems.length !== ids.size || sourceItems.some((item) => !canEditItem(user,item))) throw new Error("Edite todos os itens do fluxo antes de criar um modelo.");
  const baseDate = root.plannedStartAt || today();
  const items = sourceItems.map((item) => ({
    key:item.id,
    parentKey:ids.has(item.parentId) ? item.parentId : "",
    title:item.title,
    type:item.type,
    description:item.description || "",
    startOffset:Math.round((new Date((item.plannedStartAt || baseDate) + "T12:00:00") - new Date(baseDate + "T12:00:00")) / 86400000),
    dueOffset:item.dueAt ? Math.round((new Date(item.dueAt + "T12:00:00") - new Date(baseDate + "T12:00:00")) / 86400000) : null,
  }));
  const relations = state.relations.filter((relation) => ids.has(relation.sourceId) && ids.has(relation.targetId) && relation.relationType !== "contains").map((relation) => ({sourceKey:relation.sourceId,targetKey:relation.targetId,relationType:relation.relationType,lagDays:relation.lagDays || 0}));
  state.templates ||= [];
  const template = {id:uid("template"),name:name.trim(),organizationId:root.organizationId,createdBy:user.id,createdAt:nowIso(),rootTitle:root.title,items,relations};
  state.templates.push(template);
  registryEvent("template",template,"Fluxo salvo como modelo.","created");
  return template;
}

function applyFlowTemplate(templateId, input) {
  const user = currentUser();
  const template = state.templates?.find((entry) => entry.id === templateId);
  if (!template) throw new Error("Modelo não encontrado.");
  if (template.organizationId !== user?.organizationId && user?.permissionLevel !== 10) throw new Error("Este modelo pertence a outra empresa.");
  const parent = {type:"project",organizationId:input.organizationId,sectorId:input.sectorId,state:input.state,createdBy:user?.id};
  if (!canCreateItem(user,parent)) throw new Error("Sua alçada não permite criar itens neste contexto.");
  if (!template.items?.length) throw new Error("O modelo não contém itens.");
  const snapshot = JSON.stringify(state);
  try {
    const ids = new Map();
    const created = [];
    for (const source of template.items) {
      const parentId = source.parentKey ? ids.get(source.parentKey) : "";
      if (source.parentKey && !parentId) throw new Error("A estrutura do modelo está inconsistente.");
      const item = createItem({
        title:source.key === template.items[0].key ? input.title.trim() : source.title,
        type:source.type,
        status:"backlog",
        ownerId:user.id,
        organizationId:input.organizationId,
        sectorId:input.sectorId,
        state:input.state,
        parentId,
        description:source.description,
        plannedStartAt:shiftedDate(input.startDate || today(),source.startOffset),
        dueAt:source.dueOffset === null ? "" : shiftedDate(input.startDate || today(),source.dueOffset),
      });
      ids.set(source.key,item.id);
      created.push(item);
    }
    for (const relation of template.relations || []) {
      const sourceId = ids.get(relation.sourceKey);
      const targetId = ids.get(relation.targetKey);
      if (!sourceId || !targetId) throw new Error("Uma relação do modelo perdeu sua referência.");
      createRelation(sourceId,targetId,relation.relationType,relation.lagDays);
    }
    return {template,items:created};
  } catch (error) {
    const restored = JSON.parse(snapshot);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state,restored);
    throw error;
  }
}

function removeFlowTemplate(id) {
  const template = state.templates?.find((entry) => entry.id === id);
  if (!template) throw new Error("Modelo não encontrado.");
  if (template.createdBy !== currentUser()?.id && currentUser()?.permissionLevel !== 10) throw new Error("Somente quem criou o modelo ou o nível 10 pode removê-lo.");
  state.templates = state.templates.filter((entry) => entry.id !== id);
  registryEvent("template",template,"Modelo removido.","removed");
}

function removeRelation(id) {
  const relation = state.relations.find((entry) => entry.id === id);
  const target = relation && getItem(relation.targetId);
  const rule = target ? gpoDecision(currentUser(), "delete_relation", target) : null;
  if (rule === false || (rule === null && !canRemoveItem(currentUser()))) throw new Error("Sua alçada não permite remover relações neste escopo.");
  if (!relation) throw new Error("Relação não encontrada.");
  if (!canEditItem(currentUser(),getItem(relation.sourceId)) || !canEditItem(currentUser(),getItem(relation.targetId))) throw new Error("Sem permissão para remover esta relação.");
  if (relation.relationType === "contains") getItem(relation.targetId).parentId = "";
  createEvent(relation.targetId,"relation_removed",relation.relationType,"",`Relação com ${getItem(relation.sourceId).title} removida.`);
  archiveRecord("archivedRelations",relation);
  state.relations = state.relations.filter((entry) => entry.id !== id);
}

function requireDeletionPermission(item = null) {
  if (!canRemoveItem(currentUser(), item)) throw new Error(item ? "Sua alçada não permite excluir este item." : "Apenas o nível 10 pode excluir cadastros.");
}

function archiveRecord(collection,record) {
  state[collection] ||= [];
  state[collection].push({...record,removedAt:nowIso(),removedBy:currentUser().id});
}

function registryEvent(entityType,record,comment = "",eventType = "removed") {
  state.registryEvents ||= [];
  state.registryEvents.push({id:uid("registry_event"),entityType,entityId:record.id,eventType,name:record.name || record.operation || record.id,userId:currentUser().id,createdAt:nowIso(),comment});
}

function itemTreeIds(initialIds) {
  const ids = new Set(initialIds);
  const children = new Map();
  state.items.forEach((item) => { if (!children.has(item.parentId)) children.set(item.parentId,[]); children.get(item.parentId).push(item.id); });
  const queue = [...ids];
  for (let index = 0; index < queue.length; index++) {
    for (const id of children.get(queue[index]) || []) if (!ids.has(id)) { ids.add(id); queue.push(id); }
  }
  return ids;
}

function itemRemovalPlan(id,cascade = false) {
  requireDeletionPermission();
  const item = getItem(id);
  if (!item) throw new Error("Item não encontrado.");
  const treeIds = itemTreeIds([id]);
  const ids = cascade ? treeIds : new Set([id]);
  return {item,ids,descendantCount:treeIds.size-1,items:state.items.filter((entry) => ids.has(entry.id)),relations:state.relations.filter((rel) => ids.has(rel.sourceId) || ids.has(rel.targetId)),detached:state.items.filter((entry) => !ids.has(entry.id) && ids.has(entry.parentId))};
}

function removeItemsByIds(ids,reason) {
  const removed = state.items.filter((item) => ids.has(item.id));
  if (!removed.length && !canRemoveItem(currentUser())) requireDeletionPermission();
  for (const item of removed) requireDeletionPermission(item);
  const relations = state.relations.filter((rel) => ids.has(rel.sourceId) || ids.has(rel.targetId));
  const effectiveAt = nowIso();
  for (const item of state.items) {
    if (!ids.has(item.id) && ids.has(item.parentId)) {
      createEvent(item.id,"parent_changed",getItem(item.parentId)?.title || item.parentId,"", "Item pai excluído; subitem mantido como item independente.",effectiveAt);
      item.parentId = ""; item.updatedAt = effectiveAt; item.lastChangeAt = effectiveAt;
    }
  }
  for (const relation of relations) {
    archiveRecord("archivedRelations",relation);
    for (const endpoint of [relation.sourceId,relation.targetId]) {
      if (ids.has(endpoint)) continue;
      const other = getItem(endpoint === relation.sourceId ? relation.targetId : relation.sourceId);
      createEvent(endpoint,"relation_removed",relation.relationType,"",`Relação com ${other?.title || "item excluído"} removida pela exclusão do item.`,effectiveAt);
    }
  }
  for (const item of removed) {
    createEvent(item.id,"item_removed",item.title,"",reason,effectiveAt);
    archiveRecord("archivedItems",item);
  }
  state.items = state.items.filter((item) => !ids.has(item.id));
  state.relations = state.relations.filter((rel) => !ids.has(rel.sourceId) && !ids.has(rel.targetId));
  for (const positions of Object.values(state.graphPositions || {})) for (const id of ids) delete positions[id];
  return {items:removed.length,relations:relations.length};
}

function removeItem(id,{cascade = false,keepChildren = false} = {}) {
  const plan = itemRemovalPlan(id,cascade);
  if (plan.descendantCount && !cascade && !keepChildren) throw new Error("Escolha excluir os subitens ou mantê-los como itens independentes.");
  return removeItemsByIds(plan.ids,`Item excluído${cascade ? " com seus subitens" : ""}. Histórico preservado.`);
}

function removeUser(id,{replacementId = ""} = {}) {
  if (!canManageUsers(currentUser())) throw new Error("Sua alçada não permite gerenciar usuários.");
  const user = state.users.find((entry) => entry.id === id);
  if (!user) throw new Error("Usuário não encontrado.");
  if (user.id === currentUser().id) throw new Error("Entre com outro administrador para excluir o usuário conectado.");
  const replacement = replacementId && state.users.find((entry) => entry.id === replacementId && entry.id !== id && !entry.disabled);
  if (replacementId && !replacement) throw new Error("Selecione um responsável substituto ativo.");
  const items = state.items.filter((item) => item.ownerId === id);
  const effectiveAt = nowIso();
  for (const item of items) {
    createEvent(item.id,"owner_changed",id,replacementId,`Usuário ${user.name} excluído. ${replacement ? `Responsabilidade transferida para ${replacement.name}.` : "Item mantido sem responsável."}`,effectiveAt);
    item.ownerId = replacementId; item.updatedAt = effectiveAt; item.lastChangeAt = effectiveAt;
  }
  archiveRecord("archivedUsers",user);
  registryEvent("user",user,`${items.length} itens ${replacement ? "repassados" : "mantidos sem responsável"}.`);
  state.users = state.users.filter((entry) => entry.id !== id);
  if (state.filters.owner === id) state.filters.owner = "all";
  return {users:1,reassigned:items.length};
}

function removeSector(id,{replacementId = ""} = {}) {
  requireDeletionPermission();
  const sector = state.sectors.find((entry) => entry.id === id);
  if (!sector) throw new Error("Setor não encontrado.");
  const users = state.users.filter((user) => user.sectorId === id);
  const items = state.items.filter((item) => item.sectorId === id);
  const replacement = replacementId && state.sectors.find((entry) => entry.id === replacementId && entry.id !== id && entry.organizationId === sector.organizationId);
  if ((items.length || users.length || replacementId) && !replacement) throw new Error("Escolha outro setor da mesma empresa para receber os itens e usuários vinculados.");
  const effectiveAt = nowIso();
  for (const item of items) {
    createEvent(item.id,"context_changed",sector.name,replacement.name,"Setor excluído; item transferido para outro setor da mesma empresa.",effectiveAt);
    item.sectorId = replacement.id; item.updatedAt = effectiveAt; item.lastChangeAt = effectiveAt;
  }
  users.forEach((user) => { user.sectorId = replacement.id; });
  archiveRecord("archivedSectors",sector);
  registryEvent("sector",sector,`${items.length} itens e ${users.length} usuários transferidos${replacement ? ` para ${replacement.name}` : ""}.`);
  state.sectors = state.sectors.filter((entry) => entry.id !== id);
  return {sectors:1,items:items.length,users:users.length};
}

function organizationRemovalPlan(id) {
  requireDeletionPermission();
  const organization = state.organizations.find((entry) => entry.id === id);
  if (!organization) throw new Error("Empresa não encontrada.");
  const sectors = state.sectors.filter((sector) => sector.organizationId === id);
  const sectorIds = new Set(sectors.map((sector) => sector.id));
  const users = state.users.filter((user) => user.organizationId === id || sectorIds.has(user.sectorId));
  if (currentUser().organizationId === id || users.some((user) => user.id === currentUser().id)) throw new Error("Entre com um administrador de outra empresa para excluir a empresa do usuário conectado.");
  const ids = itemTreeIds(state.items.filter((item) => item.organizationId === id || sectorIds.has(item.sectorId)).map((item) => item.id));
  const userIds = new Set(users.map((user) => user.id));
  return {organization,sectors,users,ids,items:state.items.filter((item) => ids.has(item.id)),relations:state.relations.filter((rel) => ids.has(rel.sourceId) || ids.has(rel.targetId)),unassigned:state.items.filter((item) => !ids.has(item.id) && userIds.has(item.ownerId)),externalDescendants:state.items.filter((item) => ids.has(item.id) && item.organizationId !== id)};
}

function removeOrganization(id) {
  const plan = organizationRemovalPlan(id);
  const result = removeItemsByIds(plan.ids,`Empresa ${plan.organization.name} excluída com seus itens e subitens. Histórico preservado.`);
  plan.users.forEach((user) => removeUser(user.id));
  plan.sectors.forEach((sector) => removeSector(sector.id));
  archiveRecord("archivedOrganizations",plan.organization);
  registryEvent("organization",plan.organization,`${result.items} itens, ${plan.users.length} usuários e ${plan.sectors.length} setores excluídos.`);
  state.organizations = state.organizations.filter((entry) => entry.id !== id);
  return {...result,users:plan.users.length,sectors:plan.sectors.length,organizations:1};
}
