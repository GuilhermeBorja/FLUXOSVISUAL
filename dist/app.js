const STORAGE_KEY = "fluxosVisualState.v2";

const statusCatalog = [
  { id: "backlog", label: "Lista de pendências" },
  { id: "ready", label: "Liberado para execução" },
  { id: "in_progress", label: "Em execução" },
  { id: "waiting", label: "Aguardando" },
  { id: "blocked", label: "Bloqueado" },
  { id: "under_review", label: "Em análise" },
  { id: "correction", label: "Em correção" },
  { id: "done", label: "Concluído" },
  { id: "cancelled", label: "Cancelado" },
];

const itemTypes = [
  { id: "project", label: "Projeto", icon: "folder-kanban", color: "#256b76" },
  { id: "process", label: "Processo", icon: "workflow", color: "#54758b" },
  { id: "stage", label: "Etapa", icon: "layers-2", color: "#7561a8" },
  { id: "substage", label: "Subetapa", icon: "list-tree", color: "#8b77b5" },
  { id: "task", label: "Tarefa", icon: "square-check", color: "#287d62" },
  { id: "approval", label: "Aprovação", icon: "stamp", color: "#bd8b22" },
  { id: "blocker", label: "Bloqueio", icon: "circle-alert", color: "#c2474d" },
  { id: "deliverable", label: "Entrega", icon: "package-check", color: "#2679a5" },
  { id: "milestone", label: "Marco", icon: "flag", color: "#ca6e32" },
  { id: "document", label: "Documento", icon: "file-text", color: "#687780" },
];

const availableItemIcons = ["folder-kanban","workflow","layers-2","list-tree","square-check","stamp","circle-alert","package-check","flag","file-text","network","table-2","plus","link-2","users","building-2","circle-help","pencil","paperclip"];

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
  edit_relation: "Alterar relação",
  delete_relation: "Excluir relação",
  change_owner: "Alterar responsável",
  change_weight: "Alterar peso",
  change_duration: "Alterar duração",
  change_hierarchy: "Alterar hierarquia visual",
  add_attachment: "Incluir anexo",
  delete_attachment: "Excluir anexo",
  create_approval: "Configurar aprovação",
  decide_approval: "Decidir aprovação",
  manage_users: "Gerenciar usuários",
  manage_gpo: "Configurar GPO",
  manage_organization: "Administrar cadastros organizacionais",
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

function itemTypeConfig(typeId, organizationId = currentUser()?.organizationId) {
  const base = itemTypes.find((type) => type.id === typeId) || { id: typeId, label: typeId, icon: "circle", color: "#687780" };
  const configured = { ...base, ...(state.typeSettings?.[typeId] || {}), ...(state.typeSettings?.[organizationId]?.[typeId] || {}) };
  if (!availableItemIcons.includes(configured.icon)) configured.icon = base.icon;
  return configured;
}

function completeStatus(status) {
  return status === "done";
}

function legacyGpoRules(user) {
  const level = Number(user.legacyPermissionLevel ?? user.permissionLevel);
  const scopes = {
    1: ["creator", user.id, false], 2: ["state", user.state, false], 3: ["state", user.state, true],
    4: ["sector", user.sectorId, false], 5: ["sector", user.sectorId, true],
    6: ["organization", user.organizationId, false], 7: ["organization", user.organizationId, true],
    8: ["global", "", false], 9: ["global", "", true], 10: ["global", "", true],
  };
  const selected = scopes[level];
  if (!selected) return [];
  const [scopeType, scopeId, editable] = selected;
  const operations = ["view_item"];
  if (editable) operations.push("create_item", "edit_item", "create_relation", "edit_relation", "delete_relation", "change_owner", "change_weight", "change_duration", "change_hierarchy", "add_attachment", "delete_attachment", "create_approval", "decide_approval");
  if (level === 1) operations.push("edit_item");
  if (level === 10) operations.push("delete_item", "manage_users", "manage_gpo", "manage_organization");
  return operations.map((operation) => ({ id: uid("gpo"), subjectType: "user", subjectId: user.id, operation, scopeType, scopeId: scopeId || "", effect: "allow", createdBy: "migration", createdAt: nowIso() }));
}

function defaultGpoRules(user) {
  const profiles = {
    u_luis: { scopeType:"global", scopeId:"", editable:true, administrator:true },
    u_virginia: { scopeType:"organization", scopeId:"org_castro", editable:true },
    u_eduardo: { scopeType:"global", scopeId:"", editable:false },
    u_enrique: { scopeType:"sector", scopeId:"sec_obra", editable:true },
    u_mateus: { scopeType:"state", scopeId:"PE", editable:true },
    u_dmk: { scopeType:"state", scopeId:"PE", editable:false },
  };
  const profile = profiles[user.id];
  if (!profile) return [];
  const operations = ["view_item"];
  if (profile.editable) operations.push("create_item","edit_item","create_relation","edit_relation","delete_relation","change_owner","change_weight","change_duration","change_hierarchy","add_attachment","delete_attachment","create_approval","decide_approval");
  if (profile.administrator) operations.push("delete_item","manage_users","manage_gpo","manage_organization");
  return operations.map((operation) => ({id:uid("gpo"),subjectType:"user",subjectId:user.id,operation,scopeType:profile.scopeType,scopeId:profile.scopeId,effect:"allow",createdBy:"seed",createdAt:nowIso()}));
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
        parsed.permissionProfiles ||= [];
        parsed.statusSettings ||= {};
        parsed.hiddenTableColumns ||= [];
        parsed.tableColumnWidths ||= {};
        parsed.setupComplete ??= (parsed.users || []).length > 0;
        parsed.permissionRules = parsed.permissionRules.map((rule) => rule.operation === "change_due" ? {...rule,operation:"change_duration"} : rule);
        parsed.approvalDecisions ||= [];
        parsed.templates ||= [];
        parsed.attachments ||= [];
        parsed.archivedAttachments ||= [];
        parsed.typeSettings ||= {};
        parsed.riskThresholdDays ??= 3;
        parsed.filters ||= { query: "", status: "all", type: "all", owner: "all" };
        parsed.filters.organization ??= "all";
        parsed.filters.sector ??= "all";
        parsed.filters.state ??= "all";
        if (!parsed.gpoVersion) {
          const migratedRules = parsed.permissionRules.filter((rule) => rule.subjectType === "level").flatMap((rule) =>
            (parsed.users || []).filter((user) => Number(user.permissionLevel) === Number(rule.subjectId)).map((user) => ({ ...rule, id: uid("gpo"), subjectType: "user", subjectId: user.id }))
          );
          parsed.permissionRules = parsed.permissionRules.filter((rule) => rule.subjectType !== "level").concat(migratedRules);
          for (const user of parsed.users || []) {
            const legacyUser = {...user,legacyPermissionLevel:user.legacyPermissionLevel ?? user.permissionLevel};
            delete user.permissionLevel;
            delete user.legacyPermissionLevel;
            parsed.permissionRules.push(...legacyGpoRules(legacyUser));
          }
          parsed.gpoVersion = 1;
        }
        for (const item of parsed.items || []) {
          if (item.type === "approval") item.approvalRound ||= 1;
          item.weight ??= 1;
          item.plannedDurationDays = Number.isFinite(Number(item.plannedDurationDays)) ? Math.max(0, Number(item.plannedDurationDays)) : (item.plannedStartAt && item.dueAt ? Math.max(0, (new Date(item.dueAt + "T12:00:00") - new Date(item.plannedStartAt + "T12:00:00")) / 86400000) : 0);
          item.baselineStartAt ||= item.plannedStartAt || "";
          item.baselineDueAt ||= item.dueAt || datePlusDays(item.baselineStartAt || item.plannedStartAt || today(), item.plannedDurationDays || 0);
          item.replannedDueAt ??= "";
          if (item.status === "approved") item.status = "done";
          if (item.status === "rejected") item.status = "correction";
          item.progressPercent ??= completeStatus(item.status) ? 100 : item.status === "in_progress" ? 50 : 0;
          if (completeStatus(item.status)) item.progressPercent = 100;
          item.actualStartAt ||= "";
          item.sortOrder ??= parsed.items.indexOf(item) * 100;
        }
        return parsed;
      }
    } catch (error) {
      console.warn("Estado local invalido. Restaurando exemplo.", error);
    }
  }
  const initial = emptyState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

function emptyState() {
  return {
    version:2, gpoVersion:1, setupComplete:false, currentUserId:"", activePage:"overview",
    workspaceName:"", organizations:[], sectors:[], users:[], items:[], relations:[], events:[],
    attachments:[], archivedAttachments:[], archivedItems:[], archivedRelations:[], archivedUsers:[],
    archivedOrganizations:[], archivedSectors:[], permissionRules:[], permissionProfiles:[], approvalDecisions:[], templates:[],
    registryEvents:[], typeSettings:{}, statusSettings:{}, graphPositions:{}, hiddenTableColumns:[], tableColumnWidths:{}, riskThresholdDays:3,
    filters:{query:"",status:"all",type:"all",owner:"all",organization:"all",sector:"all",state:"all"}
  };
}

