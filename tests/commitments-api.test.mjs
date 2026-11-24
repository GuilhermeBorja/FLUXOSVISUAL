import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStorage } from "../server/storage.mjs";
import { bootstrapWorkspace, initializeSchema } from "../server/service.mjs";
import { operations } from "../server/domain.mjs";
import { runCommitmentsTrendMigration } from "../server/migrations/003_commitments_trends.mjs";
import { ADMIN, addWorkspaceUser, createItem, fixture } from "./backend-support.mjs";

async function legacyWorkspace(t) {
  const dataDir = await mkdtemp(join(tmpdir(), "fluxos-commitments-"));
  const storage = createStorage({ dataDir });
  t.after(async () => {
    storage.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  initializeSchema(storage);
  const now = "2026-11-16T12:00:00.000Z";
  storage.db
    .prepare(
      "INSERT INTO workspaces(id,name,organization_id,created_at) VALUES(?,?,?,?)",
    )
    .run("w_legacy", "Obra legada", "org_a", now);
  storage.db
    .prepare(
      "INSERT INTO workspace_meta(workspace_id,revision,meta_json) VALUES(?,?,?)",
    )
    .run("w_legacy", 7, "{}");
  storage.db
    .prepare(
      "INSERT INTO items(workspace_id,id,parent_item_id,order_index,organization_id,owner_id,version,archived_at,data_json) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "w_legacy",
      "activity_elevator",
      null,
      1,
      "org_a",
      "u_planning",
      1,
      null,
      JSON.stringify({
        id: "activity_elevator",
        type: "task",
        title: "Regularização do poço",
        organizationId: "org_a",
        ownerId: "u_planning",
        plannedStartAt: "2026-11-01",
        dueAt: "2026-12-01",
        baselineStartAt: "2026-11-01",
        baselineDueAt: "2026-12-01",
        targetStartAt: "2026-11-03",
        targetDueAt: "2026-12-03",
        replannedDueAt: "2026-12-05",
        plannedDurationDays: 30,
        progressPercent: 25,
      }),
    );
  return storage;
}

test("migration creates legacy calendar, immutable baseline, active agreement and initial measurement once", async (t) => {
  const storage = await legacyWorkspace(t);

  runCommitmentsTrendMigration(storage);
  const first = {
    calendars: storage.db
      .prepare(
        "SELECT id,kind,workspace_id FROM project_calendars WHERE workspace_id=?",
      )
      .all("w_legacy")
      .map((row) => ({ ...row })),
    commitments: storage.db
      .prepare(
        "SELECT item_id,kind,version,status,start_at,due_at FROM commitments WHERE workspace_id=? ORDER BY kind,version",
      )
      .all("w_legacy")
      .map((row) => ({ ...row })),
    measurements: storage.db
      .prepare(
        "SELECT item_id,percent,origin FROM measurements WHERE workspace_id=?",
      )
      .all("w_legacy")
      .map((row) => ({ ...row })),
  };

  assert.deepEqual(first.calendars, [
    {
      id: "legacy-calendar-days",
      kind: "elapsed_days",
      workspace_id: "w_legacy",
    },
  ]);
  assert.deepEqual(first.commitments, [
    {
      item_id: "activity_elevator",
      kind: "agreement",
      version: 1,
      status: "active",
      start_at: "2026-11-03",
      due_at: "2026-12-05",
    },
    {
      item_id: "activity_elevator",
      kind: "baseline",
      version: 1,
      status: "active",
      start_at: "2026-11-01",
      due_at: "2026-12-01",
    },
  ]);
  assert.deepEqual(first.measurements, [
    {
      item_id: "activity_elevator",
      percent: 25,
      origin: "migration",
    },
  ]);

  runCommitmentsTrendMigration(storage);
  assert.equal(
    storage.db
      .prepare("SELECT COUNT(*) AS total FROM commitments WHERE workspace_id=?")
      .get("w_legacy").total,
    2,
  );
  assert.equal(
    storage.db
      .prepare("SELECT COUNT(*) AS total FROM measurements WHERE workspace_id=?")
      .get("w_legacy").total,
    1,
  );
});

test("service initialization provisions commitment schema and GPO operations", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "fluxos-commitments-schema-"));
  const storage = createStorage({ dataDir });
  t.after(async () => {
    storage.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  initializeSchema(storage);

  assert.ok(
    storage.db
      .prepare("SELECT 1 FROM schema_migrations WHERE id=?")
      .get("003_commitments_trends"),
  );
  assert.ok(
    storage.db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='commitments'",
      )
      .get(),
  );
  assert.deepEqual(
    [
      "record_measurement",
      "adjust_remaining_duration",
      "manage_commitment",
      "manage_calendar",
    ].every((operation) => operations.includes(operation)),
    true,
  );
});

