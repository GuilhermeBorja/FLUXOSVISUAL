import test from "node:test";
import assert from "node:assert/strict";
import {
  addWorkingDuration,
  calculateTrend,
} from "../server/trend.mjs";
import { countCalendarDays } from "../server/calendar.mjs";

const legacyCalendar = {
  id: "legacy-calendar-days",
  kind: "elapsed_days",
  timezone: "America/Sao_Paulo",
};

test("calendar preserves inclusive legacy dates and skips non-working days for new projects", () => {
  assert.equal(
    addWorkingDuration("2026-11-02", 2, legacyCalendar),
    "2026-11-03",
  );
  assert.equal(
    addWorkingDuration("2026-11-06", 2, {
      id: "workdays",
      kind: "working_time",
      timezone: "America/Sao_Paulo",
      workingWeekdays: [1, 2, 3, 4, 5],
      holidays: [],
    }),
    "2026-11-09",
  );
  assert.equal(countCalendarDays("2026-11-06", "2026-11-09", { kind: "working_time", workingWeekdays: [1, 2, 3, 4, 5], holidays: [] }), 2);
  assert.equal(addWorkingDuration("2026-11-06", 0, legacyCalendar), "2026-11-06");
  assert.equal(addWorkingDuration("2026-11-06", 0.5, legacyCalendar), "2026-11-06");
  assert.equal(addWorkingDuration("2026-11-06", 1.5, legacyCalendar), "2026-11-07");
});

test("trend releases TI successor from actual predecessor finish and applies lag", () => {
  const projection = calculateTrend({
    items: [
      {
        id: "a",
        parentId: null,
        type: "task",
        plannedDurationDays: 10,
        calendarId: "legacy-calendar-days",
      },
      {
        id: "b",
        parentId: null,
        type: "task",
        plannedDurationDays: 10,
        calendarId: "legacy-calendar-days",
      },
    ],
    relations: [
      {
        id: "a_to_b",
        sourceId: "a",
        targetId: "b",
        relationType: "TI",
        lagDays: 6,
      },
    ],
    commitments: [
      {
        itemId: "a",
        kind: "agreement",
        status: "active",
        startAt: "2026-11-01",
        dueAt: "2026-11-10",
      },
      {
        itemId: "b",
        kind: "agreement",
        status: "active",
        startAt: "2026-11-17",
        dueAt: "2026-11-26",
      },
    ],
    measurements: [
      {
        itemId: "a",
        percent: 100,
        effectiveAt: "2026-11-05T15:00:00.000Z",
      },
    ],
    calendars: [legacyCalendar],
    asOf: "2026-11-05T15:00:00.000Z",
  });

  assert.deepEqual(projection.itemTrendById.a, {
    actualStartAt: "2026-11-05",
    actualFinishAt: "2026-11-05",
    releaseAt: "2026-11-01",
    trendStartAt: "2026-11-05",
    trendDueAt: "2026-11-05",
    derivedState: "completed",
    lastMeasurementPercent: 100,
    lastMeasurementAt: "2026-11-05T15:00:00.000Z",
    lastMeasurement: {
      id: "",
      percent: 100,
      occurrence: "no_issue",
      description: "",
      effectiveAt: "2026-11-05T15:00:00.000Z",
      recordedAt: "",
    },
    expectedProgressPercent: 50,
    counters: {
      cycleDays: 5,
      waitingDays: 4,
      executionDays: 1,
      blockedDays: 0,
    },
  });
  assert.equal(projection.itemTrendById.b.releaseAt, "2026-11-11");
  assert.equal(projection.itemTrendById.b.trendStartAt, "2026-11-11");
  assert.equal(projection.itemTrendById.b.trendDueAt, "2026-11-20");
  assert.equal(projection.itemTrendById.b.derivedState, "not_released");
});

test("summary TI releases the longest-path group without duplicating the relation", () => {
  const projection = calculateTrend({
    items: [
      { id: "a", type: "task", parentId: null, plannedDurationDays: 5, calendarId: "legacy-calendar-days" },
      { id: "group", type: "project", parentId: null, plannedDurationDays: null, calendarId: "legacy-calendar-days" },
      { id: "b1", type: "task", parentId: "group", plannedDurationDays: 2, calendarId: "legacy-calendar-days" },
      { id: "b2", type: "task", parentId: "group", plannedDurationDays: 6, calendarId: "legacy-calendar-days" },
    ],
    relations: [{ id: "a_to_group", sourceId: "a", targetId: "group", relationType: "TI", lagDays: 0 }],
    commitments: [
      { itemId: "a", kind: "agreement", status: "active", startAt: "2026-11-01", dueAt: "2026-11-05" },
      { itemId: "b1", kind: "agreement", status: "active", startAt: "2026-11-01", dueAt: "2026-11-02" },
      { itemId: "b2", kind: "agreement", status: "active", startAt: "2026-11-01", dueAt: "2026-11-06" },
    ],
    measurements: [{ itemId: "a", percent: 100, effectiveAt: "2026-11-05T08:00:00.000Z" }],
    calendars: [legacyCalendar],
    asOf: "2026-11-05T08:00:00.000Z",
  });
  assert.equal(projection.itemTrendById.b1.releaseAt, "2026-11-06");
  assert.equal(projection.itemTrendById.b2.releaseAt, "2026-11-06");
});

