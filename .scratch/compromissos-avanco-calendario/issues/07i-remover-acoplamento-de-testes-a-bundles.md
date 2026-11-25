# 07i: Remover acoplamento de testes a bundles

**What to build:** Retire remaining test and build-workflow dependencies on browser bundle internals after 07e-07h provide replacement coverage.

**Blocked by:** 07e, 07f, 07g, 07h.

**Status:** done

- [x] Remove function-name searches, regex extraction, VM execution, and string slicing of `dist/app.js`, `dist/graph.js`, or `dist/workspace.js` from maintained tests.
- [x] Keep only observable HTML/CSS assertions and build-wiring checks against generated assets.
- [x] Keep the browser-visible build-version assertion and version-file/cache-key build tests; no `buildLabel` bundle extraction remains.
- [x] Make timestamp-sensitive trend tests deterministic by asserting stable recording order without wall-clock dependence.
- [x] Classify remaining offline/local-storage migration tests under ticket 08; retain them only if they still protect an explicitly supported behavior.
- [x] Run the repository's maintained test commands and search for remaining bundle extraction patterns; document any intentionally quarantined test and its owning ticket.

## Comments

- Do not drop assertions whose replacement ticket is incomplete. Remove or reclassify them only after their owning acceptance criteria pass.
- 2026-11-25: Fixed the flaky same-effective-minute measurement test to assert which record wins by order and its stable fields; it no longer assumes a wall-clock-derived `recordedAt`. Focused trend test passed.
- 2026-11-25 inventory of the former `npm test` target (`tests/prd5.test.mjs`): indented paste parsing, escaped-vs-real newline handling, hierarchy/duration persistence, create-form structure, and Gantt/TI contracts map to 07g; organization refresh and graph/status presentation map to 07h; the supported `contains`/TI relation rule and derived parent summary map to 07e; `canonicalHierarchyVersion` migration is offline browser-state migration and belongs to ticket 08. The active script now runs source/domain/API tests; visible paste, schedule, relation, graph, and accessibility contracts run in the 07g/07h Chromium E2Es. The offline migration assertion remains outside maintained scripts under ticket 08.
- 2026-11-25: `tests/build-version.test.mjs` executes only `dist/version.js`; it does not extract or execute `dist/app.js`, `dist/graph.js`, or `dist/workspace.js`, and its version/cache-key/build-wiring assertions remain in scope. The browser-visible `[data-build-label]` assertion already exists in `browser-tests/backend-e2e.mjs`; no separate `buildLabel` bundle extraction remains to replace.
- 2026-11-25: Maintained commands now use source/domain/API tests, `test:backend`, and authenticated browser E2Es; the failing `test:legacy` alias was removed. The intentionally inactive old VM tests remain in the repository until their owners retire them: `core.test.mjs`, `deletion.test.mjs`, `inclusive-calendar.test.mjs`, `p0-integrity.test.mjs`, `prd5.test.mjs` local state/canonical hierarchy migration assertions → ticket 08; `graph.test.mjs` private force-layout assertions → 07h (observable projection is covered by `graph-projection-e2e.mjs`; no source graph module exists); `prd3-ui-contract.test.mjs`, `prd4.test.mjs`, `prd41.test.mjs`, `prd42.test.mjs`, and `prd43.test.mjs` bundle-based behavior assertions → replacement coverage in 07e-07h. `prd5.test.mjs` paste/Gantt behavior is replaced by 07g, while only its browser-storage migration assertion belongs to 08. These files are not invoked by any maintained npm script or CI `npm test` command.
- 2026-11-25: TDD guard `tests/domain-build.test.mjs` failed against the old `npm test` target, then passed after the script change. Verified `npm run test:all` (112 maintained source/domain/API tests, 59 backend tests, all four Chromium E2Es), `npm run check`, and `npm run check:backend`; all passed on the supplied Node 26.13.1. The `test:legacy` alias no longer exists. A repository search found no maintained npm/CI workflow invoking bundle extraction tests; only `check` syntax-checks generated app/graph/workspace assets.
