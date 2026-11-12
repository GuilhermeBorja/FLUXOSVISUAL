import { randomUUID } from "node:crypto";
import { HttpError, assert } from "./http.mjs";
import {
  clone,
  createDomain,
  evaluatePermission,
  id,
  operations,
  pick,
  same,
  validateState,
} from "./domain.mjs";
import { executeCommand, synchronize } from "./commands.mjs";
import { prepareCredentialHashes } from "./credential-policy.mjs";

const recordKeys = [
  "organizations",
  "sectors",
  "users",
  "permissionProfiles",
  "permissionRules",
  "templates",
  "archivedItems",
  "archivedUsers",
  "archivedOrganizations",
  "archivedSectors",
  "blockers",
];
export const preferenceKeys = [
  "filters",
  "graphPositions",
  "graphTransform",
  "graphTransforms",
  "graphLayouts",
  "prd5GanttColumnViews",
  "hiddenTableColumns",
  "tableColumnWidths",
  "tableColumnPinned",
  "rowFillSettings",
  "riskThresholdDays",
  "graphSettings",
  "ganttScale",
  "grouping",
  "graphGrouping",
  "graphStatusSettings",
  "paneWidths",
  "prd5GanttWidth",
  "drawerWidth",
  "ganttWidth",
  "viewGrouping",
  "viewScopeId",
  "viewShowSubitems",
];
const stamp = () => new Date().toISOString();

// History is subject to the same visibility boundary as current items. Derived
// events can refer to a predecessor whose access was subsequently removed.
function historyRedactor(state, user) {
  const hidden = state.items.filter(
    (item) => !evaluatePermission(state, user, "view_item", item).allowed,
  );
  const pattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const identifiers = hidden.map(
    (item) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}_-])${pattern(item.id)}(?=$|[^\\p{L}\\p{N}_-])`,
        "gu",
      ),
  );
  const titles = hidden
    .filter((i) => i.title)
    .sort((a, b) => b.title.length - a.title.length)
    .map(
      (i) =>
        new RegExp(
          `(^|[^\\p{L}\\p{N}])${pattern(i.title)}(?=$|[^\\p{L}\\p{N}])`,
          "gu",
        ),
    );
  const redact = (value, key = "") => {
    if (Array.isArray(value)) return value.map((v) => redact(v, key));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, redact(v, k)]),
      );
    if (typeof value !== "string") return value;
    for (const regex of identifiers)
      value = value.replace(regex, "$1[restrito]");
    if (
      [
        "comment",
        "reason",
        "description",
        "title",
        "name",
        "fromValue",
        "toValue",
      ].includes(key)
    )
      for (const regex of titles)
        value = value.replace(regex, "$1[conteúdo restrito]");
    return value;
  };
  return redact;
}

export function initializeSchema(storage) {
  storage.db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_meta(workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id),revision INTEGER NOT NULL DEFAULT 0,meta_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS domain_records(workspace_id TEXT NOT NULL REFERENCES workspaces(id),kind TEXT NOT NULL,id TEXT NOT NULL,position INTEGER NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(workspace_id,kind,id));
    CREATE TABLE IF NOT EXISTS items(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,parent_item_id TEXT,order_index REAL NOT NULL,organization_id TEXT NOT NULL,owner_id TEXT NOT NULL,version INTEGER NOT NULL CHECK(version>0),archived_at TEXT,data_json TEXT NOT NULL,PRIMARY KEY(workspace_id,id),CHECK(id!=parent_item_id),FOREIGN KEY(workspace_id,parent_item_id) REFERENCES items(workspace_id,id) DEFERRABLE INITIALLY DEFERRED);
    CREATE TABLE IF NOT EXISTS relations(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,source_item_id TEXT NOT NULL,target_item_id TEXT NOT NULL,type TEXT NOT NULL CHECK(type='TI'),active INTEGER NOT NULL CHECK(active IN(0,1)),data_json TEXT NOT NULL,PRIMARY KEY(workspace_id,id),CHECK(source_item_id!=target_item_id),FOREIGN KEY(workspace_id,source_item_id) REFERENCES items(workspace_id,id) DEFERRABLE INITIALLY DEFERRED,FOREIGN KEY(workspace_id,target_item_id) REFERENCES items(workspace_id,id) DEFERRABLE INITIALLY DEFERRED);
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_ti ON relations(workspace_id,source_item_id,target_item_id,type) WHERE active=1;
    CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),kind TEXT NOT NULL,aggregate_id TEXT,event_type TEXT NOT NULL,actor_id TEXT NOT NULL,organization_id TEXT,sector_id TEXT,effective_at TEXT NOT NULL,recorded_at TEXT NOT NULL,correlation_id TEXT NOT NULL,before_json TEXT,after_json TEXT,payload_json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS audit_workspace_date ON audit_events(workspace_id,recorded_at DESC,id);
    CREATE INDEX IF NOT EXISTS audit_workspace_actor ON audit_events(workspace_id,actor_id,recorded_at DESC);
    CREATE TABLE IF NOT EXISTS authorization_events(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),actor_id TEXT NOT NULL,operation TEXT NOT NULL,item_id TEXT,allowed INTEGER NOT NULL,rule_id TEXT,context_json TEXT NOT NULL,recorded_at TEXT NOT NULL,correlation_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS approval_decisions(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,item_id TEXT NOT NULL,round INTEGER NOT NULL,data_json TEXT NOT NULL,PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,item_id) REFERENCES items(workspace_id,id));
    CREATE TABLE IF NOT EXISTS approval_requests(workspace_id TEXT NOT NULL REFERENCES workspaces(id),id TEXT NOT NULL,item_id TEXT NOT NULL,round INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN('pending','approved','rejected','cancelled')),due_at TEXT,reviewer_id TEXT,PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,item_id,round),FOREIGN KEY(workspace_id,item_id) REFERENCES items(workspace_id,id));
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_approval ON approval_requests(workspace_id,item_id) WHERE status='pending';
    CREATE TABLE IF NOT EXISTS user_preferences(workspace_id TEXT NOT NULL REFERENCES workspaces(id),user_id TEXT NOT NULL REFERENCES auth_users(id),version INTEGER NOT NULL DEFAULT 1,data_json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id));
    CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),item_id TEXT NOT NULL,storage_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT,deleted_by TEXT,FOREIGN KEY(workspace_id,item_id) REFERENCES items(workspace_id,id));
  `);
  for (const table of [
    "audit_events",
    "authorization_events",
    "approval_decisions",
  ])
    storage.db.exec(
      `CREATE TRIGGER IF NOT EXISTS ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'append-only'); END; CREATE TRIGGER IF NOT EXISTS ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'append-only'); END;`,
    );
  storage.db
    .prepare(
      "INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES(?,?)",
    )
    .run("002_workspace_domain", stamp());
}

