import {
  addCalendarLag,
  addWorkingDuration,
  countCalendarDays,
} from "./calendar.mjs";

const dateOnly = (value) => String(value || "").slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;

function elapsedDays(startAt, endAt, calendar) {
  if (!startAt || !endAt) return 0;
  return countCalendarDays(startAt, endAt, calendar);
}

function activeAgreement(commitments, itemId) {
  return commitments
    .filter(
      (commitment) =>
        commitment.itemId === itemId &&
        commitment.kind === "agreement" &&
        commitment.status === "active",
    )
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
}

function baselineCommitment(commitments, itemId) {
  return commitments
    .filter(
      (commitment) =>
        commitment.itemId === itemId && commitment.kind === "baseline",
    )
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
}

function latestMeasurement(measurements, itemId) {
  return measurements
    .filter((measurement) => measurement.itemId === itemId)
    .sort(
      (a, b) =>
        String(b.effectiveAt).localeCompare(String(a.effectiveAt)) ||
        String(b.recordedAt || "").localeCompare(String(a.recordedAt || "")) ||
        Number(b.recordOrder || 0) - Number(a.recordOrder || 0) ||
        String(b.id || "").localeCompare(String(a.id || "")),
    )[0];
}

function firstPositiveMeasurement(measurements, itemId) {
  return measurements
    .filter(
      (measurement) =>
        measurement.itemId === itemId && Number(measurement.percent) > 0,
    )
    .sort(
      (a, b) =>
        String(a.effectiveAt).localeCompare(String(b.effectiveAt)) ||
        String(a.id || "").localeCompare(String(b.id || "")),
    )[0];
}

function measurementPolicy(measurementPolicies, itemId) {
  return (
    measurementPolicies.find((policy) => policy.itemId === itemId) ||
    measurementPolicies.find((policy) => !policy.itemId)
  );
}

function milestoneProgress(policy, elapsedDays) {
  const milestones = (policy?.milestones || []).filter((entry) => Number.isFinite(Number(entry.offsetDays)) && Number.isFinite(Number(entry.percent))).sort((a, b) => Number(a.offsetDays) - Number(b.offsetDays));
  if (!milestones.length) return null;
  const day = Math.max(0, Number(elapsedDays || 0) - 1);
  if (day <= Number(milestones[0].offsetDays)) return Math.max(0, Math.min(100, Number(milestones[0].percent)));
  for (let index = 1; index < milestones.length; index += 1) {
    const previous = milestones[index - 1], next = milestones[index];
    if (day <= Number(next.offsetDays)) {
      const span = Math.max(1, Number(next.offsetDays) - Number(previous.offsetDays));
      const ratio = (day - Number(previous.offsetDays)) / span;
      return Math.max(0, Math.min(100, Number(previous.percent) + (Number(next.percent) - Number(previous.percent)) * ratio));
    }
  }
  return Math.max(0, Math.min(100, Number(milestones.at(-1).percent)));
}

function measurementIsPending(measurement, policy, asOfDate) {
  if (!measurement || !policy?.frequency || policy.frequency === "none") return false;
  const cadenceDays = policy.frequency === "weekly" ? 7 : 1;
  const ageMs = Date.parse(`${asOfDate}T00:00:00.000Z`) -
    Date.parse(`${dateOnly(measurement.effectiveAt)}T00:00:00.000Z`);
  return ageMs / DAY_MS >= cadenceDays;
}

function descendantsOf(items, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

function expandSummaryRelations(items, relations) {
  const children = new Set(items.map((item) => item.parentId).filter(Boolean));
  const leaves = items.filter((item) => !children.has(item.id));
  const leavesByGroup = new Map(items.map((item) => [item.id, leaves.filter((leaf) => descendantsOf(items, item.id).has(leaf.id))]));
  const expanded = [];
  for (const relation of relations.filter((entry) => entry.relationType === "TI")) {
    const sources = leavesByGroup.get(relation.sourceId) || [];
    const targets = leavesByGroup.get(relation.targetId) || [];
    const targetIds = new Set(targets.map((target) => target.id));
    const internalIncoming = new Set(relations.filter((entry) => entry.relationType === "TI" && targetIds.has(entry.targetId) && targetIds.has(entry.sourceId)).map((entry) => entry.targetId));
    const targetRoots = targets.filter((target) => !internalIncoming.has(target.id));
    for (const source of sources.length ? sources : [items.find((item) => item.id === relation.sourceId)].filter(Boolean)) {
      for (const target of targetRoots.length ? targetRoots : [items.find((item) => item.id === relation.targetId)].filter(Boolean)) {
        expanded.push({ ...relation, sourceId: source.id, targetId: target.id, summaryRelationId: relation.id });
      }
    }
  }
  return expanded;
}

function topologicalLeaves(items, relations) {
  const children = new Set(items.map((item) => item.parentId).filter(Boolean));
  const leaves = items.filter((item) => !children.has(item.id));
  const effectiveRelations = expandSummaryRelations(items, relations);
  const ids = new Set(leaves.map((item) => item.id));
  const outgoing = new Map(leaves.map((item) => [item.id, []]));
  const indegree = new Map(leaves.map((item) => [item.id, 0]));
  for (const relation of effectiveRelations) {
    if (
      relation.relationType !== "TI" ||
      !ids.has(relation.sourceId) ||
      !ids.has(relation.targetId)
    )
      continue;
    outgoing.get(relation.sourceId).push(relation);
    indegree.set(relation.targetId, indegree.get(relation.targetId) + 1);
  }
  const queue = leaves
    .filter((item) => indegree.get(item.id) === 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const ordered = [];
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index];
    ordered.push(item);
    for (const relation of outgoing.get(item.id)) {
      const next = indegree.get(relation.targetId) - 1;
      indegree.set(relation.targetId, next);
      if (next === 0)
        queue.push(items.find((candidate) => candidate.id === relation.targetId));
    }
  }
  if (ordered.length !== leaves.length)
    throw new Error("As relações TI não podem conter ciclos.");
  return { ordered, outgoing, effectiveRelations };
}