test("planning can configure the project calendar and scheduler processes all workspaces", async (t) => {
  const { app, admin } = await fixture(t, { secondWorkspace: true });
  const calendar = await admin.command("manageCalendar", [{
    id: "obra-2026",
    kind: "working_time",
    timezone: "America/Sao_Paulo",
    workingWeekdays: [1, 2, 3, 4, 5, 6],
    holidays: ["2026-12-25"],
  }]);
  assert.ok(calendar.state, "command returns a fresh projection");
  assert.deepEqual(
    { ...app.storage.db.prepare("SELECT kind,timezone,definition_json FROM project_calendars WHERE workspace_id=? AND id=?").get("w_a", "obra-2026") },
    {
      kind: "working_time",
      timezone: "America/Sao_Paulo",
      definition_json: JSON.stringify({ kind: "working_time", workingWeekdays: [1, 2, 3, 4, 5, 6], holidays: ["2026-12-25"] }),
    },
  );
  const processed = app.service.processAllMeasurementDue({ asOf: "2026-11-16T12:00:00.000Z" });
  assert.deepEqual(processed.workspaces.map((row) => row.workspaceId), ["w_a", "w_b"]);
});

test("server scheduler runs measurement processing without a projection request", async (t) => {
  const { app, admin } = await fixture(t, { appOptions: { measurementSchedulerIntervalMs: 20 } });
  const item = await createItem(admin, "Scheduler", { id: "scheduler_item", plannedStartAt: "2026-01-01", plannedDurationDays: 2 });
  await admin.command("recordMeasurement", [item.id, { percent: 10, occurrence: "no_issue", effectiveAt: "2026-01-01T08:00:00.000Z" }]);
  await admin.command("setMeasurementPolicy", [item.id, "daily"]);
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.ok(app.storage.db.prepare("SELECT COUNT(*) AS total FROM trend_snapshots WHERE workspace_id=? AND item_id=?").get("w_a", item.id).total >= 2);
});

test("workspace bootstrap includes configurable planning, execution, approval and consultation profiles", async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), "fluxos-commitments-profiles-"));
  const storage = createStorage({ dataDir });
  t.after(async () => {
    storage.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  initializeSchema(storage);
  storage.db
    .prepare(
      "INSERT INTO workspaces(id,name,organization_id,created_at) VALUES(?,?,?,?)",
    )
    .run("w_profiles", "Perfis", "org_a", "2026-11-16T12:00:00.000Z");

  bootstrapWorkspace(storage, {
    workspaceId: "w_profiles",
    organizationId: "org_a",
    user: {
      id: "u_admin",
      name: "Administrador",
      email: "admin@example.test",
      sectorId: "org_a_geral",
      state: "PE",
    },
  });

  const profiles = storage.db
    .prepare(
      "SELECT data_json FROM domain_records WHERE workspace_id=? AND kind='permissionProfiles' ORDER BY position",
    )
    .all("w_profiles")
    .map((row) => JSON.parse(row.data_json).name);
  assert.deepEqual(
    profiles.slice(-4),
    ["Planejamento", "Execução", "Aprovador", "Consulta"],
  );
});

test("projection exposes additive trend data without replacing the PRD6 schedule", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Regularização", {
    id: "regularize",
    plannedDurationDays: 10,
  });
  app.storage.db
    .prepare(
      "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "agreement_regularize_1",
      "w_a",
      item.id,
      "agreement",
      1,
      "active",
      "2026-11-01",
      "2026-11-10",
      null,
      ADMIN.id,
      "2026-11-01T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
    );
  app.storage.db
    .prepare(
      "INSERT INTO measurements(id,workspace_id,item_id,percent,occurrence,effective_at,recorded_at,actor_id,description,evidence_json,correction_of_id,origin) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "measurement_regularize_1",
      "w_a",
      item.id,
      25,
      "no_issue",
      "2026-11-02T12:00:00.000Z",
      "2026-11-02T12:00:00.000Z",
      ADMIN.id,
      null,
      "[]",
      null,
      "manual",
    );

  const result = await admin.projection();

  assert.equal(result.schedule.valid, true);
  assert.equal(result.trend.itemTrendById[item.id].derivedState, "in_progress");
  assert.equal(result.trend.itemTrendById[item.id].actualStartAt, "2026-11-02");
});

