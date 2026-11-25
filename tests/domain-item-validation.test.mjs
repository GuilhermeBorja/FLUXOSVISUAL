import assert from "node:assert/strict";
import test from "node:test";

async function loadValidation() {
  try {
    return await import("../src/domain-item-validation.mjs");
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND") assert.fail("the item validation source module is missing");
    throw error;
  }
}

function fixture() {
  const state = {
    organizations: [{ id: "org_a" }],
    sectors: [{ id: "sector_a", organizationId: "org_a" }],
    users: [{ id: "user_a", organizationId: "org_a", sectorId: "sector_a", state: "PB" }],
  };
  const input = {
    title: "Task", type: "task", status: "backlog", ownerId: "user_a",
    organizationId: "org_a", sectorId: "sector_a", state: "PB",
  };
  return { state, input };
}

test("item validation requires a title, owner, valid organization and matching sector", async () => {
  const { validateItemInput } = await loadValidation();
  const { state, input } = fixture();

  assert.throws(() => validateItemInput({ ...input, title: "  " }, null, state), /nome do item/i);
  assert.throws(() => validateItemInput({ ...input, ownerId: "" }, null, state), /responsável/i);
  assert.throws(() => validateItemInput({ ...input, organizationId: "unknown" }, null, state), /empresa/i);
  assert.throws(() => validateItemInput({ ...input, sectorId: "other" }, null, state), /setor/i);
  assert.equal(validateItemInput(input, null, state), undefined);
});

test("manual blocked status requires a reason unless the block is inherited", async () => {
  const { validateItemInput } = await loadValidation();
  const { state, input } = fixture();

  assert.throws(() => validateItemInput({ ...input, status: "blocked" }, null, state), /motivo do bloqueio/i);
  assert.equal(validateItemInput({ ...input, status: "blocked" }, { blockedByPropagation: true }, state), undefined);
  assert.equal(validateItemInput({ ...input, status: "blocked", blockedReason: "Fornecedor" }, null, state), undefined);
});

test("validation rejects invalid enums, progress, weight, duration, and dates", async () => {
  const { validateItemInput } = await loadValidation();
  const { state, input } = fixture();

  assert.throws(() => validateItemInput({ ...input, type: "unknown" }, null, state), /tipo de item/i);
  assert.throws(() => validateItemInput({ ...input, status: "unknown" }, null, state), /status/i);
  assert.throws(() => validateItemInput({ ...input, progressPercent: 101 }, null, state), /percentual/i);
  assert.throws(() => validateItemInput({ ...input, weight: 0 }, null, state), /peso/i);
  assert.throws(() => validateItemInput({ ...input, plannedDurationDays: -1 }, null, state), /duração/i);
  assert.throws(() => validateItemInput({ ...input, targetStartAt: "2026-02-XX" }, null, state), /data-meta/i);
  assert.throws(() => validateItemInput({ ...input, replannedDueAt: "2026-02-XX" }, null, state), /repactuação/i);
  assert.throws(() => validateItemInput({ ...input, plannedStartAt: "2026-04-10", dueAt: "2026-04-09" }, null, state), /término ideal/i);
});

test("planned target range honors existing values and owner context must be valid", async () => {
  const { validateItemInput } = await loadValidation();
  const { state, input } = fixture();

  assert.throws(() => validateItemInput({ ...input, targetStartAt: "2026-05-10" }, { targetDueAt: "2026-05-09" }, state), /término-meta/i);
  assert.throws(() => validateItemInput({ ...input, ownerId: "missing" }, null, state), /responsável ativo/i);
  assert.throws(() => validateItemInput({ ...input, state: "PB1" }, null, state), /UF/i);
});

test("legacy blocked flag normalizes status but keeps completed and cancelled statuses", async () => {
  const { normalizeLegacyBlocked } = await loadValidation();

  assert.deepEqual(normalizeLegacyBlocked({ status: "backlog", blocked: true }), { status: "blocked", blocked: true });
  assert.deepEqual(normalizeLegacyBlocked({ status: "done", blocked: true }), { status: "done", blocked: true });
  assert.deepEqual(normalizeLegacyBlocked({ status: "cancelled", blocked: true }), { status: "cancelled", blocked: true });
  const unchanged = { status: "ready", blocked: false };
  assert.equal(normalizeLegacyBlocked(unchanged), unchanged);
});