function seedState() {
  const base = {
    version: 2,
    gpoVersion: 1,
    currentUserId: "",
    activePage: "overview",
    filters: { query: "", status: "all", type: "all", owner: "all", organization: "all", sector: "all", state: "all" },
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
      },
      {
        id: "u_virginia",
        name: "Virginia",
        email: "virginia@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_diretoria",
      },
      {
        id: "u_eduardo",
        name: "Eduardo",
        email: "eduardo@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_diretoria",
      },
      {
        id: "u_enrique",
        name: "Enrique",
        email: "enrique@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_obra",
      },
      {
        id: "u_mateus",
        name: "Mateus",
        email: "mateus@castro.com",
        state: "PE",
        organizationId: "org_castro",
        sectorId: "sec_rh",
      },
      {
        id: "u_dmk",
        name: "Fornecedor DMK",
        email: "contato@dmk.com",
        state: "PE",
        organizationId: "org_dmk",
        sectorId: "sec_fornecedor",
      },
    ],
    items: [],
    relations: [],
    attachments: [],
    archivedAttachments: [],
    events: [],
    permissionRules: [],
    permissionProfiles: [],
    statusSettings: {},
    hiddenTableColumns: [],
    tableColumnWidths: {},
    approvalDecisions: [],
    templates: [],
    riskThresholdDays: 3,
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

  base.permissionRules = base.users.flatMap((user) => defaultGpoRules(user));
  base.typeSettings = {};

  return base;
}

function createSeedItem(base, input) {
  const item = {
    id: input.id || uid("item"),
    title: input.title,
    type: input.type || "task",
    status: Number(input.progressPercent ?? 0) > 0 && !["done","cancelled","blocked"].includes(input.status || "backlog") ? "in_progress" : input.status || "backlog",
    priority: input.priority || "media",
    ownerId: input.ownerId || "u_luis",
    createdBy: input.createdBy || "u_luis",
    organizationId: input.organizationId || "org_castro",
    sectorId: input.sectorId || "sec_pmo",
    state: input.state || "PE",
    parentId: input.parentId || "",
    sortOrder: Number(input.sortOrder ?? base.items.filter((item) => item.parentId === (input.parentId || "")).length * 100),
    description: input.description || "",
    plannedStartAt: input.plannedStartAt || today(),
    dueAt: input.dueAt || "",
    plannedDurationDays: Number.isFinite(Number(input.plannedDurationDays)) ? Math.max(0, Number(input.plannedDurationDays)) : (input.plannedStartAt && input.dueAt ? Math.max(0, (new Date(input.dueAt + "T12:00:00") - new Date(input.plannedStartAt + "T12:00:00")) / 86400000) : 0),
    baselineStartAt: input.plannedStartAt || today(),
    baselineDueAt: input.baselineDueAt || input.dueAt || datePlusDays(input.plannedStartAt || today(), Number.isFinite(Number(input.plannedDurationDays)) ? Math.max(0, Number(input.plannedDurationDays)) : (input.plannedStartAt && input.dueAt ? Math.max(0, (new Date(input.dueAt + "T12:00:00") - new Date(input.plannedStartAt + "T12:00:00")) / 86400000) : 0)),
    replannedDueAt: "",
    weight: Number(input.weight ?? 1),
    progressPercent: Number(input.progressPercent ?? (["done","cancelled"].includes(input.status) ? 100 : 0)),
    completedAt: completeStatus(input.status) ? nowIso() : "",
    actualStartAt: "",
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
  const ranks = { global: 1, state: 2, organization: 2, sector: 3, project: 4, item: 5, creator: 5 };
  const matches = (state.permissionRules || []).filter((rule) => {
    const subjectMatches = (rule.subjectType === "user" && rule.subjectId === user.id)
      || (rule.subjectType === "profile" && !!user.profileId && rule.subjectId === user.profileId);
    if (!subjectMatches || rule.operation !== operation) return false;
    if (rule.scopeType === "global") return true;
    if (!item) return false;
    if (rule.scopeType === "state") return item.state === rule.scopeId;
    if (rule.scopeType === "organization") return item.organizationId === (rule.scopeId === "@user" ? user.organizationId : rule.scopeId);
    if (rule.scopeType === "sector") return item.sectorId === rule.scopeId;
    if (rule.scopeType === "item") return item.id === rule.scopeId;
    if (rule.scopeType === "creator") return item.createdBy === rule.scopeId;
    if (rule.scopeType === "project") return projectRootId(item) === rule.scopeId;
    return false;
  });
  if (!matches.length) return null;
  matches.sort((left, right) => ((ranks[right.scopeType] || 0) * 10 + (right.subjectType === "user" ? 1 : 0)) - ((ranks[left.scopeType] || 0) * 10 + (left.subjectType === "user" ? 1 : 0)) || Number(left.effect === "allow") - Number(right.effect === "allow"));
  return matches[0].effect === "allow";
}

function canViewItem(user, item) {
  if (!user || user.disabled || !item) return false;
  return gpoDecision(user, "view_item", item) === true;
}

function canEditItem(user, item) {
  if (!user || user.disabled || !item) return false;
  return gpoDecision(user, "edit_item", item) === true;
}

function canCreateItem(user, item = null) {
  if (!user || user.disabled) return false;
  return gpoDecision(user, "create_item", item ? { ...item, createdBy: item.createdBy || user.id } : null) === true;
}

function canRemoveItem(user, item = null) {
  if (!user || user.disabled) return false;
  return gpoDecision(user, "delete_item", item) === true;
}

function canManageUsers(user, organizationId = user?.organizationId) {
  if (!user || user.disabled) return false;
  const organization = state.organizations.find((entry) => entry.id === organizationId);
  return gpoDecision(user, "manage_users", { organizationId, state: organization?.state || user.state }) === true;
}

function canManageAnyUsers(user) {
  return !!user && !user.disabled && (gpoDecision(user,"manage_users",null) === true || state.organizations.some((organization) => canManageUsers(user,organization.id)));
}

function canManageGpo(user) {
  return !!user && !user.disabled && gpoDecision(user, "manage_gpo", null) === true;
}

function canManageOrganization(user, organizationId = user?.organizationId) {
  const organization = state.organizations.find((entry) => entry.id === organizationId);
  return !!organization && gpoDecision(user, "manage_organization", { organizationId: organization.id, state: organization.state }) === true;
}

function canManageAnyOrganization(user) {
  return !!user && !user.disabled && (gpoDecision(user,"manage_organization",null) === true || state.organizations.some((organization) => canManageOrganization(user,organization.id)));
}

function createPermissionRule(input) {
  const user = currentUser();
  if (!canManageGpo(user)) throw new Error("Sua regra GPO não permite configurar permissões.");
  if (!Object.hasOwn(permissionOperationLabels, input.operation)) throw new Error("Selecione uma operação do GPO.");
  if (!["user","profile"].includes(input.subjectType)) throw new Error("Selecione um usuário ou perfil GPO.");
  if (input.subjectType === "user" && !state.users.some((entry) => entry.id === input.subjectId && !entry.disabled)) throw new Error("Selecione um usuário ativo.");
  if (input.subjectType === "profile" && !(state.permissionProfiles || []).some((entry) => entry.id === input.subjectId)) throw new Error("Selecione um perfil GPO existente.");
  if (!["global", "state", "organization", "sector", "project", "item"].includes(input.scopeType)) throw new Error("Selecione um escopo válido.");
  if (input.scopeType === "state" && !/^[A-Z]{2}$/.test(input.scopeId || "")) throw new Error("Selecione um estado válido.");
  if (input.scopeType === "organization" && !state.organizations.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione uma empresa.");
  if (input.scopeType === "sector" && !state.sectors.some((entry) => entry.id === input.scopeId)) throw new Error("Selecione um setor.");
  if (input.scopeType === "project" && !state.items.some((entry) => entry.id === input.scopeId && entry.type === "project")) throw new Error("Selecione um projeto.");
  if (input.scopeType === "item" && !getItem(input.scopeId)) throw new Error("Selecione um item.");
  if (input.operation === "manage_gpo" && input.scopeType !== "global") throw new Error("A configuração de GPO exige escopo global.");
  if (input.operation === "manage_organization" && !["global", "organization"].includes(input.scopeType)) throw new Error("A administração organizacional exige escopo global ou de empresa.");
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
  if (!canManageGpo(currentUser())) throw new Error("Sua regra GPO não permite alterar permissões.");
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
    .filter((source) => source && !completeStatus(source.status));
  return { released: blockers.length === 0, blockers };
}

function canDecideApproval(user, item) {
  if (!user || user.disabled || !item || item.type !== "approval" || !canViewItem(user, item)) return false;
  const rule = gpoDecision(user, "decide_approval", item);
  if (rule !== null) return rule;
  return canEditItem(user, item) && (item.approvalReviewerId || item.ownerId) === user.id;
}

function canSubmitApproval(user, item) {
  if (!user || user.disabled || !item || item.type !== "approval" || !canEditItem(user, item)) return false;
  return gpoDecision(user, "create_approval", item) === true;
}

function setApprovalStatus(item, nextStatus, eventType, comment = "") {
  const previous = item.status;
  item.status = nextStatus;
  if (completeStatus(nextStatus)) item.progressPercent = 100;
  item.updatedAt = nowIso();
  item.lastChangeAt = item.updatedAt;
  item.completedAt = completeStatus(nextStatus) ? item.updatedAt : "";
  createEvent(item.id, eventType, previous, nextStatus, comment, item.updatedAt);
}

function submitApprovalForReview(id, note = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprovação.");
  if (!canSubmitApproval(user, item)) throw new Error("Sua regra GPO não permite enviar esta etapa para aprovação.");
  if (!approvalGate(item).released) throw new Error("A aprovação ainda depende da conclusão de suas predecessoras.");
  if (!["backlog", "ready", "in_progress", "correction"].includes(item.status)) throw new Error("Esta etapa não está pronta para ser enviada.");
  if (item.status === "correction" && item.correctionOwnerId !== user.id && gpoDecision(user, "decide_approval", item) !== true) throw new Error("Somente o responsável pela correção ou usuário autorizado no GPO pode reenviar esta etapa.");
  item.approvalRound ||= 1;
  const previousDecision = item.lastDecisionId || "";
  state.approvalDecisions ||= [];
  const submission = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound, kind: "submitted", outcome: "under_review", reviewerId: item.approvalReviewerId || item.ownerId || "", correctionOwnerId: item.correctionOwnerId || "", reason: note.trim(), previousDecisionId: previousDecision, createdBy: user.id, createdAt: nowIso() };
  item.approvalRequestId ||= item.id;
  state.approvalDecisions.push(submission);
  setApprovalStatus(item, "under_review", "approval_submitted", note.trim() || "Etapa enviada para decisão.");
  return submission;
}

function decideApproval(id, outcome, reason = "", correctionOwnerId = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval") throw new Error("Selecione uma etapa de aprovação.");
  if (!canDecideApproval(user, item)) throw new Error("Apenas o responsável pela decisão ou uma regra GPO autorizada pode decidir.");
  if (item.status !== "under_review") throw new Error("Esta etapa não está aguardando decisão.");
  if (!approvalGate(item).released) throw new Error("A aprovação ainda depende da conclusão de suas predecessoras.");
  if (!["approved", "rejected"].includes(outcome)) throw new Error("Selecione aprovar ou reprovar.");
  if (outcome === "rejected" && !reason.trim()) throw new Error("Informe o motivo da reprovação.");
  let correctionOwner = null;
  if (outcome === "rejected") {
    correctionOwner = state.users.find((entry) => entry.id === correctionOwnerId && !entry.disabled && entry.organizationId === item.organizationId);
    if (!correctionOwner) throw new Error("Selecione um responsável ativo da mesma empresa para a correção.");
  }
  state.approvalDecisions ||= [];
  const decision = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound || 1, kind: "decision", outcome, reviewerId: user.id, correctionOwnerId: correctionOwner?.id || item.correctionOwnerId || "", reason: reason.trim(), previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso() };
  state.approvalDecisions.push(decision);
  item.lastDecisionId = decision.id;
  if (outcome === "approved") {
    decision.revisionId = item.id;
    setApprovalStatus(item, "done", "approval_decided", reason.trim() || "Aprovado e concluído.");
  } else {
    const originalParent = item.parentId || "";
    const revisionRound = (item.approvalRound || 1) + 1;
    item.superseded = true;
    setApprovalStatus(item, "cancelled", "approval_decided", reason.trim());
    const revision = createItem({
      title: `${item.title} · Revisão ${revisionRound}`, type: "approval", status: "backlog",
      ownerId: correctionOwner.id, organizationId: item.organizationId, sectorId: item.sectorId,
      state: item.state, parentId: originalParent, description: item.description,
      plannedStartAt: "", dueAt: "", weight: item.weight, progressPercent: 0,
    });
    revision.status = "correction";
    revision.revisionOf = item.id;
    revision.approvalRequestId = item.approvalRequestId || item.id;
    revision.approvalRound = revisionRound;
    revision.correctionOwnerId = correctionOwner.id;
    revision.approvalReviewerId = item.ownerId;
    revision.lastDecisionId = decision.id;
    item.supersededBy = revision.id;
    decision.revisionId = revision.id;
    state.relations.forEach((relation) => {
      if (relation.relationType === "contains") return;
      const wasSource = relation.sourceId === item.id;
      const wasTarget = relation.targetId === item.id;
      if (!wasSource && !wasTarget) return;
      relation.previousSourceId = relation.sourceId;
      relation.previousTargetId = relation.targetId;
      if (wasSource) relation.sourceId = revision.id;
      if (wasTarget) relation.targetId = revision.id;
      relation.updatedAt = nowIso();
      relation.updatedBy = user.id;
      createEvent(revision.id, "relation_retargeted", item.id, relation.id, "Relação transferida para a nova rodada de revisão.");
    });
    createEvent(revision.id, "approval_revision_started", item.id, revision.id, reason.trim());
    syncParentSummary(originalParent);
  }
  return decision;
}

