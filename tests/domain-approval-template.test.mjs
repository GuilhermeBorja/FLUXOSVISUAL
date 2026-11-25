import assert from "node:assert/strict";
import test from "node:test";
import { createApprovalTemplateOperations } from "../src/domain-approval-template.mjs";

function fixture({ authorize = () => true, ...overrides } = {}) {
  const user = { id: "user_a", organizationId: "org_a", sectorId: "sector_a", state: "PE" };
  const approval = {
    id: "approval_a", title: "Aprovar projeto", type: "approval", status: "backlog",
    ownerId: user.id, approvalReviewerId: user.id, organizationId: user.organizationId,
    sectorId: user.sectorId, state: user.state, parentId: "", plannedStartAt: "2026-01-01",
    progressPercent: 0,
  };
  const state = {
    users: [user], organizations: [{ id: user.organizationId, active: true }],
    items: [approval], relations: [], approvalDecisions: [], templates: [], events: [],
  };
  const calls = [];
  const operations = createApprovalTemplateOperations({
    state,
    currentUser: () => user,
    authorize,
    canSubmitApproval: () => true,
    canDecideApproval: () => true,
    approvalGate: () => ({ released: true }),
    canEditItem: () => true,
    canViewItem: () => true,
    canManageGpo: () => true,
    canCreateItem: () => true,
    itemTreeIds: (roots) => new Set([...roots, ...state.items.filter((item) => item.parentId === "approval_a").map((item) => item.id)]),
    createEvent: (...args) => calls.push(["event", ...args]),
    registryEvent: (...args) => calls.push(["registry", ...args]),
    createItem: (input) => { const item = { ...input, id: `created_${state.items.length}` }; state.items.push(item); return item; },
    createRelation: (...args) => { const relation = { sourceId: args[0], targetId: args[1], relationType: args[2] }; state.relations.push(relation); return relation; },
    recalculatePlannedDates: () => ({ valid: true }),
    syncParentSummary: () => {},
    id: (prefix) => `${prefix}_${state.approvalDecisions.length + state.templates.length + 1}`,
    nowIso: () => "2026-01-02T12:00:00.000Z",
    today: () => "2026-01-02",
    shiftedDate: (date) => date,
    inclusiveFinishDate: (date) => date,
    completeStatus: (status) => status === "done",
    ...overrides,
  });
  return { state, user, approval, calls, operations };
}

test("approval submission stores a decision and moves the approval to review", () => {
  const { state, approval, operations, calls } = fixture();

  const submission = operations.submitApprovalForReview(approval.id, "Enviar para análise");

  assert.equal(submission.kind, "submitted");
  assert.equal(submission.outcome, "under_review");
  assert.equal(state.approvalDecisions[0], submission);
  assert.equal(approval.status, "under_review");
  assert.ok(calls.some(([kind, , event]) => kind === "event" && event === "approval_submitted"));
});

test("a correction owner can resubmit when the authorization callback returns a decision object", () => {
  const { approval, operations } = fixture({ authorize: () => ({ allowed: true }) });
  approval.status = "correction";
  approval.correctionOwnerId = "another_user";

  const submission = operations.submitApprovalForReview(approval.id);

  assert.equal(submission.outcome, "under_review");
});

test("rejecting an approval creates correction work linked before the next review", () => {
  const { state, approval, operations } = fixture();
  approval.status = "under_review";
  approval.approvalRequestId = "request_a";

  const decision = operations.decideApproval(approval.id, "rejected", "Corrigir memorial", "user_a");

  assert.equal(decision.outcome, "rejected");
  assert.equal(approval.status, "correction");
  assert.equal(approval.approvalRound, 2);
  assert.equal(state.items.length, 2);
  assert.equal(state.items[1].correctionFor, approval.id);
  assert.deepEqual(state.relations[0], {
    id: "rel_2", sourceId: state.items[1].id, targetId: approval.id, relationType: "TI",
    lagDays: 0, description: "Correção obrigatória antes do reenvio.",
    createdBy: "user_a", createdAt: "2026-01-02T12:00:00.000Z",
  });
});

test("saving a flow template captures an ordered tree without runtime state", () => {
  const { state, approval, operations } = fixture();
  const child = { ...approval, id: "task_child", title: "Executar", type: "task", parentId: approval.id, sortOrder: 10 };
  state.items.push(child);

  const template = operations.saveFlowTemplate(approval.id, "Fluxo base");

  assert.equal(template.name, "Fluxo base");
  assert.deepEqual(template.items.map((item) => item.key), [approval.id, child.id]);
  assert.equal(template.items[0].parentKey, "");
  assert.equal(template.items[1].parentKey, approval.id);
  assert.equal(template.createdBy, "user_a");
  assert.equal(state.templates[0], template);
});

test("applying a template maps its parent keys", () => {
  const { state, operations } = fixture();
  state.templates.push({
    id: "template_a", name: "Fluxo", organizationId: "org_a", createdBy: "user_a",
    items: [
      { key: "root", title: "Novo projeto", type: "project", status: "backlog", ownerId: "user_a", startOffset: 0, plannedDurationDays: null },
      { key: "task", parentKey: "root", title: "Executar", type: "task", status: "ready", ownerId: "user_a", startOffset: 0, plannedDurationDays: 1 },
    ], relations: [],
  });

  const result = operations.applyFlowTemplate("template_a", { organizationId: "org_a", sectorId: "sector_a", state: "PE", startDate: "2026-01-03", title: "Obra nova" });

  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].title, "Obra nova");
  assert.equal(result.items[1].parentId, result.items[0].id);
});

test("applying a template rolls back created items when a relation fails", () => {
  const { state, operations } = fixture({ createRelation: () => { throw new Error("invalid relation"); } });
  state.templates.push({
    id: "template_a", name: "Fluxo", organizationId: "org_a", createdBy: "user_a",
    items: [
      { key: "root", title: "Novo projeto", type: "project", status: "backlog", ownerId: "user_a", startOffset: 0, plannedDurationDays: null },
      { key: "task_a", parentKey: "root", title: "A", type: "task", status: "ready", ownerId: "user_a", startOffset: 0, plannedDurationDays: 1 },
      { key: "task_b", parentKey: "root", title: "B", type: "task", status: "ready", ownerId: "user_a", startOffset: 0, plannedDurationDays: 1 },
    ],
    relations: [{ sourceKey: "task_a", targetKey: "task_b", relationType: "TI", lagDays: 0 }],
  });
  const before = structuredClone(state);

  assert.throws(() => operations.applyFlowTemplate("template_a", {
    organizationId: "org_a", sectorId: "sector_a", state: "PE", startDate: "2026-01-03", title: "Obra nova",
  }), /invalid relation/);
  assert.deepEqual(state, before);
});

test("reopening a completed approval records a new round and restores its progress", () => {
  const { state, approval, operations } = fixture();
  approval.status = "done";
  approval.progressPercent = 100;
  approval.lastDecisionId = "decision_previous";
  approval.completedAt = "2026-01-01T00:00:00.000Z";

  const reopened = operations.reopenApproval(approval.id, "Retomar etapa", 40);

  assert.equal(reopened.kind, "reopened");
  assert.equal(reopened.previousDecisionId, "decision_previous");
  assert.equal(approval.status, "backlog");
  assert.equal(approval.progressPercent, 40);
  assert.equal(approval.approvalRound, 2);
});

test("removing a template requires its creator or GPO permission", () => {
  const { state, operations } = fixture();
  state.templates.push({ id: "template_a", createdBy: "user_a", name: "Fluxo" });

  operations.removeFlowTemplate("template_a");

  assert.deepEqual(state.templates, []);
});
