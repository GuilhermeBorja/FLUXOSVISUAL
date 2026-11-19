import { HttpError, assert } from "./http.mjs";
import {
  checkId,
  clone,
  dateFields,
  dateValid,
  editableFields,
  id,
  operations,
  pick,
  same,
  validateState,
} from "./domain.mjs";
import {
  normalizeTemplate,
  validateTemplateApplication,
} from "./template-validation.mjs";

const timestamp = () => new Date().toISOString();
const children = (state, rootId) => {
  const ids = new Set([rootId]);
  for (let changed = true; changed; ) {
    changed = false;
    for (const item of state.items)
      if (ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
  }
  return state.items.filter((i) => ids.has(i.id));
};
const has = (s, key, value) => s[key]?.some((x) => x.id === value);
const actor = (d) => d.state.users.find((u) => u.id === d.state.currentUserId);
const contextFor = (d, input) => {
  const owner = d.state.users.find((u) => u.id === input.ownerId);
  assert(
    owner && !owner.disabled,
    422,
    "INVALID_OWNER",
    "Selecione um responsável ativo.",
  );
  return {
    ...input,
    organizationId: owner.organizationId,
    sectorId: owner.sectorId,
    state: owner.state,
  };
};
const requireRelation = (d, relation, op) => {
  assert(relation, 404, "RELATION_NOT_FOUND", "Relação não encontrada.");
  const source = d.item(relation.sourceId, "edit_item");
  d.item(relation.targetId, "view_item");
  d.authorize(op, source);
  return relation;
};

function validateInput(input) {
  for (const field of dateFields)
    if (Object.hasOwn(input, field))
      assert(
        dateValid(input[field]),
        422,
        "INVALID_DATE",
        "Data inexistente no calendário.",
        { field },
      );
  if (input.description !== undefined)
    assert(
      typeof input.description === "string" &&
        input.description.length <= 20000,
      422,
      "DESCRIPTION_LIMIT",
      "Descrição limitada a 20.000 caracteres.",
    );
}

export function executeCommand(d, command, metadata = {}) {
  assert(
    command &&
      typeof command.type === "string" &&
      Array.isArray(command.args || []),
    422,
    "INVALID_COMMAND",
    "Comando inválido.",
  );
  const args = clone(command.args || []),
    type = command.type,
    s = d.state;
  const effectiveAt = metadata.effectiveAt || timestamp(),
    comment = String(metadata.comment || "").trim();
  assert(
    Number.isFinite(Date.parse(effectiveAt)) &&
      Date.parse(effectiveAt) <= Date.now() + 5 * 60 * 1000,
    422,
    "INVALID_EFFECTIVE_DATE",
    "A data efetiva é inválida ou está no futuro.",
  );
  assert(
    comment.length <= 20000,
    422,
    "COMMENT_LIMIT",
    "Comentário limitado a 20.000 caracteres.",
  );
  if (type === "createItem") {
    const raw = args[0] || {};
    validateInput(raw);
    const input = contextFor(d, {
      type: "task",
      status: "backlog",
      plannedDurationDays: null,
      weight: 1,
      progressPercent: 0,
      ownerId: actor(d).id,
      ...pick(raw, [...editableFields, "parentId", "sortOrder"]),
    });
    if (input.parentId) d.item(input.parentId, "edit_item");
    d.authorize("create_item", { ...input, createdBy: actor(d).id });
    if (input.status === "blocked") input.blocked = true;
    if (input.type === "approval")
      assert(
        !["done", "under_review", "correction"].includes(input.status),
        422,
        "APPROVAL_COMMAND_REQUIRED",
        "Crie a aprovação pendente e registre a decisão na aba Aprovação.",
      );
    if (raw.id) {
      checkId(raw.id);
      assert(
        !has(s, "items", raw.id),
        409,
        "DUPLICATE_ID",
        "O identificador do item já existe.",
      );
      d.forceItemId(raw.id);
    }
    const item = d.call("createItem", input);
    if (item.type === "approval") {
      item.approvalReviewerId = item.ownerId;
      item.approvalRound = 1;
    }
    if (item.status === "blocked") item.statusBeforeManualBlock = "backlog";
    return item;
  }
  if (type === "updateItem") {
    const current = d.item(args[0], "edit_item"),
      raw = args[1] || {};
    validateInput(raw);
    if (raw.version !== undefined)
      assert(
        raw.version === current.version,
        409,
        "VERSION_CONFLICT",
        "Este item foi alterado por outro usuário.",
        { itemId: current.id, currentVersion: current.version },
      );
    const patch = pick(raw, editableFields),
      input = contextFor(d, { ...pick(current, editableFields), ...patch });
    if (input.status === "blocked" && current.status !== "blocked")
      current.statusBeforeManualBlock = current.status;
    if (
      Object.hasOwn(patch, "plannedDurationDays") &&
      patch.plannedDurationDays === null
    ) {
      d.authorize("change_duration", current);
      input.plannedDurationDays = "";
      input.dueAt = "";
    }
    const result = d.call(
      "updateItem",
      current.id,
      input,
      args[2] || effectiveAt,
      args[3] || comment,
    );
    if (
      Object.hasOwn(patch, "plannedDurationDays") &&
      patch.plannedDurationDays === null
    ) {
      current.plannedDurationDays = null;
      current.dueAt = "";
    }
    if (Object.hasOwn(patch, "ownerId") && current.type === "approval")
      current.approvalReviewerId = current.ownerId;
    return { id: current.id, changed: result };
  }
  if (type === "moveItemHierarchy" || type === "reorderItem") {
    const item = d.item(args[0], "edit_item");
    d.authorize("change_hierarchy", item);
    if (item.parentId) d.item(item.parentId, "edit_item");
    if (args[1]) d.item(args[1], "edit_item");
    return d.call(type, ...args);
  }
  if (type === "createRelation") {
    assert(
      args[2] === "TI",
      422,
      "RELATION_TYPE",
      "Use MoveItem para alterar o pai. Somente TI é persistida.",
    );
    const source = d.item(args[0], "edit_item"),
      target = d.item(args[1], "view_item");
    assert(
      !source.archivedAt && !target.archivedAt,
      422,
      "ARCHIVED_RELATION",
      "Restaure os itens antes de vinculá-los.",
    );
    d.authorize("create_relation", source);
    return d.call(type, ...args);
  }
  if (type === "updateRelation") {
    const rel = requireRelation(
      d,
      s.relations.find((r) => r.id === args[0]),
      "edit_relation",
    );
    const input = pick(args[1] || {}, [
      "sourceId",
      "targetId",
      "relationType",
      "lagDays",
      "description",
    ]);
    if (input.sourceId) d.item(input.sourceId, "edit_item");
    if (input.targetId) d.item(input.targetId, "view_item");
    return d.call(type, rel.id, input);
  }
  if (type === "removeRelation") {
    requireRelation(
      d,
      s.relations.find((r) => r.id === args[0]),
      "delete_relation",
    );
    return d.call(type, ...args);
  }
  if (
    [
      "archiveItem",
      "restoreArchivedItem",
      "removeItem",
      "deleteItem",
      "restoreItem",
    ].includes(type)
  ) {
    const name =
      {
        deleteItem: "archiveItem",
        restoreItem: "restoreArchivedItem",
        removeItem: "archiveItem",
      }[type] || type;
    const operation = ["removeItem", "deleteItem"].includes(type)
      ? "delete_item"
      : "edit_item";
    const item = d.item(args[0], operation);
    for (const affected of children(s, item.id)) d.item(affected.id, operation);
    return d.call(name, item.id);
  }
  if (
    ["submitApprovalForReview", "decideApproval", "reopenApproval"].includes(
      type,
    )
  ) {
    const item = d.item(args[0]);
    d.authorize(
      type === "submitApprovalForReview"
        ? "create_approval"
        : "decide_approval",
      item,
    );
    if (type !== "submitApprovalForReview")
      assert(
        (item.approvalReviewerId || item.ownerId) === actor(d).id,
        403,
        "APPROVER_REQUIRED",
        "A decisão pertence ao aprovador designado para esta rodada.",
      );
    return d.call(type, ...args);
  }
  if (type === "cancelApproval") {
    const item = d.item(args[0]);
    d.authorize("create_approval", item);
    assert(
      item.type === "approval" && item.status === "under_review",
      422,
      "APPROVAL_STATE",
      "A aprovação não está pendente.",
    );
    assert(
      String(args[1] || comment).trim(),
      422,
      "COMMENT_REQUIRED",
      "Informe o motivo do cancelamento.",
    );
    const event = {
      id: id("decision"),
      itemId: item.id,
      requestId: item.approvalRequestId || item.id,
      round: item.approvalRound || 1,
      kind: "cancelled",
      outcome: "cancelled",
      reviewerId: actor(d).id,
      reason: args[1] || comment,
      createdBy: actor(d).id,
      createdAt: timestamp(),
    };
    s.approvalDecisions.push(event);
    item.status = "cancelled";
    d.call(
      "createEvent",
      item.id,
      "approval_cancelled",
      "under_review",
      "cancelled",
      event.reason,
    );
    return event;
  }
  if (type === "setBlocker") {
    const item = d.item(args[0], "edit_item"),
      reason = String(args[1] || "").trim();
    assert(
      reason,
      422,
      "BLOCK_REASON_REQUIRED",
      "Informe o motivo do bloqueio.",
    );
    assert(
      !s.items.some((i) => i.parentId === item.id && !i.archivedAt),
      422,
      "SUMMARY_BLOCKER",
      "Registre o impedimento na atividade final.",
    );
    s.blockers ||= [];
    const record = {
      id: id("blocker"),
      sourceItemId: item.id,
      affectedItemId: item.id,
      reason,
      active: true,
      manual: true,
      createdBy: actor(d).id,
      createdAt: timestamp(),
    };
    s.blockers.push(record);
    if (item.status !== "blocked") item.statusBeforeManualBlock = item.status;
    item.blockedByPropagation = false;
    item.status = "blocked";
    item.blockedReason = reason;
    item.blockedAt = timestamp();
    d.call(
      "createEvent",
      item.id,
      "blocker_created",
      "",
      record.id,
      reason,
      effectiveAt,
    );
    d.call("recalculateBlocking", effectiveAt);
    return record;
  }
  if (type === "resolveBlocker") {
    const blocker = (s.blockers || []).find(
      (b) => b.id === args[0] && b.active && b.manual,
    );
    assert(
      blocker,
      404,
      "BLOCKER_NOT_FOUND",
      "Fonte de bloqueio não encontrada.",
    );
    const item = d.item(blocker.sourceItemId, "edit_item"),
      reason = String(args[1] || comment).trim();
    assert(reason, 422, "COMMENT_REQUIRED", "Informe o motivo do desbloqueio.");
    blocker.active = false;
    blocker.resolvedBy = actor(d).id;
    blocker.resolvedAt = timestamp();
    blocker.resolution = reason;
    const remaining = s.blockers.filter(
      (b) => b.manual && b.active && b.sourceItemId === item.id,
    );
    if (!remaining.length) {
      item.status = item.statusBeforeManualBlock || "backlog";
      item.blockedReason = "";
      item.blockedByPropagation = false;
      item.blockedAt = "";
    } else item.blockedReason = remaining.map((b) => b.reason).join("; ");
    d.call(
      "createEvent",
      item.id,
      "blocker_resolved",
      blocker.id,
      "",
      reason,
      effectiveAt,
    );
    d.call("recalculateBlocking", effectiveAt);
    return blocker;
  }
  if (["createPermissionRule", "removePermissionRule"].includes(type)) {
    d.authorize("manage_gpo");
    return d.call(type, ...args);
  }
  if (type === "saveFlowTemplate") {
    const template = d.call(type, ...args);
    Object.assign(template, normalizeTemplate(template, s), { version: 1 });
    return template;
  }
  if (type === "applyFlowTemplate") {
    const index = s.templates.findIndex((template) => template.id === args[0]);
    assert(index >= 0, 404, "TEMPLATE_NOT_FOUND", "Modelo não encontrado.");
    const original = s.templates[index],
      normalized = normalizeTemplate(original, s);
    const input = validateTemplateApplication(normalized, args[1], s);
    s.templates[index] = normalized;
    try {
      return d.call(type, args[0], input);
    } finally {
      s.templates[index] = original;
    }
  }
  if (type === "removeFlowTemplate") return d.call(type, ...args);
  if (type === "recalculateSchedule") {
    d.authorize("edit_item");
    return d.call("recalculatePlannedDates");
  }
  throw new HttpError(
    422,
    "UNKNOWN_COMMAND",
    `Comando não reconhecido: ${type}.`,
  );
}

function objectArray(value, key) {
  assert(
    Array.isArray(value) && value.length <= 50000,
    422,
    "INVALID_COLLECTION",
    `A coleção ${key} é inválida.`,
  );
  const seen = new Set();
  for (const row of value) {
    assert(
      row && typeof row === "object" && !Array.isArray(row),
      422,
      "INVALID_RECORD",
      "Registro inválido.",
    );
    checkId(row.id);
    assert(!seen.has(row.id), 422, "DUPLICATE_ID", `ID duplicado em ${key}.`);
    seen.add(row.id);
  }
  return value;
}

function syncRegistry(
  d,
  baseline,
  desired,
  key,
  allowed,
  operation,
  context,
  beforeRemove,
) {
  if (!Object.hasOwn(desired, key)) return;
  const records = objectArray(desired[key], key),
    previous = new Map((baseline[key] || []).map((v) => [v.id, v]));
  for (const row of records) {
    const old = previous.get(row.id),
      clean = pick(row, allowed);
    if (old && same(pick(old, allowed), clean)) continue;
    const oldFull = d.state[key].find((x) => x.id === row.id);
    assert(
      old || !oldFull,
      403,
      "HIDDEN_RECORD",
      "Não é permitido alterar um registro fora do seu escopo.",
    );
    d.authorize(operation, context(row));
    if (old) d.authorize(operation, context(old));
    const record = {
      ...oldFull,
      ...clean,
      id: row.id,
      version: (oldFull?.version || 0) + 1,
      updatedAt: timestamp(),
    };
    if (!old) {
      record.createdAt = timestamp();
      record.createdBy = actor(d).id;
      d.state[key].push(record);
    } else Object.assign(oldFull, record);
    d.call(
      "registryEvent",
      key,
      record,
      old ? "Cadastro atualizado." : "Cadastro criado.",
      old ? "updated" : "created",
    );
  }
  const ids = new Set(records.map((r) => r.id));
  for (const old of previous.values())
    if (!ids.has(old.id)) {
      d.authorize(operation, context(old));
      beforeRemove?.(old);
      const full = d.state[key].find((r) => r.id === old.id);
      if (!full) continue;
      if (key === "users") {
        full.disabled = true;
      } else if (key === "permissionProfiles") {
        full.inactive = true;
      } else if (["permissionRules", "templates"].includes(key)) {
        d.state[key] = d.state[key].filter((r) => r.id !== old.id);
      } else {
        const archive = {
          organizations: "archivedOrganizations",
          sectors: "archivedSectors",
        }[key];
        d.state[archive] ||= [];
        d.state[archive].push({ ...full, archivedAt: timestamp() });
        d.state[key] = d.state[key].filter((r) => r.id !== old.id);
      }
      d.call("registryEvent", key, old, "Cadastro inativado.", "removed");
    }
}

const luminance = (hex) => {
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((v) => parseInt(v, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};
function validateSettings(d, key, settings) {
  assert(
    settings && typeof settings === "object" && !Array.isArray(settings),
    422,
    "INVALID_SETTINGS",
    "Configuração inválida.",
  );
  const icons = vmIcons(d);
  for (const [orgId, values] of Object.entries(settings)) {
    assert(
      has(d.state, "organizations", orgId),
      422,
      "INVALID_ORGANIZATION",
      "Configuração deve pertencer a uma empresa.",
    );
    d.authorize("manage_organization", {
      organizationId: orgId,
      state: d.state.organizations.find((o) => o.id === orgId)?.state,
    });
    for (const config of Object.values(values)) {
      assert(
        config && typeof config === "object",
        422,
        "INVALID_SETTINGS",
        "Configuração inválida.",
      );
      if (config.color) {
        assert(
          /^#[\da-f]{6}$/i.test(config.color),
          422,
          "INVALID_COLOR",
          "Informe uma cor hexadecimal de seis dígitos.",
        );
        const lum = luminance(config.color);
        assert(
          Math.max((lum + 0.05) / 0.05, 1.05 / (lum + 0.05)) >= 4.5,
          422,
          "COLOR_CONTRAST",
          "A cor não permite contraste AA.",
        );
      }
      if (config.icon)
        assert(
          icons.includes(config.icon),
          422,
          "INVALID_ICON",
          "Ícone indisponível no conjunto do aplicativo.",
        );
    }
  }
}
const vmIcons = (d) => [
  "folder-kanban",
  "workflow",
  "layers-2",
  "list-tree",
  "square-check",
  "stamp",
  "circle-alert",
  "package-check",
  "flag",
  "file-text",
  "network",
  "table-2",
  "plus",
  "link-2",
  "users",
  "building-2",
  "circle-help",
  "pencil",
  "paperclip",
  "list-todo",
  "loader-circle",
  "clock-3",
  "ban",
  "check-circle-2",
];

/** Compatibility command for the existing UI. Only declared editable fields are applied.
 * Audits, calculated fields, sessions and historical decisions never come from the client. */
export function synchronize(d, baseline, desired, actions = [], metadata = {}) {
  assert(
    desired && typeof desired === "object" && !Array.isArray(desired),
    422,
    "INVALID_STATE",
    "Informe as alterações do workspace.",
  );
  const s = d.state;
  const calculatedFields = new Set([
    "status",
    "progressPercent",
    "plannedStartAt",
    "dueAt",
    "plannedDurationDays",
  ]);
  if (metadata.fieldHints !== undefined) {
    assert(
      metadata.fieldHints &&
        typeof metadata.fieldHints === "object" &&
        !Array.isArray(metadata.fieldHints),
      422,
      "INVALID_FIELD_HINTS",
      "Informe a intenção de edição por item.",
    );
    for (const [itemId, fields] of Object.entries(metadata.fieldHints)) {
      checkId(itemId);
      assert(
        Array.isArray(fields) &&
          fields.every((field) => editableFields.includes(field)),
        422,
        "INVALID_FIELD_HINTS",
        "Campo de edição inválido.",
      );
    }
  }
  syncRegistry(
    d,
    baseline,
    desired,
    "organizations",
    ["name", "state"],
    "manage_organization",
    (r) => ({ organizationId: r.id, state: r.state }),
    (r) =>
      assert(
        !s.users.some((u) => u.organizationId === r.id) ||
          desired.users?.every((u) => u.organizationId !== r.id),
        422,
        "ORGANIZATION_IN_USE",
        "Realoque os usuários antes de excluir a empresa.",
      ),
  );
  syncRegistry(
    d,
    baseline,
    desired,
    "sectors",
    ["name", "organizationId"],
    "manage_organization",
    (r) => ({ organizationId: r.organizationId }),
    (r) =>
      assert(
        !s.users.some((u) => u.sectorId === r.id) ||
          desired.users?.every((u) => u.sectorId !== r.id),
        422,
        "SECTOR_IN_USE",
        "Realoque os usuários antes de excluir o setor.",
      ),
  );
  syncRegistry(
    d,
    baseline,
    desired,
    "users",
    [
      "name",
      "email",
      "organizationId",
      "sectorId",
      "state",
      "profileId",
      "disabled",
    ],
    "manage_users",
    (r) => ({ organizationId: r.organizationId, state: r.state }),
  );
  // A password is a transient command parameter and is never persisted in domain JSON.
  const credentials = [];
  for (const row of desired.users || []) {
    const existing = baseline.users?.find((u) => u.id === row.id);
    if (!existing) {
      d.authorize("manage_users", { organizationId: row.organizationId });
      assert(
        typeof row.password === "string" && row.password.length >= 12,
        422,
        "PASSWORD_REQUIRED",
        "Defina uma senha de pelo menos 12 caracteres para o novo usuário.",
      );
      credentials.push({ id: row.id, password: row.password });
    } else if (row.password) {
      d.authorize("manage_users", { organizationId: row.organizationId });
      credentials.push({ id: row.id, password: row.password });
    }
  }
  for (const user of s.users) {
    if (user.email) user.email = user.email.trim().toLowerCase();
    if (user.name) user.name = user.name.trim();
  }
  syncRegistry(
    d,
    baseline,
    desired,
    "permissionProfiles",
    ["name", "inactive"],
    "manage_gpo",
    () => null,
  );
  syncRegistry(
    d,
    baseline,
    desired,
    "permissionRules",
    [
      "subjectType",
      "subjectId",
      "operation",
      "scopeType",
      "scopeId",
      "effect",
      "inactive",
    ],
    "manage_gpo",
    () => null,
  );
  for (const rule of s.permissionRules) {
    assert(
      operations.includes(rule.operation) &&
        ["allow", "deny"].includes(rule.effect) &&
        ["user", "profile"].includes(rule.subjectType) &&
        [
          "global",
          "organization",
          "sector",
          "state",
          "project",
          "item",
          "creator",
        ].includes(rule.scopeType),
      422,
      "INVALID_RULE",
      "Regra GPO inválida.",
    );
    assert(
      has(
        s,
        rule.subjectType === "user" ? "users" : "permissionProfiles",
        rule.subjectId,
      ),
      422,
      "INVALID_SUBJECT",
      "Sujeito da regra GPO inexistente.",
    );
    if (rule.scopeType === "organization" && rule.scopeId !== "@user")
      assert(
        has(s, "organizations", rule.scopeId),
        422,
        "INVALID_SCOPE",
        "Empresa da regra inexistente.",
      );
    if (rule.scopeType === "sector")
      assert(
        has(s, "sectors", rule.scopeId),
        422,
        "INVALID_SCOPE",
        "Setor da regra inexistente.",
      );
  }
  const baseItems = new Map((baseline.items || []).map((i) => [i.id, i]));
  const wanted = Object.hasOwn(desired, "items")
    ? objectArray(desired.items, "items")
    : baseline.items;
  const desiredIds = new Set(wanted.map((i) => i.id));
  // Remove TI first so moving a former leaf into a group can be atomic.
  const baseRelations = new Map(
    (baseline.relations || []).map((r) => [r.id, r]),
  );
  const wantedRelations = Object.hasOwn(desired, "relations")
    ? objectArray(desired.relations, "relations")
    : baseline.relations;
  const desiredRelationIds = new Set(wantedRelations.map((r) => r.id));
  for (const old of baseRelations.values())
    if (!desiredRelationIds.has(old.id))
      executeCommand(d, { type: "removeRelation", args: [old.id] }, metadata);
  for (const old of baseItems.values())
    if (!desiredIds.has(old.id) && !old.archivedAt)
      executeCommand(d, { type: "deleteItem", args: [old.id] }, metadata);
  const newItems = wanted.filter((i) => !baseItems.has(i.id));
  const pending = [...newItems];
  while (pending.length) {
    const index = pending.findIndex(
      (i) => !i.parentId || has(s, "items", i.parentId),
    );
    assert(
      index >= 0,
      422,
      "HIERARCHY_CYCLE",
      "A estrutura contém ciclos ou um pai inexistente.",
    );
    const row = pending.splice(index, 1)[0];
    assert(
      !has(s, "items", row.id),
      403,
      "HIDDEN_ITEM",
      "O item não pode ser criado neste escopo.",
    );
    executeCommand(d, { type: "createItem", args: [row] }, metadata);
  }
  // Reparenting is a command, never a raw assignment. Retry moves whose desired parents move first.
  const moves = wanted.filter(
    (row) =>
      baseItems.has(row.id) && row.parentId !== baseItems.get(row.id).parentId,
  );
  for (const row of moves)
    executeCommand(
      d,
      { type: "moveItemHierarchy", args: [row.id, row.parentId || ""] },
      metadata,
    );
  const currentParents = new Set(
    wanted.filter((i) => !i.archivedAt).map((i) => i.parentId),
  );
  for (const row of wanted) {
    const old = baseItems.get(row.id);
    if (!old) continue;
    const current = s.items.find((i) => i.id === row.id);
    assert(current, 404, "ITEM_NOT_FOUND", "Item não encontrado.");
    if (!same(old.archivedAt || "", row.archivedAt || ""))
      executeCommand(
        d,
        {
          type: row.archivedAt ? "archiveItem" : "restoreArchivedItem",
          args: [row.id],
        },
        metadata,
      );
    const patch = {};
    for (const key of editableFields) {
      if (
        !Object.hasOwn(row, key) ||
        same(old[key], row[key]) ||
        same(current[key], row[key])
      )
        continue;
      if (currentParents.has(row.id) && calculatedFields.has(key)) continue;
      if (
        metadata.fieldHints !== undefined &&
        calculatedFields.has(key) &&
        !metadata.fieldHints[row.id]?.includes(key)
      )
        continue;
      patch[key] = row[key];
    }
    // Date recalculation from another edit is never treated as a second manual write.
    const explicitComment =
      Object.hasOwn(metadata.fieldHints || {}, row.id) &&
      String(metadata.comment || "").trim();
    if (Object.keys(patch).length || explicitComment)
      executeCommand(
        d,
        { type: "updateItem", args: [row.id, patch] },
        metadata,
      );
    if (!same(old.sortOrder, row.sortOrder)) {
      d.authorize("change_hierarchy", current);
      assert(
        Number.isFinite(row.sortOrder) && Math.abs(row.sortOrder) < 1e12,
        422,
        "INVALID_ORDER",
        "Ordem inválida.",
      );
      const previous = current.sortOrder;
      current.sortOrder = row.sortOrder;
      d.call(
        "createEvent",
        row.id,
        "order_changed",
        previous,
        row.sortOrder,
        metadata.comment || "Ordem alterada.",
      );
    }
  }
  for (const row of wantedRelations) {
    const old = baseRelations.get(row.id);
    if (!old) {
      assert(
        !has(s, "relations", row.id),
        403,
        "HIDDEN_RELATION",
        "Relação fora do escopo.",
      );
      const relation = executeCommand(
        d,
        {
          type: "createRelation",
          args: [
            row.sourceId,
            row.targetId,
            row.relationType,
            row.lagDays || 0,
            row.description || "",
          ],
        },
        metadata,
      );
      relation.id = row.id;
    } else if (
      !same(
        pick(old, [
          "sourceId",
          "targetId",
          "relationType",
          "lagDays",
          "description",
        ]),
        pick(row, [
          "sourceId",
          "targetId",
          "relationType",
          "lagDays",
          "description",
        ]),
      )
    )
      executeCommand(
        d,
        { type: "updateRelation", args: [row.id, row] },
        metadata,
      );
  }
  const templateFields = [
    "name",
    "organizationId",
    "rootTitle",
    "items",
    "relations",
  ];
  syncRegistry(
    d,
    baseline,
    desired,
    "templates",
    templateFields,
    "edit_item",
    (r) => ({
      organizationId: r.organizationId,
      createdBy: r.createdBy || actor(d).id,
    }),
    (r) =>
      assert(
        r.createdBy === actor(d).id ||
          d.functions.gpoDecision(actor(d), "manage_gpo", null),
        403,
        "TEMPLATE_OWNER_REQUIRED",
        "Somente quem criou o modelo ou quem administra GPO pode removê-lo.",
      ),
  );
  for (const template of s.templates) {
    const old = baseline.templates.find((value) => value.id === template.id);
    if (
      !old ||
      !same(pick(old, templateFields), pick(template, templateFields))
    )
      Object.assign(template, normalizeTemplate(template, s));
  }
  for (const key of ["typeSettings", "statusSettings"])
    if (Object.hasOwn(desired, key) && !same(baseline[key], desired[key])) {
      const current = { ...s[key] };
      for (const org of new Set([
        ...Object.keys(baseline[key] || {}),
        ...Object.keys(desired[key] || {}),
      ])) {
        if (same(baseline[key]?.[org], desired[key]?.[org])) continue;
        validateSettings(d, key, { [org]: desired[key]?.[org] || {} });
        current[org] = clone(desired[key]?.[org] || {});
      }
      s[key] = current;
    }
  if (
    Object.hasOwn(desired, "workspaceName") &&
    desired.workspaceName !== baseline.workspaceName
  ) {
    d.authorize("manage_organization");
    assert(
      typeof desired.workspaceName === "string" &&
        desired.workspaceName.length <= 160,
      422,
      "INVALID_NAME",
      "Nome inválido.",
    );
    s.workspaceName = desired.workspaceName;
  }
  for (const action of actions) {
    assert(
      [
        "submitApprovalForReview",
        "decideApproval",
        "reopenApproval",
        "cancelApproval",
      ].includes(action.type),
      422,
      "INVALID_ACTION",
      "Ação adicional inválida.",
    );
    executeCommand(d, action, metadata);
  }
  validateState(s);
  return { credentials };
}