function startApprovalRevision(id, correctionOwnerId, note = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval" || item.status !== "cancelled" || !item.superseded) throw new Error("A reprovação já deve ter criado uma nova revisão.");
  if (!canDecideApproval(user, item)) throw new Error("Sua regra GPO não permite iniciar este ciclo de correção.");
  const owner = state.users.find((entry) => entry.id === correctionOwnerId && !entry.disabled && entry.organizationId === item.organizationId);
  if (!owner) throw new Error("Selecione um responsável ativo da mesma empresa.");
  if (!note.trim()) throw new Error("Descreva a correção solicitada.");
  item.approvalRound = (item.approvalRound || 1) + 1;
  item.correctionOwnerId = owner.id;
  state.approvalDecisions ||= [];
  const revision = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound, kind: "correction_started", outcome: "correction", reviewerId: item.ownerId || "", correctionOwnerId: owner.id, reason: note.trim(), previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso() };
  state.approvalDecisions.push(revision);
  return revision;
}

function archiveItem(itemId) {
  const user=currentUser(), root=getItem(itemId);
  if (!root || !canEditItem(user,root)) throw new Error("O GPO não permite arquivar este item.");
  const ids=[], seen=new Set(), queue=[root.id];
  while(queue.length){ const id=queue.shift(); if(seen.has(id)) continue; seen.add(id); const item=getItem(id); if(!item) continue; ids.push(item); state.items.filter((child)=>child.parentId===id).forEach((child)=>queue.push(child.id)); }
  const archivedAt=nowIso();
  for(const item of ids){ if(item.archivedAt) continue; item.archivedAt=archivedAt; item.archivedBy=user.id; createEvent(item.id,"archived","",archivedAt,"Item arquivado; hierarquia preservada."); }
  if(root.parentId) syncParentSummary(root.parentId);
  return ids.length;
}

function restoreArchivedItem(itemId) {
  const user=currentUser(), root=getItem(itemId);
  if (!root || !root.archivedAt || !canEditItem(user,root)) throw new Error("O GPO não permite restaurar este item.");
  const ids=[], seen=new Set(), queue=[root.id];
  while(queue.length){ const id=queue.shift(); if(seen.has(id)) continue; seen.add(id); const item=getItem(id); if(!item) continue; ids.push(item); state.items.filter((child)=>child.parentId===id && child.archivedAt).forEach((child)=>queue.push(child.id)); }
  for(const item of ids){ item.archivedAt=""; item.archivedBy=""; createEvent(item.id,"restored","","active","Item restaurado."); }
  recalculatePlannedDates();
  if(root.parentId) syncParentSummary(root.parentId);
  return ids.length;
}