test("recordMeasurement persists an immutable fact without overwriting legacy progress", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Medição do poço", {
    id: "measure_shaft",
    plannedDurationDays: 10,
    progressPercent: 0,
  });

  await admin.command("recordMeasurement", [
    item.id,
    {
      percent: 25,
      occurrence: "no_issue",
      effectiveAt: "2026-11-02T12:00:00.000Z",
    },
  ]);

  const measurement = app.storage.db
    .prepare(
      "SELECT percent,occurrence,effective_at,actor_id,origin FROM measurements WHERE workspace_id=? AND item_id=?",
    )
    .get("w_a", item.id);
  assert.deepEqual({ ...measurement }, {
    percent: 25,
    occurrence: "no_issue",
    effective_at: "2026-11-02T12:00:00.000Z",
    actor_id: ADMIN.id,
    origin: "manual",
  });
  assert.equal((await admin.projection()).state.items.find((row) => row.id === item.id).progressPercent, 0);
});

test("projection confirms the last measurement recorded in the same effective minute", async (t) => {
  const { admin } = await fixture(t);
  const item = await createItem(admin, "Medição no mesmo minuto", {
    id: "same_minute_api",
    plannedDurationDays: 2,
  });
  const effectiveAt = "2026-11-17T16:47:00.000Z";

  await admin.command("recordMeasurement", [item.id, {
    percent: 10,
    occurrence: "divergence",
    description: "Mobilização atrasada.",
    effectiveAt,
  }]);
  const second = await admin.command("recordMeasurement", [item.id, {
    percent: 50,
    occurrence: "no_issue",
    description: "Frente mobilizada e reparo iniciado.",
    effectiveAt,
  }]);

  assert.equal(second.trend.itemTrendById[item.id].lastMeasurementPercent, 50);
  assert.deepEqual(second.trend.itemTrendById[item.id].lastMeasurement, {
    id: second.trend.itemTrendById[item.id].lastMeasurement.id,
    percent: 50,
    occurrence: "no_issue",
    description: "Frente mobilizada e reparo iniciado.",
    effectiveAt,
    recordedAt: second.trend.itemTrendById[item.id].lastMeasurement.recordedAt,
  });
  assert.match(second.trend.itemTrendById[item.id].lastMeasurement.recordedAt, /^2026-/);
});

test("correctMeasurement preserves the original fact and references it explicitly", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Medição corrigida", { id: "correct_shaft" });
  await admin.command("recordMeasurement", [item.id, {
    percent: 60,
    occurrence: "no_issue",
    effectiveAt: "2026-11-02T08:00:00.000Z",
  }]);
  const originalId = app.storage.db
    .prepare("SELECT id FROM measurements WHERE workspace_id=? AND item_id=?")
    .get("w_a", item.id).id;

  await admin.command("correctMeasurement", [originalId, {
    percent: 55,
    description: "Leitura anterior incluiu frente ainda não executada.",
    effectiveAt: "2026-11-02T09:00:00.000Z",
  }]);

  assert.deepEqual(
    app.storage.db.prepare("SELECT percent,occurrence,correction_of_id FROM measurements WHERE workspace_id=? AND item_id=? ORDER BY effective_at").all("w_a", item.id).map((row) => ({ ...row })),
    [
      { percent: 60, occurrence: "no_issue", correction_of_id: null },
      { percent: 55, occurrence: "correction", correction_of_id: originalId },
    ],
  );
});

