# 07e: Contratos de agenda e hierarquia no source

**What to build:** Complete direct-source tests for schedule, hierarchy, and rollback semantics currently covered by bundle-extraction tests.

**Blocked by:** 07b.

**Status:** done

- [x] Map assertions in `inclusive-calendar.test.mjs`, `p0-integrity.test.mjs`, and the schedule parts of `prd4.test.mjs` to `src/domain.mjs#createDomain` and focused source operations.
- [x] Ensure source tests cover inclusive date ranges, zero-duration milestones, TI lags, canceled predecessors, CPM, baseline preservation, and summary recalculation through multiple parent levels.
- [x] Pin the supported relation contract: persisted domain state accepts TI only; legacy II/TT/IF are rejected by state validation.
- [x] Cover parent moves and relation create/update/remove rollback, including event history and unchanged state after rejection.
- [x] Keep tests at the source API boundary; do not read or execute `dist/app.js` or `dist/workspace.js`.
- [x] Run focused domain tests; backend regression coverage for baseline and public TI calendars already exists and will be rerun at final acceptance.

## Comments

- Existing source tests already cover many schedule and relation cases. Extend only where the inventory finds an uncovered assertion; do not duplicate tests solely to rename them.
- The current Node backend intentionally persists only TI relations; II, TT, and IF assertions from the static client suite must be retired with that mode, not restored in the backend.
- 2026-11-25: Added source tests for zero-day TI milestone release, inclusive duration fallback, canceled predecessor behavior, baseline preservation, and rejection of legacy II/TT/IF types. Focused results: schedule operations 6/6; source domain 13/13. Existing source relation/parent tests cover rollback, events, and multilevel summary propagation.
- Local-storage migration and offline recovery are excluded here and tracked by ticket 08.