function visibleItems() {
  const user = currentUser();
  const query = state.filters.query.trim().toLowerCase();
  return state.items
    .filter((item) => !item.archivedAt && canViewItem(user, item))
    .filter((item) => state.filters.status === "all" || item.status === state.filters.status)
    .filter((item) => state.filters.type === "all" || item.type === state.filters.type)
    .filter((item) => state.filters.owner === "all" || item.ownerId === state.filters.owner)
    .filter((item) => state.filters.organization === "all" || item.organizationId === state.filters.organization)
    .filter((item) => state.filters.sector === "all" || item.sectorId === state.filters.sector)
    .filter((item) => state.filters.state === "all" || item.state === state.filters.state)
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

function activityStartAt(item) {
  const temporal = new Set(["TI", "II", "TT", "IF"]);
  const dependencies = state.relations.filter((relation) => relation.targetId === item.id && temporal.has(relation.relationType));
  if (!dependencies.length) return item.createdAt || "";
  const durationDays = item.plannedStartAt && item.dueAt ? Math.max(0,(new Date(`${item.dueAt}T12:00:00`) - new Date(`${item.plannedStartAt}T12:00:00`)) / 86400000) : 0;
  const candidates = [];
  for (const relation of dependencies) {
    const predecessor = getItem(relation.sourceId);
    if (!predecessor) return "";
    let release = "";
    if (relation.relationType === "TI") release = predecessor.completedAt;
    else if (relation.relationType === "II") release = predecessor.actualStartAt;
    else if (relation.relationType === "TT" && predecessor.completedAt) release = new Date(new Date(predecessor.completedAt).getTime() - durationDays * 86400000 + Number(relation.lagDays || 0) * 86400000).toISOString();
    else if (relation.relationType === "IF" && predecessor.actualStartAt) release = new Date(new Date(predecessor.actualStartAt).getTime() - durationDays * 86400000 + Number(relation.lagDays || 0) * 86400000).toISOString();
    if (!release) return "";
    candidates.push(new Date(release).getTime());
  }
  const timestamp = Math.max(...candidates);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : "";
}

function activityDurationMinutes(item, at = nowIso()) {
  const start = activityStartAt(item);
  if (!start) return null;
  return Math.max(0,Math.floor((new Date(item.completedAt || at) - new Date(start)) / 60000));
}

function visibleEvents() {
  const ids = new Set(visibleItems().map((item) => item.id));
  return state.events
    .filter((event) => ids.has(event.itemId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function isOverdue(item) {
  if (!item.dueAt || ["done", "cancelled"].includes(item.status)) return false;
  return new Date(`${item.dueAt}T00:00:00`) < new Date(`${today()}T00:00:00`);
}

function dueDeltaDays(item) {
  if (!item.dueAt) return null;
  return Math.floor((new Date(item.dueAt + "T00:00:00") - new Date(today() + "T00:00:00")) / 86400000);
}

function isAtRisk(item) {
  if (!item.dueAt || ["done", "cancelled", "blocked"].includes(item.status) || isOverdue(item)) return false;
  const daysLeft = dueDeltaDays(item);
  return daysLeft <= (Number(state.riskThresholdDays) || 3) && Number(item.progressPercent || 0) < 75;
}

function signalOf(item) {
  if (item.status === "blocked" || isOverdue(item)) return "red";
  if (completeStatus(item.status)) return "green";
  if (["in_progress"].includes(item.status)) return "blue";
  if (["waiting", "under_review", "ready", "correction"].includes(item.status) || isAtRisk(item)) return "yellow";
  return "gray";
}

function createItem(input) {
  const user = currentUser();
  if (!canCreateItem(user, input)) throw new Error("Sua regra GPO não permite criar itens neste escopo.");
  validateItemInput(input);
  if (input.type === "approval" && ["correction", "under_review"].includes(input.status) && !input.templateInstance) throw new Error("A etapa deve entrar no fluxo antes de receber uma decisão.");
  if (input.parentId && !canEditItem(user, getItem(input.parentId))) throw new Error("Sem permissao para alterar o item pai.");
  if (!canCreateItem(user, { ...input, createdBy: user.id })) throw new Error("O escopo do novo item não está autorizado.");
  // Item creation updates containment, summaries, events and calculated dates.
  // Keep these mutations atomic if schedule validation fails.
  const rollback = {
    items: state.items.map((entry) => ({...entry})),
    relations: state.relations.map((entry) => ({...entry})),
    events: state.events.map((entry) => ({...entry})),
    archivedRelations: (state.archivedRelations || []).map((entry) => ({...entry})),
  };
  try {
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
    sortOrder: Number(input.sortOrder ?? state.items.filter((entry) => entry.parentId === (input.parentId || "")).length * 100),
    description: input.description || "",
    plannedStartAt: input.plannedStartAt || today(),
    dueAt: input.dueAt || "",
    plannedDurationDays: Number.isFinite(Number(input.plannedDurationDays)) ? Math.max(0, Number(input.plannedDurationDays)) : (input.plannedStartAt && input.dueAt ? Math.max(0, (new Date(input.dueAt + "T12:00:00") - new Date(input.plannedStartAt + "T12:00:00")) / 86400000) : 0),
    baselineStartAt: input.plannedStartAt || today(),
    baselineDueAt: input.dueAt || "",
    replannedDueAt: "",
    weight: Number(input.weight ?? 1),
    progressPercent: Number(input.progressPercent ?? (completeStatus(input.status) ? 100 : 0)),
    completedAt: completeStatus(input.status) ? nowIso() : "",
    actualStartAt: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastChangeAt: nowIso(),
  };
  state.items.push(item);
  createEvent(item.id, "created", "", item.status, "Item criado.", item.createdAt);
  if (item.parentId) createRelation(item.parentId, item.id, "contains", 0);
  if (item.parentId) syncContainsRelations(item.id);
  const schedule = recalculatePlannedDates();
  if (!schedule.valid) throw new Error(schedule.message);
  if (item.parentId) syncParentSummary(item.parentId);
  return item;
  } catch (error) {
    state.items = rollback.items;
    state.relations = rollback.relations;
    state.events = rollback.events;
    state.archivedRelations = rollback.archivedRelations;
    throw error;
  }
}
function createRelation(sourceId, targetId, relationType, lagDays = 0, description = "") {
  const source = getItem(sourceId);
  const target = getItem(targetId);
  if (!source || !target || sourceId === targetId) throw new Error("Escolha dois itens diferentes.");
  if (!relationTypes.some((type) => type.id === relationType)) throw new Error("Tipo de relacao invalido.");
  const user = currentUser();
  const targetIsNewlyOwned = target.createdBy === user?.id && canCreateItem(user,target);
  if (!canEditItem(user, source) || (!canEditItem(user, target) && !targetIsNewlyOwned) || gpoDecision(user, "create_relation", target) !== true) throw new Error("O GPO não permite criar uma relação entre estes itens.");
  if (!Number.isFinite(Number(lagDays))) throw new Error("Informe uma defasagem numerica.");
  if (relationType === "contains") {
    const ancestors = new Set();
    let cursor = source;
    while (cursor && !ancestors.has(cursor.id)) {
      if (cursor.id === targetId) throw new Error("A hierarquia nao pode conter ciclos.");
      ancestors.add(cursor.id);
      cursor = getItem(cursor.parentId);
    }
    let ancestorCursor = target.parentId, sourceIsAncestor = false; const ancestorSeen = new Set();
    while (ancestorCursor && !ancestorSeen.has(ancestorCursor)) { if (ancestorCursor === sourceId) { sourceIsAncestor = true; break; } ancestorSeen.add(ancestorCursor); ancestorCursor = getItem(ancestorCursor)?.parentId || ""; }
    if (target.parentId && target.parentId !== sourceId && !sourceIsAncestor) throw new Error("O item já possui outro pai. Relações CONTÉM adicionais precisam apontar para um ancestral.");
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
    description: String(description || "").trim(),
    createdBy: currentUser()?.id || "system",
    createdAt: nowIso(),
  };
  state.relations.push(relation);
  if (relationType === "contains" && (!target.parentId || target.parentId === sourceId)) target.parentId = sourceId;
  const schedule = recalculatePlannedDates();
  if (!schedule.valid) {
    state.relations = state.relations.filter((entry) => entry.id !== relation.id);
    if (relationType === "contains") target.parentId = "";
    throw new Error(schedule.message);
  }
  createEvent(targetId, "relation_created", "", relationType, relation.description || `Relação criada a partir de ${getItem(sourceId)?.title}.`);
  return relation;
}

function syncContainsRelations(itemId) {
  const item=getItem(itemId); if (!item) return;
  const desired=[], seen=new Set(); let cursor=getItem(item.parentId);
  while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); desired.push(cursor.id); cursor=getItem(cursor.parentId); }
  const desiredSet=new Set(desired);
  const stale=state.relations.filter((relation)=>relation.relationType==="contains" && relation.targetId===itemId && !desiredSet.has(relation.sourceId));
  for (const relation of stale) { archiveRecord("archivedRelations",relation); state.relations=state.relations.filter((entry)=>entry.id!==relation.id); }
  for (const sourceId of desired) {
    if (state.relations.some((relation)=>relation.relationType==="contains" && relation.sourceId===sourceId && relation.targetId===itemId)) continue;
    state.relations.push({id:uid("rel"),sourceId,targetId:itemId,relationType:"contains",lagDays:0,description:"Vínculo de ancestralidade",createdBy:currentUser()?.id || "system",createdAt:nowIso()});
  }
}

function canChangeHierarchy(user, item) {
  return !!item && canEditItem(user,item) && gpoDecision(user,"change_hierarchy",item) === true;
}

function moveItemHierarchy(id, nextParentId = "") {
  const item = getItem(id);
  const nextParent = nextParentId ? getItem(nextParentId) : null;
  if (!item) throw new Error("Item não encontrado.");
  if (nextParentId && !nextParent) throw new Error("Novo item pai não encontrado.");
  if (!canChangeHierarchy(currentUser(),item) || (nextParent && !canEditItem(currentUser(),nextParent))) throw new Error("O GPO não permite alterar esta hierarquia.");
  if (item.parentId === nextParentId) return false;
  if (nextParent) {
    let cursor = nextParent; const visited = new Set();
    while (cursor && !visited.has(cursor.id)) {
      if (cursor.id === item.id) throw new Error("A hierarquia não pode conter ciclos.");
      visited.add(cursor.id); cursor = getItem(cursor.parentId);
    }
  }

  // A hierarchy move touches parent IDs, CONTÉM relations, parent summaries,
  // audit events and calculated dates. Keep a complete in-memory rollback point
  // so a temporal-cycle or other schedule validation failure cannot leave a
  // partially applied move in local state.
  const rollback = {
    items: state.items.map((entry) => ({...entry})),
    relations: state.relations.map((entry) => ({...entry})),
    events: state.events.map((entry) => ({...entry})),
    archivedRelations: (state.archivedRelations || []).map((entry) => ({...entry})),
  };
  try {
    const previousParentId = item.parentId || "";
    const relation = state.relations.find((entry) => entry.relationType === "contains" && entry.targetId === item.id && entry.sourceId === previousParentId);
    if (nextParent) {
      if (relation) {
        relation.previousSourceId = relation.sourceId; relation.previousTargetId = relation.targetId;
        relation.sourceId = nextParent.id; relation.updatedAt = nowIso(); relation.updatedBy = currentUser().id;
      } else state.relations.push({id:uid("rel"),sourceId:nextParent.id,targetId:item.id,relationType:"contains",lagDays:0,createdBy:currentUser().id,createdAt:nowIso(),description:"Hierarquia visual"});
      item.parentId = nextParent.id;
    } else {
      if (relation) { archiveRecord("archivedRelations",relation); state.relations = state.relations.filter((entry) => entry.id !== relation.id); }
      item.parentId = "";
    }
    const newSiblings = state.items.filter((entry) => entry.id !== item.id && entry.parentId === item.parentId);
    item.sortOrder = newSiblings.length ? Math.max(...newSiblings.map((entry) => Number(entry.sortOrder ?? state.items.indexOf(entry)))) + 100 : 0;
    createEvent(item.id,"parent_changed",previousParentId,nextParentId,"Hierarquia visual alterada.");
    const pending = [item.id], visitedSubtree = new Set();
    while (pending.length) {
      const currentId = pending.shift();
      if (visitedSubtree.has(currentId)) continue;
      visitedSubtree.add(currentId);
      syncContainsRelations(currentId);
      state.items.filter((entry) => entry.parentId === currentId).forEach((child) => pending.push(child.id));
    }
    if (previousParentId) syncParentSummary(previousParentId);
    if (nextParentId) syncParentSummary(nextParentId);
    const schedule = recalculatePlannedDates();
    if (!schedule.valid) throw new Error(schedule.message);
    return true;
  } catch (error) {
    state.items = rollback.items;
    state.relations = rollback.relations;
    state.events = rollback.events;
    state.archivedRelations = rollback.archivedRelations;
    throw error;
  }
}

function reorderItem(id, targetId, after = false) {
  const item = getItem(id); const target = getItem(targetId);
  if (!item || !target || item.id === target.id) return false;
  if (item.parentId !== target.parentId) throw new Error("A ordenação mantém os itens no mesmo nível hierárquico.");
  if (!canChangeHierarchy(currentUser(),item) || !canChangeHierarchy(currentUser(),target)) throw new Error("O GPO não permite reordenar estes itens.");
  const siblings = state.items.filter((entry) => entry.parentId === item.parentId).sort((left,right) => Number(left.sortOrder ?? state.items.indexOf(left)) - Number(right.sortOrder ?? state.items.indexOf(right)));
  const from = siblings.findIndex((entry) => entry.id === id); const to = siblings.findIndex((entry) => entry.id === targetId);
  siblings.splice(from,1); siblings.splice(Math.max(0,to + (after ? 1 : 0) - (from < to ? 1 : 0)),0,item);
  siblings.forEach((entry,index) => { const next = index * 100; if (entry.sortOrder !== next) { createEvent(entry.id,"order_changed",entry.sortOrder ?? "",next,"Ordem visual atualizada."); entry.sortOrder = next; } });
  return true;
}

function updateRelation(id, input) {
  const relation = state.relations.find((entry) => entry.id === id);
  if (!relation) throw new Error("Relação não encontrada.");
  const source = getItem(input.sourceId);
  const target = getItem(input.targetId);
  const user = currentUser();
  if (!source || !target || source.id === target.id) throw new Error("Escolha dois itens diferentes.");
  if (!relationTypes.some((type) => type.id === input.relationType)) throw new Error("Tipo de relação inválido.");
  if (!canEditItem(user, getItem(relation.sourceId)) || !canEditItem(user, getItem(relation.targetId)) || !canEditItem(user, source) || !canEditItem(user, target)) throw new Error("O GPO não permite alterar esta relação ou seus itens.");
  if (gpoDecision(user, "edit_relation", target) !== true) throw new Error("O GPO não permite alterar relações neste escopo.");
  if (!Number.isFinite(Number(input.lagDays))) throw new Error("Informe uma defasagem numérica.");
  if (input.relationType === "contains") {
    let cursor = source; const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
      if (cursor.id === target.id) throw new Error("A hierarquia não pode conter ciclos.");
      seen.add(cursor.id); cursor = getItem(cursor.parentId);
    }
    const existingParent = relation.relationType === "contains" && relation.targetId === target.id ? relation.sourceId : "";
    if (target.parentId && target.parentId !== source.id && target.parentId !== existingParent) throw new Error("O item de destino já possui outro pai.");
  }
  const duplicate = state.relations.some((entry) => entry.id !== id && entry.sourceId === source.id && entry.targetId === target.id && entry.relationType === input.relationType);
  if (duplicate) throw new Error("Esta relação já existe.");
  const previous = { sourceId: relation.sourceId, targetId: relation.targetId, relationType: relation.relationType, lagDays: relation.lagDays, description: relation.description || "" };
  const previousTargetParentId = target.parentId, previousOldTargetParentId = getItem(previous.targetId)?.parentId || "";
  const affectedParents = new Set();
  if (relation.relationType === "contains" && (relation.sourceId !== source.id || relation.targetId !== target.id || input.relationType !== "contains")) {
    const priorTarget = getItem(relation.targetId);
    if (priorTarget?.parentId === relation.sourceId) { priorTarget.parentId = ""; affectedParents.add(relation.sourceId); }
  }
  Object.assign(relation, { sourceId: source.id, targetId: target.id, relationType: input.relationType, lagDays: Number(input.lagDays) || 0, description: String(input.description || "").trim(), updatedAt: nowIso(), updatedBy: user.id, previousSourceId: previous.sourceId, previousTargetId: previous.targetId, previousRelationType: previous.relationType });
  if (input.relationType === "contains") { if (!target.parentId || target.parentId === source.id) target.parentId = source.id; affectedParents.add(source.id); }
  const schedule = recalculatePlannedDates();
  if (!schedule.valid) {
    Object.assign(relation,{sourceId:previous.sourceId,targetId:previous.targetId,relationType:previous.relationType,lagDays:previous.lagDays,description:previous.description});
    target.parentId=previousTargetParentId;
    const oldTarget=getItem(previous.targetId); if(oldTarget) oldTarget.parentId=previousOldTargetParentId;
    syncContainsRelations(previous.targetId); if(target.id!==previous.targetId) syncContainsRelations(target.id);
    recalculatePlannedDates();
    throw new Error(schedule.message);
  }
  if (previous.relationType === "contains") syncContainsRelations(previous.targetId);
  if (relation.relationType === "contains") syncContainsRelations(target.id);
  if (previous.relationType === "contains") affectedParents.add(previous.sourceId);
  createEvent(previous.targetId,"relation_updated",previous.relationType,input.relationType,`Relação atualizada: ${getItem(previous.sourceId)?.title} → ${source.title}.`);
  if (target.id !== previous.targetId) createEvent(target.id,"relation_updated",previous.targetId,relation.id,relation.description || "Relação transferida para este item.");
  for (const parentId of affectedParents) syncParentSummary(parentId);
  return relation;
}

