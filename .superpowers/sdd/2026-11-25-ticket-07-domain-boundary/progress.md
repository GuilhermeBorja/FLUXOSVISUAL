# SDD ledger - plan: docs/superpowers/plans/2026-11-25-ticket-07-domain-boundary.md

Base branch: revisao-02-oficial
Remote branch `revisao-02-oficial` verified at base commit `224615145c8b4467c30c10ab3aec8ad7cfd4bbcd` (ticket 06). Local Git metadata/CLI is unavailable in this environment, so no local branch ref is asserted.
Baseline: `npm run test:all` passed (9 main tests, 56 backend tests) on portable Node 26.13.1.
Current verification: maintained `npm run test:all` passes 112 source/domain/API/trend/build-version tests, 59 backend tests, and all four Chromium flows (main, admin, graph projection, templates); `npm run check`, `npm run check:backend`, and `npm run build` pass. `npm start` served `/healthz` with HTTP 200 using an isolated temporary data directory, which was removed after shutdown. Browser E2Es also verified authenticated login, persistence, and UI flows. The old `test:legacy` alias was removed; preserved VM tests are inactive and mapped to 07g/07h or ticket 08. Portable Node 26 remains outside the package's declared >=24 <25 range.

Ruling: Use the authenticated GitHub connector for the authorized commit to `revisao-02-oficial`. Compared local file hashes against the verified remote base tree to identify changes; exclude generated runtime databases/logs and unrelated workspace artifacts, and include only ticket 07 implementation, tests, CI, and its tracker/spec files.

## Tasks
- 07a: complete - source owns exported constants/helpers, permission evaluation, state validation, and schedule analysis; server imports/re-exports shared APIs. Source tests passed 4/4 and backend suite passed 56/56.
- 07b: complete - source owns item/hierarchy/relation, schedule/blocker, event/tree, GPO, approval/template, parent summary, and archive/delete operations. Server adapter preserves `HttpError` contracts, and source tests (72/72) plus backend tests (56/56) pass. `tests/server-domain-source.test.mjs` forbids browser bundle reads.
- 07c: complete - `scripts/build-domain.mjs` emits `dist/domain.js`, HTML loads it before its consumers, and schedule analysis delegates to source. Browser E2E passed.
- 07d: complete. 07e/f source and API regressions, 07g/h observable browser coverage, and 07i maintained-suite cleanup are complete. Offline/localStorage migration assertions remain preserved outside maintained commands and belong to ticket 08.

## Decisions / findings
- Preserve `server/domain.mjs` exports and `createDomain(initial, actorId, onDecision)`.
- Bundle reads and VM execution have been removed from `server/domain.mjs`. The old VM tests remain physically preserved but are not invoked by maintained package scripts or CI `npm test` workflows. `build-version.test.mjs` inspects only `dist/version.js`, and the browser-visible build label is checked in `backend-e2e.mjs`.
- Detailed ownership: old UI behavior tests in `prd3-ui-contract`, `prd4`, `prd41`, `prd42`, `prd43`, and `graph` are replaced by 07e/f source/API contracts and 07g/h browser journeys. The `prd5` paste/Gantt checks are replaced by 07g; its `canonicalHierarchyVersion` local-state migration assertion, and local browser-state portions of `core`, `deletion`, `inclusive-calendar`, and `p0-integrity`, are reserved for ticket 08. These legacy files remain inactive pending retirement; graph force-layout internals have no `src/graph.mjs` source and are not a supported public contract.
- Task 1 pins empty-state initialization, authorization callback outcomes, and schedule/cycle behavior. These are the first direct-source contracts; additional operations need source coverage as the API is migrated.
- The source module has no Node-only imports; IDs use the platform `crypto.randomUUID()` API so esbuild can target the browser.
- Operation groups for 07b: items/hierarchy/relations; schedule/blockers; users/organizations/GPO; approvals; templates; events/registry. Preserve forced IDs, deferred schedule behavior, permission callback decisions, and final state validation.
- All listed operation groups are now composed into `src/domain.mjs#createDomain`; source API tests cover `call`, authorization decisions, event creation, tree enumeration, and item/relation operations. The server uses a source-backed adapter.