function empty() {
  return createDomain(null, "").state;
}

export function bootstrapWorkspace(
  storage,
  {
    workspaceId,
    organizationId,
    user,
    organizationName = "Minha empresa",
    sectorName = "Geral",
    workspaceName,
  },
) {
  initializeSchema(storage);
  if (
    storage.db
      .prepare("SELECT 1 FROM workspace_meta WHERE workspace_id=?")
      .get(workspaceId)
  )
    return;
  const workspace = storage.db
    .prepare("SELECT * FROM workspaces WHERE id=?")
    .get(workspaceId);
  assert(
    workspace,
    422,
    "WORKSPACE_REQUIRED",
    "Crie o workspace antes de inicializar o domínio.",
  );
  const state = empty(),
    now = stamp(),
    sectorId = user.sectorId || `${organizationId}_geral`;
  state.setupComplete = true;
  state.canonicalHierarchyVersion = 1;
  state.workspaceName = workspaceName || workspace.name;
  state.currentUserId = "";
  state.organizations = [
    {
      id: organizationId,
      name: organizationName,
      state: user.state || "PE",
      active: true,
    },
  ];
  state.sectors = [
    { id: sectorId, name: sectorName, organizationId, active: true },
  ];
  state.users = [
    {
      ...pick(user, ["id", "name", "email"]),
      organizationId,
      sectorId,
      state: user.state || "PE",
      profileId: "profile_admin",
      disabled: false,
      createdAt: now,
    },
  ];
  state.permissionProfiles = [
    { id: "profile_admin", name: "Administrador", version: 1 },
    { id: "profile_editor", name: "Editor", version: 1 },
    { id: "profile_reader", name: "Leitura", version: 1 },
  ];
  for (const operation of operations)
    state.permissionRules.push({
      id: id("gpo"),
      subjectType: "profile",
      subjectId: "profile_admin",
      operation,
      scopeType: "global",
      scopeId: "",
      effect: "allow",
      createdAt: now,
      createdBy: user.id,
    });
  for (const operation of operations.filter(
    (op) =>
      ![
        "manage_users",
        "manage_gpo",
        "manage_organization",
        "delete_item",
      ].includes(op),
  ))
    state.permissionRules.push({
      id: id("gpo"),
      subjectType: "profile",
      subjectId: "profile_editor",
      operation,
      scopeType: "organization",
      scopeId: "@user",
      effect: "allow",
      createdAt: now,
      createdBy: user.id,
    });
  state.permissionRules.push({
    id: id("gpo"),
    subjectType: "profile",
    subjectId: "profile_reader",
    operation: "view_item",
    scopeType: "organization",
    scopeId: "@user",
    effect: "allow",
    createdAt: now,
    createdBy: user.id,
  });
  storage.transaction(() => {
    storage.db
      .prepare(
        "INSERT INTO workspace_meta(workspace_id,revision,meta_json) VALUES(?,0,?)",
      )
      .run(workspaceId, "{}");
    persist(
      storage,
      workspaceId,
      state,
      null,
      {
        actorId: user.id,
        correlationId: randomUUID(),
        comment: "Workspace inicializado.",
      },
      0,
    );
  });
}