test("adjustRemainingDuration changes the planning forecast without rewriting measurements", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Regularização planejada", {
    id: "planned_shaft",
    plannedDurationDays: 10,
  });
  await admin.command("recordMeasurement", [
    item.id,
    {
      percent: 25,
      occurrence: "no_issue",
      effectiveAt: "2026-11-02T12:00:00.000Z",
    },
  ]);

  await admin.command("adjustRemainingDuration", [item.id, 4]);

  const saved = (await admin.projection()).state.items.find(
    (row) => row.id === item.id,
  );
  assert.equal(saved.remainingDurationDays, 4);
  assert.equal(
    app.storage.db
      .prepare("SELECT COUNT(*) AS total FROM measurements WHERE item_id=?")
      .get(item.id).total,
    1,
  );
});

test("setActivityBlocked requires a factual description and records the block timestamp", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Montagem bloqueada", {
    id: "blocked_mount",
    plannedDurationDays: 10,
  });
  await assert.rejects(
    admin.command("setActivityBlocked", [item.id, { at: "2026-11-04T08:00:00.000Z" }]),
  );

  await admin.command("setActivityBlocked", [
    item.id,
    {
      at: "2026-11-04T08:00:00.000Z",
      description: "Poço ainda não liberado para montagem.",
    },
  ]);

  const saved = (await admin.projection()).state.items.find(
    (row) => row.id === item.id,
  );
  assert.equal(saved.blockedAt, "2026-11-04T08:00:00.000Z");
  assert.equal(saved.blockedReason, "Poço ainda não liberado para montagem.");
});

test("overdue measurement policy records one causal pending snapshot without changing factual progress", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Liberação do poço", {
    id: "release_shaft",
    plannedDurationDays: 2,
  });
  await admin.command("recordMeasurement", [item.id, {
    percent: 20,
    occurrence: "no_issue",
    effectiveAt: "2026-11-01T08:00:00.000Z",
  }]);
  app.storage.db.prepare(
    "INSERT INTO measurement_policies(workspace_id,item_id,frequency) VALUES(?,?,?)",
  ).run("w_a", item.id, "daily");

  const first = app.service.processMeasurementDue("w_a", {
    asOf: "2026-11-03T08:00:00.000Z",
  });
  const second = app.service.processMeasurementDue("w_a", {
    asOf: "2026-11-03T08:00:00.000Z",
  });

  assert.deepEqual(first.pendingItemIds, [item.id]);
  assert.deepEqual(second.pendingItemIds, []);
  assert.ok(
    app.storage.db.prepare("SELECT COUNT(*) AS total FROM trend_snapshots WHERE workspace_id=? AND item_id=?").get("w_a", item.id).total >= 2,
  );
  assert.equal(
    app.storage.db.prepare("SELECT percent FROM measurements WHERE workspace_id=? AND item_id=? ORDER BY effective_at DESC").get("w_a", item.id).percent,
    20,
  );
  assert.ok(
    app.storage.db.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE workspace_id=? AND event_type='measurement_pending'").get("w_a").total >= 1,
  );
  assert.ok(
    app.storage.db.prepare("SELECT COUNT(*) AS total FROM trend_snapshots WHERE workspace_id=? AND item_id=? AND caused_by_event_id LIKE 'trend:%'").get("w_a", item.id).total >= 1,
  );
});

test("planning configures a daily measurement policy by command", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Acompanhamento diário", { id: "daily_shaft" });
  await admin.command("setMeasurementPolicy", [item.id, "daily"]);
  assert.deepEqual(
    { ...app.storage.db.prepare("SELECT item_id,frequency,milestones_json FROM measurement_policies WHERE workspace_id=? AND item_id=?").get("w_a", item.id) },
    { item_id: item.id, frequency: "daily", milestones_json: "[]" },
  );
});

test("planning can configure physical milestones for expected progress", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Marcos fÃ­sicos", { id: "milestone_shaft", plannedStartAt: "2026-11-01", plannedDurationDays: 10 });
  await admin.command("setMeasurementPolicy", [item.id, { frequency: "milestone", milestones: [{ offsetDays: 0, percent: 10 }, { offsetDays: 4, percent: 60 }, { offsetDays: 9, percent: 100 }] }]);
  const policy = app.storage.db.prepare("SELECT frequency,milestones_json FROM measurement_policies WHERE workspace_id=? AND item_id=?").get("w_a", item.id);
  assert.equal(policy.frequency, "milestone");
  assert.deepEqual(JSON.parse(policy.milestones_json), [{ offsetDays: 0, percent: 10 }, { offsetDays: 4, percent: 60 }, { offsetDays: 9, percent: 100 }]);
});