test("trend uses planning remaining duration instead of inferring productivity from percent", () => {
  const projection = calculateTrend({
    items: [
      {
        id: "regularize",
        parentId: null,
        type: "task",
        plannedDurationDays: 10,
        remainingDurationDays: 4,
        calendarId: "legacy-calendar-days",
      },
    ],
    relations: [],
    commitments: [
      {
        itemId: "regularize",
        kind: "agreement",
        status: "active",
        startAt: "2026-11-01",
        dueAt: "2026-11-10",
      },
    ],
    measurements: [
      {
        id: "m_25",
        itemId: "regularize",
        percent: 25,
        effectiveAt: "2026-11-02T15:00:00.000Z",
      },
    ],
    calendars: [legacyCalendar],
    asOf: "2026-11-02T15:00:00.000Z",
  });

  assert.deepEqual(projection.itemTrendById.regularize, {
    actualStartAt: "2026-11-02",
    actualFinishAt: "",
    releaseAt: "2026-11-01",
    trendStartAt: "2026-11-02",
    trendDueAt: "2026-11-05",
    derivedState: "in_progress",
    lastMeasurementPercent: 25,
    lastMeasurementAt: "2026-11-02T15:00:00.000Z",
    lastMeasurement: {
      id: "m_25",
      percent: 25,
      occurrence: "no_issue",
      description: "",
      effectiveAt: "2026-11-02T15:00:00.000Z",
      recordedAt: "",
    },
    expectedProgressPercent: 20,
    counters: {
      cycleDays: 2,
      waitingDays: 1,
      executionDays: 1,
      blockedDays: 0,
    },
  });
});

test("trend preserves cycle accountability and pauses execution while blocked", () => {
  const projection = calculateTrend({
    items: [
      {
        id: "mount",
        parentId: null,
        type: "task",
        plannedDurationDays: 10,
        calendarId: "legacy-calendar-days",
        blockedAt: "2026-11-04T08:00:00.000Z",
      },
    ],
    relations: [],
    commitments: [
      {
        itemId: "mount",
        kind: "agreement",
        status: "active",
        startAt: "2026-11-01",
        dueAt: "2026-11-10",
      },
    ],
    measurements: [
      {
        id: "m_start",
        itemId: "mount",
        percent: 10,
        effectiveAt: "2026-11-03T08:00:00.000Z",
      },
    ],
    calendars: [legacyCalendar],
    asOf: "2026-11-06T08:00:00.000Z",
  });

  assert.equal(projection.itemTrendById.mount.derivedState, "blocked");
  assert.deepEqual(projection.itemTrendById.mount.counters, {
    cycleDays: 6,
    waitingDays: 2,
    executionDays: 1,
    blockedDays: 3,
  });
});

test("trend marks a measurement pending without creating a fictitious advance", () => {
  const projection = calculateTrend({
    items: [{ id: "inspect", type: "task", plannedDurationDays: 2, calendarId: "legacy-calendar-days" }],
    relations: [],
    commitments: [{ itemId: "inspect", kind: "agreement", status: "active", startAt: "2026-11-01", dueAt: "2026-11-02" }],
    measurements: [{ id: "m_1", itemId: "inspect", percent: 20, effectiveAt: "2026-11-01T08:00:00.000Z" }],
    measurementPolicies: [{ itemId: "inspect", frequency: "daily" }],
    calendars: [legacyCalendar],
    asOf: "2026-11-03T08:00:00.000Z",
  });

  assert.equal(projection.itemTrendById.inspect.derivedState, "measurement_pending");
  assert.equal(projection.itemTrendById.inspect.lastMeasurementPercent, 20);
});

test("trend exposes the planned percentage separately from factual progress", () => {
  const projection = calculateTrend({
    items: [{ id: "planned", type: "task", plannedDurationDays: 4, calendarId: "legacy-calendar-days" }],
    relations: [],
    commitments: [{ itemId: "planned", kind: "agreement", status: "active", startAt: "2026-11-01", dueAt: "2026-11-04" }],
    measurements: [{ id: "m_1", itemId: "planned", percent: 20, effectiveAt: "2026-11-01T08:00:00.000Z" }],
    calendars: [legacyCalendar],
    asOf: "2026-11-02T08:00:00.000Z",
  });

  assert.equal(projection.itemTrendById.planned.expectedProgressPercent, 50);
  assert.equal(projection.itemTrendById.planned.lastMeasurementPercent, 20);
});

test("trend uses recording order when two measurements share the same effective minute", () => {
  const projection = calculateTrend({
    items: [{ id: "same_minute", type: "task", plannedDurationDays: 2, calendarId: "legacy-calendar-days" }],
    relations: [],
    commitments: [{ itemId: "same_minute", kind: "agreement", status: "active", startAt: "2026-11-17", dueAt: "2026-11-18" }],
    measurements: [
      {
        id: "measurement_z",
        itemId: "same_minute",
        percent: 10,
        occurrence: "divergence",
        description: "Mobilização atrasada.",
        effectiveAt: "2026-11-17T16:47:00.000Z",
        recordedAt: "2026-11-17T19:47:01.000Z",
        recordOrder: 10,
      },
      {
        id: "measurement_a",
        itemId: "same_minute",
        percent: 50,
        occurrence: "no_issue",
        description: "Frente mobilizada e reparo iniciado.",
        effectiveAt: "2026-11-17T16:47:00.000Z",
        recordedAt: "2026-11-17T19:47:01.000Z",
        recordOrder: 11,
      },
    ],
    calendars: [legacyCalendar],
    asOf: "2026-11-17T19:47:03.000Z",
  });

  assert.equal(projection.itemTrendById.same_minute.lastMeasurementPercent, 50);
  assert.deepEqual(projection.itemTrendById.same_minute.lastMeasurement, {
    id: "measurement_a",
    percent: 50,
    occurrence: "no_issue",
    description: "Frente mobilizada e reparo iniciado.",
    effectiveAt: "2026-11-17T16:47:00.000Z",
    recordedAt: "2026-11-17T19:47:02.000Z",
  });
});