function load(storage, workspaceId) {
  const meta = storage.db
    .prepare("SELECT * FROM workspace_meta WHERE workspace_id=?")
    .get(workspaceId);
  assert(meta, 404, "WORKSPACE_NOT_FOUND", "Workspace não encontrado.");
  const state = { ...empty(), ...JSON.parse(meta.meta_json) };
  for (const key of recordKeys) state[key] = [];
  for (const row of storage.db
    .prepare(
      "SELECT kind,data_json FROM domain_records WHERE workspace_id=? ORDER BY position,id",
    )
    .all(workspaceId))
    state[row.kind]?.push(JSON.parse(row.data_json));
  state.items = storage.db
    .prepare(
      "SELECT data_json FROM items WHERE workspace_id=? ORDER BY order_index,id",
    )
    .all(workspaceId)
    .map((r) => JSON.parse(r.data_json));
  state.relations = [];
  state.archivedRelations = [];
  for (const row of storage.db
    .prepare(
      "SELECT active,data_json FROM relations WHERE workspace_id=? ORDER BY id",
    )
    .all(workspaceId))
    state[row.active ? "relations" : "archivedRelations"].push(
      JSON.parse(row.data_json),
    );
  // Operational history is paginated via /audit-events. A bounded recent window feeds legacy drawers.
  const history = storage.db
    .prepare(
      "SELECT kind,payload_json FROM audit_events WHERE workspace_id=? AND kind IN('domain','registry') ORDER BY recorded_at DESC,id DESC LIMIT 2000",
    )
    .all(workspaceId);
  state.events = history
    .filter((r) => r.kind === "domain")
    .map((r) => JSON.parse(r.payload_json));
  state.registryEvents = history
    .filter((r) => r.kind === "registry")
    .map((r) => JSON.parse(r.payload_json));
  state.approvalDecisions = storage.db
    .prepare(
      "SELECT data_json FROM approval_decisions WHERE workspace_id=? ORDER BY rowid",
    )
    .all(workspaceId)
    .map((r) => JSON.parse(r.data_json));
  state.approvalRequests = storage.db
    .prepare(
      "SELECT * FROM approval_requests WHERE workspace_id=? ORDER BY item_id,round",
    )
    .all(workspaceId)
    .map((r) => ({
      id: r.id,
      itemId: r.item_id,
      round: r.round,
      status: r.status,
      dueAt: r.due_at,
      reviewerId: r.reviewer_id,
    }));
  state.attachments = [];
  state.archivedAttachments = [];
  for (const row of storage.db
    .prepare(
      "SELECT * FROM attachments WHERE workspace_id=? ORDER BY created_at",
    )
    .all(workspaceId)) {
    const data = {
      id: row.id,
      itemId: row.item_id,
      name: row.name,
      type: row.mime,
      mime: row.mime,
      size: row.size,
      sha256: row.sha256,
      createdBy: row.created_by,
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      remote: true,
    };
    state[row.deleted_at ? "archivedAttachments" : "attachments"].push(data);
  }
  return { state, revision: meta.revision };
}

function audit(
  storage,
  workspaceId,
  {
    kind = "command",
    aggregateId = null,
    eventType,
    actorId,
    organizationId,
    sectorId,
    effectiveAt,
    correlationId,
    before,
    after,
    payload,
    eventId,
  },
) {
  const now = stamp();
  storage.db
    .prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(
      eventId || id("audit"),
      workspaceId,
      kind,
      aggregateId,
      eventType,
      actorId,
      organizationId || null,
      sectorId || null,
      effectiveAt || now,
      now,
      correlationId,
      JSON.stringify(before ?? null),
      JSON.stringify(after ?? null),
      JSON.stringify(payload || {}),
    );
}