test("projection processes overdue measurements and exposes commitment records", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Entrega diária", { id: "projection_shaft" });
  await admin.command("recordMeasurement", [item.id, {
    percent: 30,
    occurrence: "no_issue",
    effectiveAt: "2026-01-01T08:00:00.000Z",
  }]);
  await admin.command("setMeasurementPolicy", [item.id, "daily"]);
  app.storage.db.prepare(
    "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("projection_agreement", "w_a", item.id, "agreement", 1, "active", "2026-01-01", "2026-01-02", null, ADMIN.id, ADMIN.id, ADMIN.id, "2026-01-01T08:00:00.000Z", "2026-01-01T08:00:00.000Z");

  const projection = await admin.projection();

  assert.equal(projection.trend.itemTrendById[item.id].derivedState, "measurement_pending");
  assert.equal(projection.commitments.find((row) => row.id === "projection_agreement").status, "active");
  assert.ok(projection.horizon.availableNow.some((row) => row.itemId === item.id));
  assert.ok(app.storage.db.prepare("SELECT COUNT(*) AS total FROM trend_snapshots WHERE workspace_id=? AND item_id=?").get("w_a", item.id).total >= 1);
});

test("planning proposal replaces the active agreement after an independent approver accepts", async (t) => {
  const context = await fixture(t);
  const { admin, app } = context;
  const owner = await addWorkspaceUser(context, {
    id: "u_owner",
    email: "owner@example.test",
    operations: ["view_item", "record_measurement"],
  });
  const approver = await addWorkspaceUser(context, {
    id: "u_approver",
    email: "approver@example.test",
    operations: ["view_item", "manage_commitment"],
  });
  const item = await createItem(admin, "Montagem do elevador", {
    id: "install_elevator",
    ownerId: owner.user.id,
  });
  app.storage.db.prepare(
    "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("agreement_1", "w_a", item.id, "agreement", 1, "active", "2026-11-01", "2026-11-10", null, ADMIN.id, ADMIN.id, owner.user.id, "2026-11-01T08:00:00.000Z", "2026-11-01T08:00:00.000Z");

  await assert.rejects(admin.command("proposeCommitment", [item.id, {
    startAt: "2026-11-02", dueAt: "2026-11-12", scopeChange: true, requesterId: ADMIN.id,
  }]));

  await admin.command("proposeCommitment", [item.id, {
    startAt: "2026-11-02",
    dueAt: "2026-11-12",
    scopeNote: "Mobilização confirmada após a liberação do poço.",
    requesterId: ADMIN.id,
  }]);
  const commitmentId = app.storage.db
    .prepare("SELECT id FROM commitments WHERE workspace_id=? AND item_id=? AND status='proposed'")
    .get("w_a", item.id).id;
  await assert.rejects(admin.command("acceptCommitment", [commitmentId]));
  await assert.rejects(owner.client.command("acceptCommitment", [commitmentId]));
  await approver.client.command("acceptCommitment", [commitmentId]);

  assert.deepEqual(
    app.storage.db.prepare("SELECT status,start_at,due_at FROM commitments WHERE id IN('agreement_1',?) ORDER BY version").all(commitmentId).map((row) => ({ ...row })),
    [
      { status: "superseded", start_at: "2026-11-01", due_at: "2026-11-10" },
      { status: "active", start_at: "2026-11-02", due_at: "2026-11-12" },
    ],
  );
});

test("an item cannot have more than one pending commitment proposal", async (t) => {
  const { admin, app } = await fixture(t);
  const item = await createItem(admin, "Uma proposta por atividade", { id: "single_pending_proposal" });
  const proposal = { startAt: "2026-11-03", dueAt: "2026-11-08" };
  await admin.command("proposeCommitment", [item.id, proposal]);

  const conflict = await admin.command("proposeCommitment", [item.id, { ...proposal, dueAt: "2026-11-10" }], { expected: 409 });
  assert.equal(conflict.error.code, "COMMITMENT_PROPOSAL_PENDING");
  assert.equal(
    app.storage.db.prepare("SELECT COUNT(*) AS total FROM commitments WHERE workspace_id='w_a' AND item_id=? AND kind='agreement' AND status='proposed'").get(item.id).total,
    1,
  );
});

test("the latest legacy proposal is actionable and accepting it retires older pending versions", async (t) => {
  const context = await fixture(t);
  const { admin, app } = context;
  const approver = await addWorkspaceUser(context, {
    id: "u_legacy_approver",
    email: "legacy-approver@example.test",
    operations: ["view_item", "manage_commitment"],
  });
  const item = await createItem(admin, "Propostas antigas", { id: "legacy_pending_proposals" });
  for (const [version, startAt, dueAt] of [
    [1, "2026-11-03", "2026-11-08"],
    [2, "2026-11-03", "2026-11-09"],
    [3, "2026-11-04", "2026-11-10"],
  ]) {
    app.storage.db.prepare(
      "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(`legacy_proposal_${version}`, "w_a", item.id, "agreement", version, "proposed", startAt, dueAt, null, ADMIN.id, ADMIN.id, item.ownerId, null, `2026-11-1${version}T08:00:00.000Z`);
  }

  const projection = await approver.client.projection();
  assert.deepEqual(projection.actions.filter(action => action.itemId === item.id).map(action => action.commitmentId), ["legacy_proposal_3"]);
  const staleAcceptance = await approver.client.command("acceptCommitment", ["legacy_proposal_1"], { expected: 409 });
  assert.equal(staleAcceptance.error.code, "COMMITMENT_PROPOSAL_SUPERSEDED");
  await approver.client.command("acceptCommitment", ["legacy_proposal_3"]);

  assert.deepEqual(
    app.storage.db.prepare("SELECT id,status FROM commitments WHERE workspace_id='w_a' AND item_id=? AND kind='agreement' ORDER BY version").all(item.id).map(row => ({ ...row })),
    [
      { id: "legacy_proposal_1", status: "superseded" },
      { id: "legacy_proposal_2", status: "superseded" },
      { id: "legacy_proposal_3", status: "active" },
    ],
  );
  assert.equal((await approver.client.projection()).actions.some(action => action.itemId === item.id), false);
});

test("projection lists a pending commitment only for an independent approver", async (t) => {
  const context = await fixture(t);
  const { admin, app } = context;
  const owner = await addWorkspaceUser(context, { id: "u_action_owner", email: "action-owner@example.test", operations: ["view_item", "record_measurement"] });
  const approver = await addWorkspaceUser(context, { id: "u_action_approver", email: "action-approver@example.test", operations: ["view_item", "manage_commitment"] });
  const item = await createItem(admin, "Ação pendente", { id: "action_shaft", ownerId: owner.user.id });
  app.storage.db.prepare(
    "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("action_agreement", "w_a", item.id, "agreement", 1, "proposed", "2026-11-01", "2026-11-03", null, ADMIN.id, ADMIN.id, owner.user.id, null, "2026-11-01T08:00:00.000Z");
  assert.deepEqual((await admin.projection()).actions, []);
  assert.deepEqual((await owner.client.projection()).actions, []);
  assert.deepEqual((await approver.client.projection()).actions.map((action) => ({ type: action.type, commitmentId: action.commitmentId })), [{ type: "accept_commitment", commitmentId: "action_agreement" }]);
});

test("the authorized activity owner can accept their own proposal and the acceptance is recorded", async (t) => {
  const context = await fixture(t);
  const { admin, app } = context;
  const owner = await addWorkspaceUser(context, {
    id: "u_commitment_owner_self",
    email: "commitment-owner-self@example.test",
    operations: ["view_item", "manage_commitment"],
  });
  const item = await createItem(admin, "Compromisso próprio", { id: "owner_self_commitment", ownerId: owner.user.id });
  app.storage.db.prepare(
    "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("owner_self_agreement", "w_a", item.id, "agreement", 1, "proposed", "2026-11-20", "2026-11-22", null, owner.user.id, ADMIN.id, owner.user.id, null, "2026-11-19T08:00:00.000Z");

  const actions = (await owner.client.projection()).actions;
  assert.deepEqual(actions.map(({ type, commitmentId, role }) => ({ type, commitmentId, role })), [
    { type: "accept_commitment", commitmentId: "owner_self_agreement", role: "owner" },
  ]);

  await owner.client.command("acceptCommitment", ["owner_self_agreement"]);

  assert.equal(app.storage.db.prepare("SELECT status FROM commitments WHERE id=?").get("owner_self_agreement").status, "active");
  assert.equal(
    app.storage.db.prepare("SELECT role FROM commitment_acceptances WHERE commitment_id=? AND actor_id=?").get("owner_self_agreement", owner.user.id).role,
    "owner",
  );
  assert.deepEqual(
    JSON.parse(app.storage.db.prepare("SELECT payload_json FROM audit_events WHERE workspace_id=? AND event_type='commitment_activated' ORDER BY recorded_at DESC LIMIT 1").get("w_a").payload_json),
    { commitmentId: "owner_self_agreement", role: "owner", status: "active" },
  );
});

test("a proposer who is not the activity owner cannot accept their proposal", async (t) => {
  const context = await fixture(t);
  const { admin, app } = context;
  const owner = await addWorkspaceUser(context, {
    id: "u_commitment_nonproposer_owner",
    email: "commitment-nonproposer-owner@example.test",
    operations: ["view_item", "manage_commitment"],
  });
  const item = await createItem(admin, "Proposta de terceiro", { id: "nonowner_proposal", ownerId: owner.user.id });
  app.storage.db.prepare(
    "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("nonowner_proposal_agreement", "w_a", item.id, "agreement", 1, "proposed", "2026-11-20", "2026-11-22", null, ADMIN.id, ADMIN.id, owner.user.id, null, "2026-11-19T08:00:00.000Z");

  assert.deepEqual((await admin.projection()).actions.map((action) => action.commitmentId), []);
  await assert.rejects(admin.command("acceptCommitment", ["nonowner_proposal_agreement"]));
  assert.deepEqual((await owner.client.projection()).actions.map((action) => action.commitmentId), ["nonowner_proposal_agreement"]);
});

test("changing an activity owner closes the active commitment and records both owners in history", async (t) => {
  const context = await fixture(t);
  const { admin, app } = context;
  const previousOwner = await addWorkspaceUser(context, {
    id: "u_previous_owner",
    email: "previous-owner@example.test",
    operations: ["view_item", "manage_commitment"],
  });
  const nextOwner = await addWorkspaceUser(context, {
    id: "u_next_owner",
    email: "next-owner@example.test",
    operations: ["view_item", "manage_commitment"],
  });
  const item = await createItem(admin, "Transferir compromisso", {
    id: "owner_change_commitment",
    ownerId: previousOwner.user.id,
  });
  app.storage.db.prepare(
    "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("owner_change_agreement", "w_a", item.id, "agreement", 1, "active", "2026-11-20", "2026-11-22", null, ADMIN.id, ADMIN.id, previousOwner.user.id, "2026-11-19T08:00:00.000Z", "2026-11-19T08:00:00.000Z");
  app.storage.db.prepare(
    "INSERT INTO commitments(id,workspace_id,item_id,kind,version,status,start_at,due_at,scope_note,proposed_by,requester_id,owner_id,accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run("owner_change_pending", "w_a", item.id, "agreement", 2, "proposed", "2026-11-23", "2026-11-25", null, ADMIN.id, ADMIN.id, previousOwner.user.id, null, "2026-11-19T09:00:00.000Z");
  app.storage.db.prepare(
    "INSERT INTO commitment_acceptances(commitment_id,actor_id,role,accepted_at) VALUES(?,?,?,?)",
  ).run("owner_change_agreement", previousOwner.user.id, "owner", "2026-11-19T08:00:00.000Z");

  await admin.command("updateItem", [item.id, { ownerId: nextOwner.user.id }]);

  assert.equal(app.storage.db.prepare("SELECT status FROM commitments WHERE id=?").get("owner_change_agreement").status, "superseded");
  const change = JSON.parse(app.storage.db.prepare("SELECT payload_json FROM audit_events WHERE workspace_id=? AND event_type='owner_changed' ORDER BY recorded_at DESC LIMIT 1").get("w_a").payload_json);
  assert.deepEqual(
    { fromValue: change.fromValue, toValue: change.toValue, endedCommitmentIds: change.endedCommitmentIds },
    { fromValue: previousOwner.user.id, toValue: nextOwner.user.id, endedCommitmentIds: ["owner_change_agreement", "owner_change_pending"] },
  );
  assert.equal(app.storage.db.prepare("SELECT COUNT(*) AS count FROM commitment_acceptances WHERE commitment_id=?").get("owner_change_agreement").count, 1);

  await admin.command("proposeCommitment", [item.id, {
    startAt: "2026-11-23",
    dueAt: "2026-11-25",
    ownerId: nextOwner.user.id,
  }]);
  const nextCommitmentId = app.storage.db.prepare("SELECT id FROM commitments WHERE workspace_id=? AND item_id=? AND kind='agreement' AND version=3").get("w_a", item.id).id;
  await nextOwner.client.command("acceptCommitment", [nextCommitmentId]);
  assert.deepEqual(
    app.storage.db.prepare(
      "SELECT version,status,owner_id AS ownerId FROM commitments WHERE workspace_id=? AND item_id=? AND kind='agreement' ORDER BY version",
    ).all("w_a", item.id).map((row) => ({ ...row })),
    [
      { version: 1, status: "superseded", ownerId: previousOwner.user.id },
      { version: 2, status: "superseded", ownerId: previousOwner.user.id },
      { version: 3, status: "active", ownerId: nextOwner.user.id },
    ],
  );
});

test("execution cannot propose a commitment even when it can record measurements", async (t) => {
  const context = await fixture(t);
  const { admin } = context;
  const executor = await addWorkspaceUser(context, {
    id: "u_execution_only",
    email: "execution-only@example.test",
    operations: ["view_item", "record_measurement"],
  });
  const item = await createItem(admin, "Compromisso protegido", { id: "protected_commitment", ownerId: executor.user.id });

  await assert.rejects(executor.client.command("proposeCommitment", [item.id, {
    startAt: "2026-11-02",
    dueAt: "2026-11-12",
    scopeNote: "Tentativa pelo executor.",
  }]));
});

test("breaking down an initiated item preserves its realized progress before child aggregation", async (t) => {
  const { admin, app } = await fixture(t);
  const parent = await createItem(admin, "Regularização agrupadora", { id: "breakdown_parent", progressPercent: 40 });
  await admin.command("recordMeasurement", [parent.id, { percent: 40, occurrence: "no_issue", effectiveAt: "2026-11-02T08:00:00.000Z" }]);
  await admin.command("createItem", [{
    id: "breakdown_child",
    title: "Frente detalhada",
    type: "task",
    status: "backlog",
    ownerId: ADMIN.id,
    organizationId: ADMIN.organizationId,
    sectorId: ADMIN.sectorId,
    state: "PE",
    parentId: parent.id,
    plannedStartAt: "2026-11-03",
    plannedDurationDays: 2,
    progressPercent: 0,
  }]);
  const saved = (await admin.projection()).state.items.find((item) => item.id === parent.id);
  assert.equal(saved.realizedBeforeBreakdown, 40);
  assert.equal(saved.type, "process");
  await assert.rejects(admin.command("recordMeasurement", [parent.id, { percent: 50, occurrence: "no_issue" }]));
  assert.equal(app.storage.db.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE workspace_id=? AND event_type='item_breakdown_started'").get("w_a").total, 1);
});

test("rework after completion creates a corrective activity instead of reopening the original", async (t) => {
  const { admin, app } = await fixture(t);
  const original = await createItem(admin, "Entrega concluída", { id: "completed_original", plannedDurationDays: 1 });
  await admin.command("recordMeasurement", [original.id, { percent: 100, occurrence: "no_issue", effectiveAt: "2026-11-02T08:00:00.000Z" }]);
  await admin.command("createCorrectiveActivity", [original.id, { title: "Corrigir acabamento", plannedDurationDays: 2 }]);
  const projection = await admin.projection();
  const corrective = projection.state.items.find((item) => item.title === "Corrigir acabamento");
  assert.ok(corrective);
  assert.equal(app.storage.db.prepare("SELECT percent FROM measurements WHERE workspace_id=? AND item_id=? ORDER BY effective_at DESC LIMIT 1").get("w_a", original.id).percent, 100);
  assert.ok(projection.state.relations.some((relation) => relation.sourceId === original.id && relation.targetId === corrective.id && relation.relationType === "TI"));
  assert.equal(app.storage.db.prepare("SELECT COUNT(*) AS total FROM audit_events WHERE workspace_id=? AND event_type='corrective_activity_created'").get("w_a").total, 1);
});
