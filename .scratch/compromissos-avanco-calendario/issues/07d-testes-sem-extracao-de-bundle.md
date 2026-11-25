# 07d: Testes sem extracao de bundle

**What to build:** Coordinate the remaining ticket 07 test migration. Complete 07e-07i, then remove bundle-internal assertions, classify tests belonging to the retiring offline mode under ticket 08, and run the final acceptance gates.

**Blocked by:** 07e, 07f, 07g, 07h, 07i.

**Status:** done

- [x] Inventory bundle-dependent tests and map each behavioral assertion to a public contract.
- [x] Confirm 07e-07h cover the retained domain, API, and UI contracts.
- [x] Keep only observable markup/style and build-wiring assertions against built assets.
- [x] Remove bundle function-name searches, regex extraction, VM bundle execution, and string slicing from maintained tests/build workflows.
- [x] Classify offline-only persistence/migration tests under ticket 08; do not silently remove or migrate local data as part of ticket 07.
- [x] Run the maintained test suite, backend/browser E2Es, syntax, and startup checks; attach evidence to ticket 07.

## Comments

- 2026-11-25: Inventory found bundle/VM coupling in `core.test.mjs`, `deletion.test.mjs`, `inclusive-calendar.test.mjs`, `p0-integrity.test.mjs`, `prd3-ui-contract.test.mjs`, `prd4.test.mjs`, `prd41.test.mjs`, `prd42.test.mjs`, `prd43.test.mjs`, `prd5.test.mjs`, `graph.test.mjs`, and `build-version.test.mjs`. `server/domain.mjs` had bundle coupling; it was removed and `tests/server-domain-source.test.mjs` now passes.
- 2026-11-25: Source/API coverage now includes direct operation tests and backend API tests; browser E2E flows pass. `tests/domain-build.test.mjs` covers source-to-browser build wiring. Legacy full-suite run remains red in VM-based client-mode suites; a timestamp-sensitive trend assertion also remains. These failures are not accepted as green and still need assertion-by-assertion triage before closing this subticket.
- 2026-11-25 audit: keep explicit coverage for local-data migration/recovery pending ticket 08's offline-mode decision; parent moves and relation edits with rollback/baseline; inclusive dates and TI/II/TT/IF/milestones; visibility filtering for relations; Gantt TI editing/trend drag; graph interactions; accessible pane resizing; UI status/color configuration; and pasted-hierarchy input. Source/API and existing browser coverage already replace a substantial share of item, GPO, schedule, approval, template, and deletion assertions, but these remaining gaps need public-flow tests before deleting or reclassifying the VM suites.
- 2026-11-25: Split the remaining coverage and cleanup into 07e-07i so domain/API contracts, browser flows, graph/accessibility checks, and test retirement each have explicit acceptance gates.
- 2026-11-25: 07e covers source schedule/hierarchy/rollback contracts; 07f covers public authorization/visibility/API behavior; 07g covers creation and Gantt browser flows; 07h covers graph/accessibility/presentation browser checks; 07i removes bundle-coupled tests only after those replacements pass. Ticket 08 owns any offline-only persistence/migration test retirement.
- 2026-11-25: Final gates passed: `npm run test:all` (112 maintained tests, 59 backend tests, four Chromium E2Es), `npm run check`, `npm run check:backend`, and `npm run build`. `npm start` served `/healthz` with HTTP 200 using an isolated temporary data directory, removed after shutdown. The browser E2Es verified authenticated login and persisted flows. Build required elevated filesystem access because esbuild's parent-directory scan is denied in the default sandbox.
- 2026-11-25: Maintained `npm test` now runs source/domain/API/trend/build-version contracts; `npm run test:all` adds backend tests and all four authenticated Chromium E2Es. The failing `test:legacy` alias was removed. Verified `npm run test:all` (112 maintained tests, 59 backend tests, all Chromium flows), `npm run check`, and `npm run check:backend` on the supplied Node 26.13.1; all passed. Browser E2Es start the Node-backed app and verify login, persistence, Gantt and graph behavior. Offline/localStorage migration assertions remain file-preserved and assigned to ticket 08.

## Comments

- This is the final validation and acceptance step for umbrella ticket 07.
