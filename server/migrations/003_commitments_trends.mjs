const MIGRATION_ID = "003_commitments_trends";
const LEGACY_CALENDAR_ID = "legacy-calendar-days";

const timestamp = () => new Date().toISOString();

function legacyAgreement(item) {
  const startAt = item.targetStartAt || item.replannedStartAt || null;
  const dueAt = item.replannedDueAt || item.targetDueAt || null;
  return startAt && dueAt ? { startAt, dueAt } : null;
}

function legacyBaseline(item) {
  const startAt = item.baselineStartAt || null;
  const dueAt = item.baselineDueAt || null;
  return startAt && dueAt ? { startAt, dueAt } : null;
}

function insertCommitment(db, workspaceId, itemId, kind, values, now) {
  if (!values) return;
  db.prepare(
    `INSERT OR IGNORE INTO commitments(
      id,workspace_id,item_id,kind,version,status,start_at,due_at,
      scope_note,proposed_by,accepted_at,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    `commitment:${workspaceId}:${itemId}:${kind}:1`,
    workspaceId,
    itemId,
    kind,
    1,
    "active",
    values.startAt,
    values.dueAt,
    null,
    "migration",
    now,
    now,
  );
}

function migrateWorkspace(db, workspaceId, now) {
  db.prepare(
    `INSERT OR IGNORE INTO project_calendars(
      id,workspace_id,kind,timezone,definition_json,created_at
    ) VALUES(?,?,?,?,?,?)`,
  ).run(
    LEGACY_CALENDAR_ID,
    workspaceId,
    "elapsed_days",
    "America/Sao_Paulo",
    JSON.stringify({ kind: "elapsed_days" }),
    now,
  );

  const rows = db
    .prepare(
      "SELECT id,data_json FROM items WHERE workspace_id=? AND archived_at IS NULL",
    )
    .all(workspaceId);
  const measurement = db.prepare(
    `INSERT OR IGNORE INTO measurements(
      id,workspace_id,item_id,percent,occurrence,effective_at,recorded_at,
      actor_id,description,evidence_json,correction_of_id,origin
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (const row of rows) {
    const item = JSON.parse(row.data_json);
    insertCommitment(
      db,
      workspaceId,
      row.id,
      "baseline",
      legacyBaseline(item),
      now,
    );
    insertCommitment(
      db,
      workspaceId,
      row.id,
      "agreement",
      legacyAgreement(item),
      now,
    );
    if (Number.isFinite(item.progressPercent) && item.progressPercent > 0)
      measurement.run(
        `measurement:${workspaceId}:${row.id}:migration`,
        workspaceId,
        row.id,
        item.progressPercent,
        "no_issue",
        now,
        now,
        "migration",
        null,
        "[]",
        null,
        "migration",
      );
  }
}

export function runCommitmentsTrendMigration(storage) {
  storage.transaction((db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_calendars(
        id TEXT NOT NULL,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        kind TEXT NOT NULL CHECK(kind IN('elapsed_days','working_time')),
        timezone TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(workspace_id,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commitments(
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        item_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN('baseline','agreement')),
        version INTEGER NOT NULL CHECK(version > 0),
        status TEXT NOT NULL CHECK(status IN('proposed','active','superseded')),
        start_at TEXT NOT NULL,
        due_at TEXT NOT NULL,
        scope_note TEXT,
        proposed_by TEXT NOT NULL,
        requester_id TEXT,
        owner_id TEXT,
        accepted_at TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(workspace_id,item_id,kind,version)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS commitments_item_version
        ON commitments(workspace_id,item_id,kind,version DESC);
      CREATE TABLE IF NOT EXISTS measurements(
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        item_id TEXT NOT NULL,
        percent REAL NOT NULL CHECK(percent >= 0 AND percent <= 100),
        occurrence TEXT NOT NULL,
        effective_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        description TEXT,
        evidence_json TEXT NOT NULL,
        correction_of_id TEXT,
        origin TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS measurements_item_effective
        ON measurements(workspace_id,item_id,effective_at,id);
      CREATE TABLE IF NOT EXISTS trend_snapshots(
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        item_id TEXT NOT NULL,
        caused_by_event_id TEXT NOT NULL,
        calculated_at TEXT NOT NULL,
        start_at TEXT,
        due_at TEXT,
        state TEXT NOT NULL,
        data_json TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS trend_snapshots_item_date
        ON trend_snapshots(workspace_id,item_id,calculated_at DESC);
      CREATE TABLE IF NOT EXISTS measurement_policies(
        workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        item_id TEXT,
        frequency TEXT NOT NULL CHECK(frequency IN('daily','weekly','milestone')),
        milestones_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY(workspace_id,item_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS commitment_acceptances(
        commitment_id TEXT NOT NULL REFERENCES commitments(id),
        actor_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN('requester','owner')),
        accepted_at TEXT NOT NULL,
        PRIMARY KEY(commitment_id,actor_id)
      ) STRICT;
    `);
    const measurementPolicyColumns = db.prepare("PRAGMA table_info(measurement_policies)").all().map((column) => column.name);
    if (!measurementPolicyColumns.includes("milestones_json"))
      db.exec("ALTER TABLE measurement_policies ADD COLUMN milestones_json TEXT NOT NULL DEFAULT '[]'");
    const hasLegacyMeasurementUniqueness = db
      .prepare("PRAGMA index_list(measurements)")
      .all()
      .some((index) => {
        if (!index.unique) return false;
        const columns = db
          .prepare(`PRAGMA index_info(${index.name})`)
          .all()
          .map((column) => column.name)
          .join(",");
        return columns === "workspace_id,item_id,origin";
      });
    if (hasLegacyMeasurementUniqueness) {
      db.exec(`
        CREATE TABLE measurements_rebuilt(
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id),
          item_id TEXT NOT NULL,
          percent REAL NOT NULL CHECK(percent >= 0 AND percent <= 100),
          occurrence TEXT NOT NULL,
          effective_at TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          actor_id TEXT NOT NULL,
          description TEXT,
          evidence_json TEXT NOT NULL,
          correction_of_id TEXT,
          origin TEXT NOT NULL
        ) STRICT;
        INSERT INTO measurements_rebuilt SELECT id,workspace_id,item_id,percent,occurrence,effective_at,recorded_at,actor_id,description,evidence_json,correction_of_id,origin FROM measurements;
        DROP TABLE measurements;
        ALTER TABLE measurements_rebuilt RENAME TO measurements;
        CREATE INDEX measurements_item_effective ON measurements(workspace_id,item_id,effective_at,id);
      `);
    }
    const commitmentColumns = new Set(
      db.prepare("PRAGMA table_info(commitments)").all().map((column) => column.name),
    );
    if (!commitmentColumns.has("requester_id"))
      db.exec("ALTER TABLE commitments ADD COLUMN requester_id TEXT");
    if (!commitmentColumns.has("owner_id"))
      db.exec("ALTER TABLE commitments ADD COLUMN owner_id TEXT");
    const now = timestamp();
    for (const workspace of db.prepare("SELECT id FROM workspaces").all())
      migrateWorkspace(db, workspace.id, now);
    db.prepare(
      "INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES(?,?)",
    ).run(MIGRATION_ID, now);
  });
}