export { addWorkingDuration };

export function calculateTrend({
  items,
  relations,
  commitments,
  measurements,
  measurementPolicies = [],
  calendars,
  asOf,
}) {
  const calendarById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
  const { ordered, outgoing, effectiveRelations } = topologicalLeaves(items, relations);
  const itemTrendById = {};
  const asOfDate = dateOnly(asOf);
  for (const item of ordered) {
    const agreement = activeAgreement(commitments, item.id) || baselineCommitment(commitments, item.id);
    const calendar =
      calendarById.get(item.calendarId) ||
      calendars.find((candidate) => candidate.id !== "legacy-calendar-days") ||
      calendarById.get("legacy-calendar-days") ||
      calendars[0];
    const predecessors = effectiveRelations.filter(
      (relation) =>
        relation.relationType === "TI" && relation.targetId === item.id,
    );
    const releases = predecessors
      .map((relation) => {
        const predecessor = itemTrendById[relation.sourceId];
        if (!predecessor?.actualFinishAt && !predecessor?.trendDueAt) return "";
        return addCalendarLag(
          predecessor.actualFinishAt || predecessor.trendDueAt,
          Number(relation.lagDays || 0),
          calendar,
        );
      })
      .filter(Boolean);
    const releaseAt = releases.sort().at(-1) || agreement?.startAt || "";
    const measurement = latestMeasurement(measurements, item.id);
    const firstPositive = firstPositiveMeasurement(measurements, item.id);
    const actualStartAt =
      firstPositive ? dateOnly(firstPositive.effectiveAt) : "";
    const actualFinishAt =
      measurement?.percent === 100 ? dateOnly(measurement.effectiveAt) : "";
    const trendStartAt = actualFinishAt
      ? actualStartAt || actualFinishAt
      : actualStartAt || releaseAt;
    const remainingDurationDays = Number.isFinite(item.remainingDurationDays)
      ? item.remainingDurationDays
      : item.plannedDurationDays;
    const trendDueAt = actualFinishAt
      ? actualFinishAt
      : trendStartAt && Number.isFinite(remainingDurationDays)
        ? addWorkingDuration(trendStartAt, remainingDurationDays, calendar)
        : "";
    const blockedAt =
      item.blockedAt && dateOnly(item.blockedAt) <= asOfDate
        ? dateOnly(item.blockedAt)
        : "";
    const agreementDurationDays = elapsedDays(agreement?.startAt, agreement?.dueAt, calendar);
    const elapsedAgreementDays = elapsedDays(agreement?.startAt, asOfDate, calendar);
    const policy = measurementPolicy(measurementPolicies, item.id);
    const milestoneExpected = policy?.frequency === "milestone" ? milestoneProgress(policy, elapsedAgreementDays) : null;
    const expectedProgressPercent = milestoneExpected !== null ? Math.round(milestoneExpected * 100) / 100 : !agreementDurationDays || asOfDate < dateOnly(agreement?.startAt)
      ? 0
      : Math.min(100, Math.round((elapsedAgreementDays / agreementDurationDays) * 100));
    const derivedState = actualFinishAt
      ? "completed"
      : blockedAt
        ? "blocked"
      : measurementIsPending(measurement, policy, asOfDate)
        ? "measurement_pending"
      : measurement?.percent > 0
        ? "in_progress"
        : releaseAt && releaseAt <= asOfDate
          ? "released"
          : "not_released";
    const cycleEndAt = actualFinishAt || asOfDate;
    const waitingDays = actualStartAt
      ? Math.max(0, elapsedDays(releaseAt, actualStartAt, calendar) - 1)
      : elapsedDays(releaseAt, cycleEndAt, calendar);
    const blockedDays = blockedAt ? elapsedDays(blockedAt, cycleEndAt, calendar) : 0;
    const executionEndAt = blockedAt || actualFinishAt || cycleEndAt;
    const executionDays = actualStartAt
      ? Math.max(0, elapsedDays(actualStartAt, executionEndAt, calendar) - (blockedAt ? 1 : 0))
      : 0;
    itemTrendById[item.id] = {
      actualStartAt,
      actualFinishAt,
      releaseAt,
      trendStartAt,
      trendDueAt,
      derivedState,
      lastMeasurementPercent: measurement ? Number(measurement.percent) : null,
      lastMeasurementAt: measurement ? measurement.effectiveAt : "",
      lastMeasurement: measurement
        ? {
            id: measurement.id || "",
            percent: Number(measurement.percent),
            occurrence: measurement.occurrence || "no_issue",
            description: measurement.description || "",
            effectiveAt: measurement.effectiveAt || "",
            recordedAt: measurement.recordedAt || "",
          }
        : null,
      expectedProgressPercent,
      counters: {
        cycleDays: elapsedDays(releaseAt, cycleEndAt, calendar),
        waitingDays,
        executionDays,
        blockedDays,
      },
    };
    for (const relation of outgoing.get(item.id)) {
      if (!itemTrendById[relation.targetId]) continue;
    }
  }
  return { itemTrendById };
}