function createEvent(itemId, eventType, fromValue, toValue, comment, effectiveAt = nowIso()) {
  const item = getItem(itemId), actor = currentUser();
  const organizationId = item?.organizationId || actor?.organizationId || "";
  const sectorId = item?.sectorId || actor?.sectorId || "";
  const organizationName = state.organizations.find((entry)=>entry.id===organizationId)?.name || "";
  const sectorName = state.sectors.find((entry)=>entry.id===sectorId)?.name || "";
  const stateSnapshot = item?.state || actor?.state || "";
  state.events.push({
    id: uid("event"),
    itemId,
    eventType,
    fromValue,
    toValue,
    userId: currentUser()?.id || "system",
    actorNameSnapshot: actor?.name || "Sistema",
    actorOrganizationNameSnapshot: state.organizations.find((entry)=>entry.id===actor?.organizationId)?.name || "",
    organizationIdSnapshot: organizationId, organizationNameSnapshot: organizationName,
    sectorIdSnapshot: sectorId, sectorNameSnapshot: sectorName, stateSnapshot,
    createdAt: nowIso(),
    effectiveAt,
    comment: comment || "",
  });
}

const MAX_ATTACHMENT_BYTES = 262144;
const MAX_ATTACHMENT_TOTAL_BYTES = 1048576;