function persist(storage, workspaceId, state, before, meta, nextRevision) {
  const db = storage.db,
    now = stamp(),
    user = state.users.find((u) => u.id === meta.actorId) || {};
  const prior = new Map((before?.items || []).map((i) => [i.id, i]));
  const itemInsert = db.prepare(
    "INSERT INTO items VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET parent_item_id=excluded.parent_item_id,order_index=excluded.order_index,organization_id=excluded.organization_id,owner_id=excluded.owner_id,version=excluded.version,archived_at=excluded.archived_at,data_json=excluded.data_json",
  );
  for (const item of state.items) {
    const old = prior.get(item.id);
    if (!old || !same(old, item)) {
      item.version = (old?.version || 0) + 1;
      item.updatedAt = now;
      item.workspaceId = workspaceId;
      audit(storage, workspaceId, {
        ...meta,
        eventType: old ? "item_updated" : "item_created",
        actorId: meta.actorId,
        organizationId: user.organizationId,
        sectorId: user.sectorId,
        aggregateId: item.id,
        before: old,
        after: item,
        payload: { comment: meta.comment || "" },
      });
    } else item.version = old.version;
    itemInsert.run(
      workspaceId,
      item.id,
      item.parentId || null,
      Number(item.sortOrder || 0),
      item.organizationId,
      item.ownerId,
      item.version,
      item.archivedAt || null,
      JSON.stringify(item),
    );
  }
  // Metadata, relations and records belong to the same transaction as items and their audit events.
  db.prepare("DELETE FROM relations WHERE workspace_id=?").run(workspaceId);
  const relationInsert = db.prepare(
    "INSERT INTO relations VALUES(?,?,?,?,?,?,?)",
  );
  for (const [active, relations] of [
    [1, state.relations],
    [0, state.archivedRelations || []],
  ])
    for (const r of relations) {
      if (
        !state.items.some((i) => i.id === r.sourceId) ||
        !state.items.some((i) => i.id === r.targetId)
      )
        continue;
      relationInsert.run(
        workspaceId,
        r.id,
        r.sourceId,
        r.targetId,
        "TI",
        active,
        JSON.stringify(r),
      );
    }
  db.prepare("DELETE FROM domain_records WHERE workspace_id=?").run(
    workspaceId,
  );
  const recordInsert = db.prepare(
    "INSERT INTO domain_records VALUES(?,?,?,?,?)",
  );
  for (const key of recordKeys)
    for (const [position, record] of (state[key] || []).entries())
      recordInsert.run(
        workspaceId,
        key,
        record.id,
        position,
        JSON.stringify(record),
      );
  for (const [kind, key] of [
    ["domain", "events"],
    ["registry", "registryEvents"],
  ]) {
    const existing = new Set((before?.[key] || []).map((e) => e.id));
    for (const event of state[key] || []) {
      if (
        existing.has(event.id) ||
        db.prepare("SELECT 1 FROM audit_events WHERE id=?").get(event.id)
      )
        continue;
      const enriched = {
        ...event,
        userId: meta.actorId,
        actorNameSnapshot: user.name,
        organizationId: event.organizationId || user.organizationId,
        sectorId: event.sectorId || user.sectorId,
        correlationId: meta.correlationId,
        recordedAt: now,
      };
      audit(storage, workspaceId, {
        ...meta,
        eventId: event.id,
        kind,
        aggregateId: event.itemId || event.entityId || event.id,
        eventType: event.eventType || "changed",
        actorId: meta.actorId,
        organizationId: enriched.organizationId,
        sectorId: enriched.sectorId,
        effectiveAt: event.effectiveAt || meta.effectiveAt,
        before: event.fromValue,
        after: event.toValue,
        payload: enriched,
      });
    }
  }
  const priorDecisions = new Set(
    (before?.approvalDecisions || []).map((e) => e.id),
  );
  for (const decision of state.approvalDecisions || []) {
    if (priorDecisions.has(decision.id)) continue;
    const item = state.items.find((i) => i.id === decision.itemId);
    assert(item, 422, "APPROVAL_ITEM", "Item da aprovação não existe.");
    decision.createdBy = meta.actorId;
    db.prepare("INSERT INTO approval_decisions VALUES(?,?,?,?,?)").run(
      workspaceId,
      decision.id,
      decision.itemId,
      decision.round || 1,
      JSON.stringify(decision),
    );
    const status = {
      under_review: "pending",
      approved: "approved",
      rejected: "rejected",
      cancelled: "cancelled",
    }[decision.outcome];
    if (status) {
      const requestId = `${decision.itemId}:round:${decision.round || 1}`;
      if (status === "pending")
        assert(
          !db
            .prepare(
              "SELECT 1 FROM approval_requests WHERE workspace_id=? AND item_id=? AND status='pending'",
            )
            .get(workspaceId, item.id),
          409,
          "APPROVAL_PENDING",
          "Já existe uma rodada pendente.",
        );
      db.prepare(
        "INSERT INTO approval_requests VALUES(?,?,?,?,?,?,?) ON CONFLICT(workspace_id,item_id,round) DO UPDATE SET status=excluded.status",
      ).run(
        workspaceId,
        requestId,
        item.id,
        decision.round || 1,
        status,
        item.dueAt || null,
        item.approvalReviewerId || item.ownerId,
      );
    }
    audit(storage, workspaceId, {
      ...meta,
      eventType: "approval_recorded",
      actorId: meta.actorId,
      aggregateId: item.id,
      organizationId: user.organizationId,
      sectorId: user.sectorId,
      after: decision,
      payload: decision,
    });
  }
  const rest = clone(state);
  for (const key of [
    ...recordKeys,
    "items",
    "relations",
    "archivedRelations",
    "events",
    "registryEvents",
    "approvalDecisions",
    "approvalRequests",
    "attachments",
    "archivedAttachments",
    ...preferenceKeys,
  ])
    delete rest[key];
  rest.currentUserId = "";
  db.prepare(
    "UPDATE workspace_meta SET meta_json=?,revision=? WHERE workspace_id=?",
  ).run(JSON.stringify(rest), nextRevision, workspaceId);
}

function reconcileBlockers(state, before, actorId) {
  state.blockers ||= [];
  const now = stamp(),
    parents = new Set(
      state.items.filter((i) => !i.archivedAt).map((i) => i.parentId),
    );
  const active = new Set();
  for (const item of state.items) {
    if (item.archivedAt) continue;
    if (
      item.status === "blocked" &&
      !item.blockedByPropagation &&
      !parents.has(item.id)
    ) {
      const key = `${item.id}|${item.id}`;
      active.add(key);
      if (
        !state.blockers.some(
          (b) => b.active && b.manual && b.sourceItemId === item.id,
        )
      )
        state.blockers.push({
          id: id("blocker"),
          sourceItemId: item.id,
          affectedItemId: item.id,
          reason: item.blockedReason,
          manual: true,
          active: true,
          createdBy: actorId,
          createdAt: now,
        });
    }
    for (const source of item.inheritedBlockedFrom || []) {
      const key = `${source}|${item.id}`;
      active.add(key);
      if (
        !state.blockers.some(
          (b) =>
            b.active &&
            b.sourceItemId === source &&
            b.affectedItemId === item.id,
        )
      )
        state.blockers.push({
          id: id("blocker"),
          sourceItemId: source,
          affectedItemId: item.id,
          reason:
            state.items.find((i) => i.id === source)?.blockedReason ||
            "Impedimento herdado",
          manual: false,
          active: true,
          createdBy: actorId,
          createdAt: now,
        });
    }
  }
  for (const blocker of state.blockers)
    if (
      blocker.active &&
      !active.has(`${blocker.sourceItemId}|${blocker.affectedItemId}`)
    ) {
      blocker.active = false;
      blocker.resolvedBy = actorId;
      blocker.resolvedAt = now;
    }
}