function readAttachment(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Não foi possível ler o anexo ${file.name}.`));
    reader.onload = () => {
      if (typeof reader.result !== "string") return reject(new Error(`O anexo ${file.name} não pôde ser preparado.`));
      const safeType = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(file.type || "") ? file.type : "application/octet-stream";
      resolve(reader.result.replace(/^data:[^;,]*;base64,/,`data:${safeType};base64,`));
    };
    reader.readAsDataURL(file);
  });
}

async function addAttachments(itemId, files, effectiveAt = nowIso()) {
  const item = getItem(itemId);
  const selected = [...(files || [])].filter((file) => file && typeof file.size === "number" && file.size > 0);
  if (!selected.length) return [];
  if (!item || !canEditItem(currentUser(),item) || gpoDecision(currentUser(),"add_attachment",item) !== true) throw new Error("O GPO não permite anexar arquivos a este item.");
  state.attachments ||= [];
  const storedBytes = [...state.attachments,...(state.archivedAttachments || [])].reduce((sum,attachment) => sum + Number(attachment.size || 0),0);
  const incomingBytes = selected.reduce((sum,file) => sum + Number(file.size || 0),0);
  if (selected.some((file) => file.size > MAX_ATTACHMENT_BYTES)) throw new Error("Limite demonstrativo de 256 KB por anexo.");
  if (storedBytes + incomingBytes > MAX_ATTACHMENT_TOTAL_BYTES) throw new Error("Os anexos locais atingiriam o limite demonstrativo de 1 MB.");
  const result = [];
  for (const file of selected) {
    const attachment = {id:uid("attachment"),itemId:item.id,name:String(file.name || "anexo").slice(0,180),type:file.type || "application/octet-stream",size:file.size,dataUrl:await readAttachment(file),createdBy:currentUser().id,createdAt:effectiveAt};
    state.attachments.push(attachment);
    createEvent(item.id,"attachment_added","",attachment.id,`Anexo adicionado: ${attachment.name} (${attachment.size} bytes).`,effectiveAt);
    result.push(attachment);
  }
  return result;
}

function removeAttachment(id) {
  const attachment = state.attachments?.find((entry) => entry.id === id);
  const item = attachment && getItem(attachment.itemId);
  if (!attachment || !item) throw new Error("Anexo não encontrado.");
  if (!canEditItem(currentUser(),item) || gpoDecision(currentUser(),"delete_attachment",item) !== true) throw new Error("O GPO não permite excluir este anexo.");
  attachment.deletedAt = nowIso(); attachment.deletedBy = currentUser().id;
  createEvent(item.id,"attachment_removed",attachment.id,"",`Anexo removido: ${attachment.name}.`,attachment.deletedAt);
  state.archivedAttachments ||= [];
  state.archivedAttachments.push(attachment);
  state.attachments = state.attachments.filter((entry) => entry.id !== id);
  return attachment;
}

function syncParentSummary(parentId, effectiveAt = nowIso()) {
  const parent = getItem(parentId);
  if (!parent) return;
  const children = state.items.filter((item) => item.parentId === parentId && item.status !== "cancelled" && !item.archivedAt);
  if (!parent.baselineStartAt) parent.baselineStartAt = children.map((item)=>item.baselineStartAt || item.plannedStartAt).filter(Boolean).sort()[0] || parent.plannedStartAt || "";
  if (!parent.baselineDueAt) parent.baselineDueAt = children.map((item)=>item.baselineDueAt || item.dueAt).filter(Boolean).sort().at(-1) || parent.dueAt || "";
  if (!children.length) return;
  const wasComplete = completeStatus(parent.status);
  const rank = { blocked: 0, backlog: 0, waiting: 1, correction: 1, ready: 1, in_progress: 2, under_review: 3, done: 4 };
  const leastAdvanced = [...children].sort((left, right) => (rank[left.status] ?? 0) - (rank[right.status] ?? 0) || Number(left.progressPercent || 0) - Number(right.progressPercent || 0))[0];
  const descendants = [];
  const visited = new Set();
  function collectLeaves(itemId) {
    if (visited.has(itemId)) return;
    visited.add(itemId);
    const nested = state.items.filter((item) => item.parentId === itemId && item.status !== "cancelled" && !item.archivedAt);
    if (!nested.length) { const item = getItem(itemId); if (item && !["project", "process"].includes(item.type)) descendants.push(item); }
    else nested.forEach((item) => collectLeaves(item.id));
  }
  children.forEach((item) => collectLeaves(item.id));
  const weighted = descendants.reduce((total, item) => {
    const weight = Number(item.weight || 1);
    if (!Number.isFinite(weight) || weight <= 0) return total;
    const percent = completeStatus(item.status) ? 100 : Math.max(0, Math.min(100, Number(item.progressPercent || 0)));
    total.weighted += weight * percent; total.weight += weight; return total;
  }, { weighted: 0, weight: 0 });
  const next = {
    status: leastAdvanced.status,
    progressPercent: weighted.weight ? Math.round(weighted.weighted / weighted.weight) : null,
    plannedDurationDays: Math.max(0, (new Date((children.map((item)=>item.dueAt).filter(Boolean).sort().at(-1) || parent.dueAt || today()) + "T12:00:00") - new Date((children.map((item)=>item.plannedStartAt).filter(Boolean).sort()[0] || parent.plannedStartAt || today()) + "T12:00:00")) / 86400000),
    plannedStartAt: children.map((item) => item.plannedStartAt).filter(Boolean).sort()[0] || parent.plannedStartAt || "",
    dueAt: children.map((item) => item.dueAt).filter(Boolean).sort().at(-1) || parent.dueAt || "",
  };
  let changed = false;
  for (const field of Object.keys(next)) {
    if (parent[field] === next[field]) continue;
    const eventType = field === "status" ? "status_changed" : field === "progressPercent" ? "progress_changed" : field === "plannedStartAt" ? "start_changed" : field === "plannedDurationDays" ? "duration_changed" : "due_changed";
    createEvent(parent.id, eventType, parent[field] || "", next[field] ?? "", "Resumo herdado dos subitens.", effectiveAt);
    parent[field] = next[field];
    changed = true;
  }
  if (completeStatus(next.status)) parent.completedAt = children.map((item) => item.completedAt).filter(Boolean).sort().at(-1) || parent.completedAt || effectiveAt;
  else if (wasComplete) parent.completedAt = "";
  if (changed) {
    parent.updatedAt = nowIso();
    parent.lastChangeAt = effectiveAt;
    if (parent.parentId) syncParentSummary(parent.parentId, effectiveAt);
  }
}

function validateItemInput(input, existing = null) {
  if (!input.title?.trim()) throw new Error("Informe o nome do item.");
  if (!itemTypes.some((type) => type.id === input.type)) throw new Error("Tipo de item inválido.");
  if (input.status !== undefined && !statusCatalog.some((status) => status.id === input.status)) throw new Error("Status inválido.");
  if (!state.organizations.some((org) => org.id === input.organizationId)) throw new Error("Selecione uma empresa.");
  if (!state.sectors.some((sector) => sector.id === input.sectorId && sector.organizationId === input.organizationId)) throw new Error("Cadastre ou selecione um setor desta empresa.");
  if (!/^[A-Z]{2}$/.test(input.state || "")) throw new Error("Informe a UF com duas letras.");
  if (input.ownerId && !state.users.some((user) => user.id === input.ownerId && (!user.disabled || existing?.ownerId === user.id))) throw new Error("Selecione um responsável ativo.");
  if (input.weight !== undefined && (!Number.isFinite(Number(input.weight)) || Number(input.weight) <= 0)) throw new Error("O peso deve ser maior que zero.");
  if (input.progressPercent !== undefined && (!Number.isFinite(Number(input.progressPercent)) || Number(input.progressPercent) < 0 || Number(input.progressPercent) > 100)) throw new Error("O percentual deve ficar entre 0 e 100.");
  if (input.plannedDurationDays !== undefined && (!Number.isInteger(Number(input.plannedDurationDays)) || Number(input.plannedDurationDays) < 0)) throw new Error("A duração deve ser um número inteiro de dias corridos igual ou maior que zero.");
  if (input.replannedDueAt && (!/^\d{4}-\d{2}-\d{2}$/.test(input.replannedDueAt) || !Number.isFinite(new Date(input.replannedDueAt + "T12:00:00").getTime()))) throw new Error("Informe uma data válida para a repactuação.");
  for (const field of ["plannedStartAt", "dueAt"]) {
    if (input[field] && (!/^\d{4}-\d{2}-\d{2}$/.test(input[field]) || !Number.isFinite(new Date(`${input[field]}T12:00:00`).getTime()))) throw new Error("Informe uma data válida.");
  }
  const changedDates = !existing || existing.plannedStartAt !== input.plannedStartAt || existing.dueAt !== input.dueAt;
  if (changedDates && input.plannedStartAt && input.dueAt && input.dueAt < input.plannedStartAt) throw new Error("O término ideal deve ser igual ou posterior ao início previsto.");
}

function updateItem(id, input, effectiveAt = nowIso(), comment = "") {
  const item = getItem(id);
  const user = currentUser();
  if (!canEditItem(user,item)) throw new Error("Sua regra GPO não permite editar este item.");
  const rollbackItems = state.items.map((entry) => ({...entry}));
  const rollbackEventCount = state.events.length;
  validateItemInput(input,item);
  if (!canEditItem(user,{...item,...input})) throw new Error("O novo contexto deve permanecer dentro das regras GPO.");
  const hasActiveChildren = state.items.some((entry) => entry.parentId === item.id && entry.status !== "cancelled");
  if (hasActiveChildren && ["status","progressPercent","plannedStartAt","dueAt","plannedDurationDays","weight"].some((field) => input[field] !== undefined && input[field] !== item[field])) throw new Error("Status, progresso, duração e peso de um grupo são herdados dos subitens ativos.");
  if (!Number.isFinite(new Date(effectiveAt).getTime())) throw new Error("Informe a data e hora da mudança.");
  if (item.type === "approval" && input.status !== item.status) throw new Error("Use a aba Aprovação para enviar, aprovar, reprovar ou iniciar uma correção.");
  if (input.type === "approval" && item.type !== "approval") { item.approvalRound ||= 1; item.approvalReviewerId ||= input.ownerId || ""; }
  if (input.status === "cancelled") input = { ...input, progressPercent: 100 };
  else if (Number(input.progressPercent ?? item.progressPercent ?? 0) > 0 && !["done","cancelled","blocked"].includes(input.status)) input = { ...input, status: "in_progress" };
  const wasComplete = completeStatus(item.status);
  const complete = completeStatus(input.status);
  if (wasComplete && !complete && (input.progressPercent === undefined || Number(input.progressPercent) === Number(item.progressPercent))) throw new Error("Informe um novo percentual ao reabrir uma atividade concluída.");
  if (complete) input = { ...input, progressPercent: 100 };
  if (input.status === "cancelled") input = { ...input, progressPercent: 100 };
  if (wasComplete && complete && ((input.plannedStartAt ?? item.plannedStartAt) !== item.plannedStartAt || (input.dueAt ?? item.dueAt) !== item.dueAt)) throw new Error("As datas previstas ficam bloqueadas após a conclusão.");
  const fields = {title:"title_changed",type:"type_changed",status:"status_changed",ownerId:"owner_changed",dueAt:"due_changed",plannedStartAt:"start_changed",plannedDurationDays:"duration_changed",replannedDueAt:"replanned_due_changed",weight:"weight_changed",progressPercent:"progress_changed",description:"description_changed",organizationId:"context_changed",sectorId:"context_changed",state:"context_changed"};
  let changed = false;
  for (const [field,eventType] of Object.entries(fields)) {
    const rawNext = input[field] ?? item[field];
    const next = ["weight","plannedDurationDays"].includes(field) || (field === "progressPercent" && rawNext !== null) ? Number(rawNext) : rawNext;
    if (next === item[field]) continue;
    const operation = field === "ownerId" ? "change_owner" : ["dueAt", "plannedStartAt","plannedDurationDays","replannedDueAt"].includes(field) ? "change_duration" : field === "weight" ? "change_weight" : "";
    if (operation && gpoDecision(user, operation, item) !== true) throw new Error("O GPO não permite esta alteração neste escopo.");
    createEvent(id,eventType,item[field],next,"",effectiveAt);
    item[field] = next; changed = true;
  }
  if (complete && !wasComplete) { item.completedAt = effectiveAt; createEvent(id,"completed","",item.status,"",effectiveAt); }
  if (wasComplete && !complete) { item.completedAt = ""; createEvent(id,"reopened","","","Item reaberto.",effectiveAt); }
  if (item.status === "in_progress" && !item.actualStartAt) { item.actualStartAt = effectiveAt; createEvent(id,"started","",effectiveAt,"Atividade iniciada.",effectiveAt); changed = true; }
  if (comment.trim()) { createEvent(id,"comment","","",comment.trim(),effectiveAt); changed = true; }
  if (changed) {
    item.updatedAt = nowIso(); item.lastChangeAt = effectiveAt;
    if (item.parentId) syncParentSummary(item.parentId,effectiveAt);
    const schedule = recalculatePlannedDates();
    if (!schedule.valid) { state.items = rollbackItems; state.events.length = rollbackEventCount; throw new Error(schedule.message); }
  }
  return changed;
}

function reopenApproval(id, note = "", progressPercent) {
  const item = getItem(id);
  const user = currentUser();
  if (!item || item.type !== "approval" || item.status !== "done") throw new Error("Somente uma aprovação concluída pode ser reaberta.");
  if (!canDecideApproval(user, item)) throw new Error("Sua regra GPO não permite reabrir esta aprovação.");
  if (!note.trim()) throw new Error("Descreva o motivo da reabertura.");
  if (!Number.isFinite(Number(progressPercent)) || Number(progressPercent) < 0 || Number(progressPercent) >= 100 || Number(progressPercent) === Number(item.progressPercent)) throw new Error("Informe um novo percentual entre 0% e 99% ao reabrir a aprovação.");
  item.approvalRound = (item.approvalRound || 1) + 1;
  state.approvalDecisions ||= [];
  const reopened = { id: uid("decision"), itemId: item.id, requestId: item.approvalRequestId || item.id, round: item.approvalRound, kind: "reopened", outcome: "backlog", reviewerId: item.ownerId || "", correctionOwnerId: item.ownerId || "", reason: note.trim(), previousDecisionId: item.lastDecisionId || "", createdBy: user.id, createdAt: nowIso() };
  state.approvalDecisions.push(reopened);
  setApprovalStatus(item, "backlog", "approval_reopened", note.trim());
  createEvent(item.id, "progress_changed", 100, Number(progressPercent), "Percentual informado ao reabrir a aprovação.");
  item.progressPercent = Number(progressPercent);
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
  if (!root || !canEditItem(user,root)) throw new Error("Sua regra GPO não permite salvar este fluxo como modelo.");
  const ids = itemTreeIds(new Set([rootId]));
  const sourceItems = state.items.filter((item) => ids.has(item.id) && canViewItem(user,item));
  if (sourceItems.length !== ids.size || sourceItems.some((item) => !canEditItem(user,item))) throw new Error("Edite todos os itens do fluxo antes de criar um modelo.");
  const baseDate = root.plannedStartAt || today();
  const items = sourceItems.map((item) => ({
    key:item.id,
    parentKey:ids.has(item.parentId) ? item.parentId : "",
    title:item.title,
    type:item.type,
    status:item.status,
    ownerId:item.ownerId || "",
    description:item.description || "",
    startOffset:Math.round((new Date((item.plannedStartAt || baseDate) + "T12:00:00") - new Date(baseDate + "T12:00:00")) / 86400000),
    dueOffset:item.dueAt ? Math.round((new Date(item.dueAt + "T12:00:00") - new Date(baseDate + "T12:00:00")) / 86400000) : null,
    weight:Number(item.weight || 1),
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
  if (template.organizationId !== user?.organizationId && !canManageGpo(user)) throw new Error("Este modelo pertence a outra empresa.");
  const parent = {type:"project",organizationId:input.organizationId,sectorId:input.sectorId,state:input.state,createdBy:user?.id};
  if (!canCreateItem(user,parent)) throw new Error("Sua regra GPO não permite criar itens neste contexto.");
  if (!template.items?.length) throw new Error("O modelo não contém itens.");
  const snapshot = JSON.stringify(state);
  try {
    const ids = new Map();
    const created = [];
    for (const source of template.items) {
      const parentId = source.parentKey ? ids.get(source.parentKey) : "";
      if (source.parentKey && !parentId) throw new Error("A estrutura do modelo está inconsistente.");
      const eligibleOwners = state.users.filter((entry) => !entry.disabled && entry.organizationId === input.organizationId);
      const requestedOwner = input.ownerSelections?.[source.key] || source.ownerId;
      const ownerId = eligibleOwners.some((entry) => entry.id === requestedOwner) ? requestedOwner : eligibleOwners.some((entry) => entry.id === user.id) ? user.id : eligibleOwners[0]?.id || "";
      const status = input.statusSelections?.[source.key] || source.status || "backlog";
      const item = createItem({
        title:source.key === template.items[0].key ? input.title.trim() : source.title,
        type:source.type,
        status,
        ownerId,
        organizationId:input.organizationId,
        sectorId:input.sectorId,
        state:input.state,
        parentId,
        description:source.description,
        plannedStartAt:shiftedDate(input.startDate || today(),source.startOffset),
        dueAt:source.dueOffset === null ? "" : shiftedDate(input.startDate || today(),source.dueOffset),
        weight:source.weight || 1,
        progressPercent:completeStatus(status) ? 100 : 0,
        templateInstance:true,
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
  if (template.createdBy !== currentUser()?.id && !canManageGpo(currentUser())) throw new Error("Somente quem criou o modelo ou alguém autorizado no GPO pode removê-lo.");
  state.templates = state.templates.filter((entry) => entry.id !== id);
  registryEvent("template",template,"Modelo removido.","removed");
}

function removeRelation(id) {
  const relation = state.relations.find((entry) => entry.id === id);
  const target = relation && getItem(relation.targetId);
  const rule = target ? gpoDecision(currentUser(), "delete_relation", target) : false;
  if (rule !== true) throw new Error("Sua regra GPO não permite remover relações neste escopo.");
  if (!relation) throw new Error("Relação não encontrada.");
  if (!canEditItem(currentUser(),getItem(relation.sourceId)) || !canEditItem(currentUser(),getItem(relation.targetId))) throw new Error("Sem permissão para remover esta relação.");
  if (relation.relationType === "contains") getItem(relation.targetId).parentId = "";
  createEvent(relation.targetId,"relation_removed",relation.relationType,"",`Relação com ${getItem(relation.sourceId).title} removida.`);
  archiveRecord("archivedRelations",relation);
  state.relations = state.relations.filter((entry) => entry.id !== id);
}

function requireDeletionPermission(item = null) {
  if (!canRemoveItem(currentUser(), item)) throw new Error(item ? "Sua regra GPO não permite excluir este item." : "Sua regra GPO não permite excluir este cadastro.");
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
  state.archivedAttachments ||= [];
  const removedAttachments = (state.attachments || []).filter((attachment) => ids.has(attachment.itemId));
  removedAttachments.forEach((attachment) => state.archivedAttachments.push({...attachment,deletedAt:effectiveAt,deletedBy:currentUser()?.id || "system"}));
  state.attachments = (state.attachments || []).filter((attachment) => !ids.has(attachment.itemId));
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
  const user = state.users.find((entry) => entry.id === id);
  if (!user) throw new Error("Usuário não encontrado.");
  if (!canManageUsers(currentUser(),user.organizationId)) throw new Error("O GPO não permite gerenciar usuários nesta empresa.");
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
  const sector = state.sectors.find((entry) => entry.id === id);
  if (!sector) throw new Error("Setor não encontrado.");
  if (!canManageOrganization(currentUser(), sector.organizationId)) throw new Error("O GPO não permite administrar esta empresa.");
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
  const organization = state.organizations.find((entry) => entry.id === id);
  if (!organization) throw new Error("Empresa não encontrada.");
  if (!canManageOrganization(currentUser(), id)) throw new Error("O GPO não permite administrar esta empresa.");
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

function datePlusDays(dateValue, days) {
  if (!dateValue) return "";
  const date = new Date(String(dateValue).slice(0,10) + "T12:00:00");
  if (!Number.isFinite(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days || 0));
  return date.getFullYear() + "-" + String(date.getMonth()+1).padStart(2,"0") + "-" + String(date.getDate()).padStart(2,"0");
}

function itemDurationDays(item) {
  if (Number.isFinite(Number(item.plannedDurationDays))) return Math.max(0, Number(item.plannedDurationDays));
  if (item.plannedStartAt && item.dueAt) return Math.max(0, (new Date(item.dueAt + "T12:00:00") - new Date(item.plannedStartAt + "T12:00:00")) / 86400000);
  return 0;
}

function recalculatePlannedDates() {
  const temporal = new Set(["TI","II","TT","IF"]);
  const items = state.items.filter((item)=>!item.archivedAt), byId = new Map(items.map((item) => [item.id,item]));
  const dependencies = state.relations.filter((r) => temporal.has(r.relationType) && byId.has(r.sourceId) && byId.has(r.targetId));
  const incoming = new Map(items.map((item) => [item.id,[]])), outgoing = new Map(items.map((item) => [item.id,[]]));
  dependencies.forEach((r) => { incoming.get(r.targetId).push(r); outgoing.get(r.sourceId).push(r); });
  const indegree = new Map(items.map((item) => [item.id,incoming.get(item.id).length]));
  const queue = items.filter((item) => indegree.get(item.id) === 0).map((item) => item.id), order = [];
  while (queue.length) { const id = queue.shift(); order.push(id); for (const r of outgoing.get(id)) { const n = indegree.get(r.targetId)-1; indegree.set(r.targetId,n); if (n === 0) queue.push(r.targetId); } }
  if (order.length !== items.length) return {valid:false,message:"Há um ciclo nas dependências temporais. As datas não foram recalculadas."};
  for (const item of items) {
    const deps = incoming.get(item.id) || [];
    if (!["backlog","ready"].includes(item.status)) continue;
    const blockers = state.relations.filter((r)=>r.targetId===item.id && r.relationType==="blocks");
    const released = deps.every((r) => { const pred=byId.get(r.sourceId); if (!pred) return false; if (r.relationType === "II" || r.relationType === "IF") return ["in_progress","done"].includes(pred.status); return pred.status === "done"; }) && blockers.every((r)=>["done","cancelled"].includes(byId.get(r.sourceId)?.status));
    const nextStatus = released ? "ready" : "backlog";
    if (item.status !== nextStatus) { createEvent(item.id,"status_changed",item.status,nextStatus,"Liberação calculada automaticamente pelas predecessoras."); item.status=nextStatus; }
  }
  const durations = new Map(items.map((item) => [item.id,itemDurationDays(item)]));
  const starts = new Map(items.map((item) => [item.id,item.baselineStartAt || item.plannedStartAt || today()]));
  for (const id of order) {
    const duration = durations.get(id), candidates = [];
    for (const r of incoming.get(id)) {
      const pred = byId.get(r.sourceId), ps = starts.get(pred.id), pf = datePlusDays(ps,durations.get(pred.id)), lag = Number(r.lagDays) || 0;
      if (r.relationType === "TI") candidates.push(datePlusDays(pf,lag));
      else if (r.relationType === "II") candidates.push(datePlusDays(ps,lag));
      else if (r.relationType === "TT") candidates.push(datePlusDays(pf,lag-duration));
      else if (r.relationType === "IF") candidates.push(datePlusDays(ps,lag-duration));
    }
    if (candidates.length) { const earliestAllowed=starts.get(id); const dependencyStart=candidates.filter(Boolean).sort().at(-1); starts.set(id,earliestAllowed && dependencyStart ? (earliestAllowed > dependencyStart ? earliestAllowed : dependencyStart) : earliestAllowed || dependencyStart); }
  }
  for (const item of items) {
    if (items.some((child) => child.parentId === item.id && child.status !== "cancelled")) continue;
    item.plannedStartAt = starts.get(item.id) || item.baselineStartAt || item.plannedStartAt || today();
    item.dueAt = datePlusDays(item.plannedStartAt,durations.get(item.id));
  }
  const depthOf = (item) => { let depth=0, cursor=item, seen=new Set(); while (cursor?.parentId && !seen.has(cursor.parentId)) { seen.add(cursor.parentId); cursor=byId.get(cursor.parentId); if (cursor) depth++; } return depth; };
  const groups = items.filter((item) => items.some((child) => child.parentId === item.id && child.status !== "cancelled")).sort((a,b)=>depthOf(a)-depthOf(b));
  for (const group of groups) {
    if (!group.replannedDueAt) continue;
    const descendants = items.filter((item) => { let cursor=item, seen=new Set(); while (cursor?.parentId && !seen.has(cursor.parentId)) { if (cursor.parentId === group.id) return true; seen.add(cursor.parentId); cursor=byId.get(cursor.parentId); } return false; }).filter((item)=>!items.some((child)=>child.parentId===item.id && child.status!=="cancelled") && item.status!=="cancelled");
    const latest = descendants.map((item)=>item.dueAt).filter(Boolean).sort().at(-1);
    if (!latest || !descendants.length) continue;
    const delta = (new Date(group.replannedDueAt+"T12:00:00")-new Date(latest+"T12:00:00"))/86400000;
    if (!Number.isFinite(delta)) continue;
    for (const leaf of descendants) { leaf.plannedStartAt=datePlusDays(leaf.plannedStartAt,delta); leaf.dueAt=datePlusDays(leaf.dueAt,delta); }
  }
  const summaryGroups = [...groups].sort((a,b)=>depthOf(b)-depthOf(a));
  for (const group of summaryGroups) syncParentSummary(group.id);
  return {valid:true};
}