export function createService(
  storage,
  {
    attachmentMaxBytes = 10 * 1024 * 1024,
    attachmentQuotaBytes = 1024 * 1024 * 1024,
    logger = console,
  } = {},
) {
  initializeSchema(storage);
  const db = storage.db;
  const membership = (workspaceId, userId) => {
    const row = db
      .prepare(
        "SELECT w.* FROM workspaces w JOIN workspace_memberships m ON m.workspace_id=w.id JOIN auth_users u ON u.id=m.user_id WHERE w.id=? AND m.user_id=? AND m.active=1 AND u.disabled=0",
      )
      .get(workspaceId, userId);
    assert(
      row,
      404,
      "WORKSPACE_NOT_FOUND",
      "Workspace não encontrado ou acesso não autorizado.",
    );
    return row;
  };
  const recordDecisions = (workspaceId, userId, decisions, correlationId) => {
    const insert = db.prepare(
      "INSERT INTO authorization_events VALUES(?,?,?,?,?,?,?,?,?,?)",
    );
    for (const d of decisions.values())
      insert.run(
        id("authz"),
        workspaceId,
        userId,
        d.operation,
        d.itemId,
        Number(d.allowed),
        d.ruleId,
        JSON.stringify({ actor: d.actor, rule: d.rule, reason: d.reason }),
        stamp(),
        correlationId,
      );
  };
  const withDomain = (workspaceId, userId) => {
    membership(workspaceId, userId);
    const data = load(storage, workspaceId);
    const decisions = new Map();
    const domain = createDomain(data.state, userId, (r) =>
      decisions.set(`${r.operation}|${r.itemId}|${r.ruleId}|${r.allowed}`, r),
    );
    assert(
      domain.state.users.some((u) => u.id === userId && !u.disabled),
      403,
      "INACTIVE_MEMBER",
      "Usuário inativo neste workspace.",
    );
    return { ...data, domain, decisions };
  };
  const preferences = (workspaceId, userId) =>
    JSON.parse(
      db
        .prepare(
          "SELECT data_json FROM user_preferences WHERE workspace_id=? AND user_id=?",
        )
        .get(workspaceId, userId)?.data_json || "{}",
    );
  const filtered = (d, userId) => {
    const s = clone(d.state),
      user = s.users.find((u) => u.id === userId);
    const allowed = s.items.filter(
      (i) => evaluatePermission(s, user, "view_item", i).allowed,
    );
    const ids = new Set(allowed.map((i) => i.id));
    for (const item of s.items)
      d.functions.gpoDecision(user, "view_item", item);
    s.items = allowed;
    s.relations = s.relations.filter(
      (r) => ids.has(r.sourceId) && ids.has(r.targetId),
    );
    s.archivedRelations = s.archivedRelations.filter(
      (r) => ids.has(r.sourceId) && ids.has(r.targetId),
    );
    const admin = evaluatePermission(s, user, "manage_gpo").allowed;
    const visibleOrgs = new Set([
      user.organizationId,
      ...allowed.map((i) => i.organizationId),
    ]);
    for (const org of s.organizations)
      if (
        evaluatePermission(s, user, "manage_users", {
          organizationId: org.id,
          state: org.state,
        }).allowed ||
        evaluatePermission(s, user, "manage_organization", {
          organizationId: org.id,
          state: org.state,
        }).allowed
      )
        visibleOrgs.add(org.id);
    const orgAllowed = (o) =>
      admin || visibleOrgs.has(o.id || o.organizationId);
    s.organizations = s.organizations.filter(orgAllowed);
    s.sectors = s.sectors.filter(
      (r) => admin || visibleOrgs.has(r.organizationId),
    );
    s.users = s.users.filter((r) => admin || visibleOrgs.has(r.organizationId));
    for (const key of [
      "archivedItems",
      "events",
      "approvalDecisions",
      "approvalRequests",
      "attachments",
      "archivedAttachments",
    ])
      s[key] = (s[key] || []).filter((r) =>
        ids.has(key === "archivedItems" ? r.id : r.itemId),
      );
    s.blockers = (s.blockers || [])
      .filter((b) => ids.has(b.affectedItemId))
      .map((b) =>
        ids.has(b.sourceItemId)
          ? b
          : {
              ...b,
              sourceItemId: null,
              reason: "Dependência fora do seu escopo de acesso",
            },
      );
    for (const item of s.items) {
      if (item.parentId && !ids.has(item.parentId)) item.parentId = "";
      item.inheritedBlockedFrom = (item.inheritedBlockedFrom || []).filter(
        (source) => ids.has(source),
      );
      for (const key of ["correctionFor", "correctionItemId"])
        if (item[key] && !ids.has(item[key])) item[key] = null;
    }
    const redact = historyRedactor(d.state, user);
    s.events = s.events.map((event) => redact(event));
    s.approvalDecisions = s.approvalDecisions.map((event) => redact(event));
    s.templates = s.templates.filter(
      (t) => admin || visibleOrgs.has(t.organizationId),
    );
    s.registryEvents = s.registryEvents.filter(
      (r) =>
        admin ||
        evaluatePermission(s, user, "manage_organization", {
          organizationId: r.organizationId,
        }).allowed ||
        evaluatePermission(s, user, "manage_users", {
          organizationId: r.organizationId,
        }).allowed,
    );
    for (const key of [
      "archivedUsers",
      "archivedOrganizations",
      "archivedSectors",
    ])
      s[key] = (s[key] || []).filter(
        (r) =>
          admin ||
          visibleOrgs.has(
            key === "archivedOrganizations" ? r.id : r.organizationId,
          ),
      );
    if (!admin) {
      s.permissionRules = s.permissionRules.filter(
        (r) =>
          (r.subjectType === "user" && r.subjectId === userId) ||
          (r.subjectType === "profile" && r.subjectId === user.profileId),
      );
      s.permissionProfiles = s.permissionProfiles.filter(
        (p) => p.id === user.profileId,
      );
    }
    for (const key of ["typeSettings", "statusSettings"])
      s[key] = Object.fromEntries(
        Object.entries(s[key] || {}).filter(
          ([org]) => admin || visibleOrgs.has(org),
        ),
      );
    s.currentUserId = userId;
    s.setupComplete = true;
    Object.assign(s, preferences(d.state.workspaceId || "", userId));
    return s;
  };
  const projection = (
    workspaceId,
    userId,
    { query = {}, correlationId = randomUUID() } = {},
  ) => {
    const { domain, revision, decisions } = withDomain(workspaceId, userId);
    const state = filtered(domain, userId);
    Object.assign(state, preferences(workspaceId, userId));
    const previousFilters = domain.state.filters;
    domain.state.filters = { ...previousFilters, ...query };
    const safeItems = new Map(state.items.map((i) => [i.id, i]));
    let selected = domain
      .call("visibleItems")
      .filter((i) => safeItems.has(i.id))
      .map((i) => safeItems.get(i.id));
    if (query.project && query.project !== "all") {
      const roots = new Map(state.items.map((i) => [i.id, i]));
      selected = selected.filter((i) => {
        let c = i,
          seen = new Set();
        while (c.parentId && !seen.has(c.id)) {
          seen.add(c.id);
          c = roots.get(c.parentId) || c;
        }
        return c.id === query.project;
      });
    }
    const selectedIds = new Set(selected.map((i) => i.id));
    const relations = state.relations.filter(
      (r) => selectedIds.has(r.sourceId) && selectedIds.has(r.targetId),
    );
    const graph = {
      nodes: selected,
      relations: [
        ...relations,
        ...selected
          .filter((i) => i.parentId && selectedIds.has(i.parentId))
          .map((i) => ({
            id: `contains-${i.parentId}-${i.id}`,
            sourceId: i.parentId,
            targetId: i.id,
            relationType: "contains",
            derived: true,
          })),
      ],
    };
    let schedule;
    try {
      const analysis = domain.call(
        "scheduleAnalysis",
        state.items.filter((i) => !i.archivedAt),
      );
      schedule = {
        ...analysis,
        rows: analysis.rows?.map((r) => ({
          ...r,
          item: undefined,
          itemId: r.item.id,
          critical: analysis.reliable && r.critical,
          slack: analysis.reliable ? r.slack : null,
        })),
      };
    } catch {
      schedule = {
        valid: false,
        reliable: false,
        rows: [],
        message: "Cronograma incompleto.",
      };
    }
    recordDecisions(workspaceId, userId, decisions, correlationId);
    const workspace = db
      .prepare("SELECT id,name FROM workspaces WHERE id=?")
      .get(workspaceId);
    return {
      state,
      revision,
      workspace,
      limits: { attachmentMaxBytes, attachmentQuotaBytes },
      projection: {
        items: selected,
        relations,
        graph,
        counters: {
          total: selected.length,
          done: selected.filter((i) => i.status === "done").length,
          blocked: selected.filter(
            (i) => i.status === "blocked" || i.inheritedBlockedFrom?.length,
          ).length,
        },
      },
      schedule,
    };
  };
  async function mutate(
    workspaceId,
    userId,
    {
      expectedRevision,
      commands,
      desiredState,
      actions = [],
      comment = "",
      effectiveAt,
      fieldHints,
      beforeCommit,
      correlationId = randomUUID(),
    },
  ) {
    membership(workspaceId, userId);
    assert(
      Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
      428,
      "REVISION_REQUIRED",
      "Informe a revisão atual antes de salvar.",
    );
    // Hashing is deliberately outside SQLite's synchronous transaction; the revision is checked again at commit.
    const initial = withDomain(workspaceId, userId);
    let passwordHashes;
    try {
      passwordHashes = await prepareCredentialHashes({
        storage,
        workspaceId,
        userId,
        state: initial.domain.state,
        desiredState,
        expectedRevision,
        currentRevision: initial.revision,
        onDecision: (decision) =>
          initial.decisions.set(
            `${decision.operation}|${decision.itemId}|${decision.ruleId}|${decision.allowed}`,
            decision,
          ),
      });
    } catch (error) {
      recordDecisions(workspaceId, userId, initial.decisions, correlationId);
      throw error;
    }
    let decisions = new Map();
    try {
      storage.transaction(() => {
        beforeCommit?.();
        const snapshot = withDomain(workspaceId, userId);
        decisions = snapshot.decisions;
        const d = snapshot.domain;
        assert(
          snapshot.revision === expectedRevision,
          409,
          "REVISION_CONFLICT",
          "O workspace foi alterado por outro usuário. Recarregue antes de reaplicar suas alterações.",
          { currentRevision: snapshot.revision },
        );
        const before = clone(d.state),
          baseline = filtered(d, userId);
        let result;
        if (desiredState?.users) {
          const originalActor = before.users.find((u) => u.id === userId),
            canGovern = evaluatePermission(
              before,
              originalActor,
              "manage_gpo",
            ).allowed;
          for (const proposed of desiredState.users) {
            const target = before.users.find((u) => u.id === proposed.id);
            const assignsProfile =
              (!target && proposed.profileId) ||
              (target && target.profileId !== proposed.profileId);
            const privilegedTarget =
              target &&
              evaluatePermission(
                before,
                { ...target, disabled: false },
                "manage_gpo",
              ).allowed;
            const changesIdentity =
              target &&
              (!same(
                pick(target, ["name", "email", "disabled"]),
                pick(proposed, ["name", "email", "disabled"]),
              ) ||
                !!proposed.password);
            assert(
              canGovern ||
                !(assignsProfile || (privilegedTarget && changesIdentity)),
              403,
              "GPO_ADMIN_REQUIRED",
              "Somente quem administra GPO pode atribuir perfis ou alterar a identidade de um administrador.",
            );
          }
          for (const target of baseline.users)
            if (
              !desiredState.users.some((u) => u.id === target.id) &&
              evaluatePermission(
                before,
                { ...target, disabled: false },
                "manage_gpo",
              ).allowed
            )
              assert(
                canGovern,
                403,
                "GPO_ADMIN_REQUIRED",
                "Somente quem administra GPO pode inativar um administrador.",
              );
        }
        if (desiredState) {
          d.deferSchedule(
            (desiredState.items?.length || 0) - before.items.length > 20,
          );
          result = synchronize(d, baseline, desiredState, actions, {
            comment,
            effectiveAt,
            fieldHints,
          });
        } else {
          assert(
            Array.isArray(commands) &&
              commands.length > 0 &&
              commands.length <= 2000,
            422,
            "INVALID_COMMANDS",
            "Informe de 1 a 2.000 comandos.",
          );
          d.deferSchedule(
            commands.length > 20 &&
              commands.every((c) =>
                ["createItem", "createRelation"].includes(c.type),
              ),
          );
          result = {
            results: commands.map((c) =>
              executeCommand(d, c, { comment, effectiveAt }),
            ),
          };
        }
        d.deferSchedule(false);
        validateState(d.state);
        d.call("recalculateBlocking", effectiveAt || stamp());
        const schedule = d.call("recalculatePlannedDates");
        assert(schedule.valid, 422, "INVALID_SCHEDULE", schedule.message);
        reconcileBlockers(d.state, before, userId);
        validateState(d.state);
        // Keep at least one actual member able to administer GPO; UI role labels are never authority.
        assert(
          d.state.users.some(
            (u) =>
              !u.disabled &&
              evaluatePermission(d.state, u, "manage_gpo").allowed,
          ),
          422,
          "LAST_ADMIN",
          "Mantenha ao menos um administrador ativo com permissão de GPO.",
        );
        for (const user of d.state.users) {
          const old = before.users.find((u) => u.id === user.id);
          if (
            (!old && user.profileId) ||
            (old && old.profileId !== user.profileId)
          ) {
            const authBefore = createDomain(before, userId);
            authBefore.authorize("manage_gpo");
          }
          const existing = db
            .prepare("SELECT * FROM auth_users WHERE id=?")
            .get(user.id);
          if (!old)
            assert(
              !existing,
              409,
              "USER_EXISTS",
              "Este usuário já existe; vinculação entre workspaces exige administração do servidor.",
            );
          const duplicate = db
            .prepare(
              "SELECT id FROM auth_users WHERE lower(email)=lower(?) AND id!=?",
            )
            .get(user.email, user.id);
          assert(
            !duplicate,
            409,
            "EMAIL_EXISTS",
            "Este e-mail já está cadastrado.",
          );
          if (!existing) {
            const hash = passwordHashes.get(user.id);
            assert(
              hash,
              422,
              "PASSWORD_REQUIRED",
              "Defina uma senha para o novo usuário.",
            );
            db.prepare(
              "INSERT INTO auth_users(id,name,email,password_hash,disabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            ).run(
              user.id,
              user.name,
              user.email,
              hash,
              Number(!!user.disabled),
              stamp(),
              stamp(),
            );
            db.prepare(
              "INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES(?,?,?,?)",
            ).run(workspaceId, user.id, "member", 1);
          } else if (!same(old, user) || passwordHashes.has(user.id)) {
            if (
              !same(
                pick(old || {}, ["name", "email", "disabled"]),
                pick(user, ["name", "email", "disabled"]),
              ) ||
              passwordHashes.has(user.id)
            )
              assert(
                !db
                  .prepare(
                    "SELECT 1 FROM workspace_memberships WHERE user_id=? AND workspace_id!=? AND active=1",
                  )
                  .get(user.id, workspaceId),
                403,
                "SHARED_ACCOUNT",
                "A conta participa de outros workspaces. Alterações da identidade devem ser feitas pela própria pessoa ou pela administração do servidor.",
              );
            db.prepare(
              "UPDATE auth_users SET name=?,email=?,disabled=?,updated_at=? WHERE id=?",
            ).run(
              user.name,
              user.email,
              Number(!!user.disabled),
              stamp(),
              user.id,
            );
            if (passwordHashes.has(user.id))
              db.prepare(
                "UPDATE auth_users SET password_hash=? WHERE id=?",
              ).run(passwordHashes.get(user.id), user.id);
            if (user.disabled || passwordHashes.has(user.id))
              db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
          }
        }
        for (const targetId of passwordHashes.keys())
          if (before.users.some((user) => user.id === targetId))
            audit(storage, workspaceId, {
              eventType: "user_password_reset",
              aggregateId: targetId,
              actorId: userId,
              correlationId,
              organizationId: actorOrg(d),
              payload: { targetId },
            });
        persist(
          storage,
          workspaceId,
          d.state,
          before,
          { actorId: userId, correlationId, comment, effectiveAt },
          snapshot.revision + 1,
        );
        if (desiredState) {
          const desiredPrefs = pick(desiredState, preferenceKeys);
          if (Object.keys(desiredPrefs).length)
            savePreferences(workspaceId, userId, desiredPrefs, false);
        }
        audit(storage, workspaceId, {
          eventType: "command_committed",
          actorId: userId,
          correlationId,
          organizationId: actorOrg(d),
          payload: {
            commands: commands?.map((c) => c.type) || ["SynchronizeWorkspace"],
            comment,
            resultCount: result?.results?.length || 0,
          },
        });
      });
    } catch (error) {
      recordDecisions(workspaceId, userId, decisions, correlationId);
      if (error instanceof HttpError) throw error;
      if (/UNIQUE|CHECK|FOREIGN KEY|constraint/i.test(error.message))
        throw new HttpError(
          422,
          "INTEGRITY_CONSTRAINT",
          "A alteração viola uma regra de integridade e foi integralmente cancelada.",
        );
      throw error;
    }
    recordDecisions(workspaceId, userId, decisions, correlationId);
    logger.info?.(
      JSON.stringify({
        event: "command_committed",
        workspaceId,
        actorId: userId,
        correlationId,
      }),
    );
    return projection(workspaceId, userId, { correlationId });
  }
  function savePreferences(workspaceId, userId, input, verify = true) {
    if (verify) membership(workspaceId, userId);
    const value = pick(input, preferenceKeys);
    assert(
      JSON.stringify(value).length <= 1024 * 1024,
      413,
      "PREFERENCES_LIMIT",
      "Preferências excedem o limite de 1 MiB.",
    );
    if (value.riskThresholdDays !== undefined)
      assert(
        Number.isFinite(Number(value.riskThresholdDays)) &&
          Number(value.riskThresholdDays) >= 0 &&
          Number(value.riskThresholdDays) <= 365,
        422,
        "INVALID_RISK_THRESHOLD",
        "O limiar de risco deve estar entre 0 e 365 dias.",
      );
    const merged = { ...preferences(workspaceId, userId), ...value };
    db.prepare(
      "INSERT INTO user_preferences VALUES(?,?,1,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET version=version+1,data_json=excluded.data_json,updated_at=excluded.updated_at",
    ).run(workspaceId, userId, JSON.stringify(merged), stamp());
    return merged;
  }
  function queryAudit(workspaceId, userId, query = {}) {
    const { domain, decisions } = withDomain(workspaceId, userId);
    const accessible = new Set(
      domain.state.items
        .filter((i) =>
          domain.functions.gpoDecision(
            domain.state.users.find((u) => u.id === userId),
            "view_item",
            i,
          ),
        )
        .map((i) => i.id),
    );
    const admin = domain.functions.gpoDecision(
      domain.state.users.find((u) => u.id === userId),
      "manage_gpo",
    );
    const clauses = ["workspace_id=?"],
      params = [workspaceId];
    for (const [key, column] of [
      ["userId", "actor_id"],
      ["organizationId", "organization_id"],
      ["sectorId", "sector_id"],
      ["eventType", "event_type"],
      ["itemId", "aggregate_id"],
    ])
      if (query[key]) {
        clauses.push(`${column}=?`);
        params.push(query[key]);
      }
    if (query.since) {
      clauses.push("effective_at>=?");
      params.push(query.since);
    }
    if (query.until) {
      clauses.push("effective_at<=?");
      params.push(
        query.until.length === 10
          ? `${query.until}T23:59:59.999Z`
          : query.until,
      );
    }
    const offset = Number(query.offset ?? 0),
      limit = Number(query.limit ?? 50);
    assert(
      Number.isSafeInteger(offset) &&
        offset >= 0 &&
        Number.isSafeInteger(limit) &&
        limit >= 1 &&
        limit <= 200,
      422,
      "INVALID_PAGINATION",
      "Use offset inteiro não negativo e limit entre 1 e 200.",
    );
    if (!admin) {
      if (!accessible.size) {
        recordDecisions(workspaceId, userId, decisions, randomUUID());
        return { events: [], total: 0, offset, limit, nextOffset: null };
      }
      clauses.push(
        `aggregate_id IN (${[...accessible].map(() => "?").join(",")})`,
      );
      params.push(...accessible);
    }
    const where = clauses.join(" AND "),
      total = db
        .prepare(`SELECT COUNT(*) total FROM audit_events WHERE ${where}`)
        .get(...params).total;
    const rows = db
      .prepare(
        `SELECT * FROM audit_events WHERE ${where} ORDER BY recorded_at DESC,id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);
    const redact = historyRedactor(
      domain.state,
      domain.state.users.find((u) => u.id === userId),
    );
    recordDecisions(workspaceId, userId, decisions, randomUUID());
    return {
      events: rows.map((r) =>
        redact({
          id: r.id,
          eventType: r.event_type,
          itemId: r.aggregate_id,
          actorId: r.actor_id,
          organizationId: r.organization_id,
          sectorId: r.sector_id,
          effectiveAt: r.effective_at,
          recordedAt: r.recorded_at,
          correlationId: r.correlation_id,
          before: JSON.parse(r.before_json),
          after: JSON.parse(r.after_json),
          ...JSON.parse(r.payload_json),
        }),
      ),
      total,
      offset,
      limit,
      nextOffset: offset + limit < total ? offset + limit : null,
    };
  }
  return {
    projection,
    mutate,
    load: (workspaceId) => load(storage, workspaceId),
    membership,
    withDomain,
    preferences: (w, u) => {
      membership(w, u);
      return preferences(w, u);
    },
    savePreferences,
    queryAudit,
    recordDecisions,
    audit: (w, event) => audit(storage, w, event),
    limits: { attachmentMaxBytes, attachmentQuotaBytes },
  };
}
const actorOrg = (d) =>
  d.state.users.find((u) => u.id === d.state.currentUserId)?.organizationId;
