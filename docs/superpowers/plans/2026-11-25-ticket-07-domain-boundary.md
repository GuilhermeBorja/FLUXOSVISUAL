# Ticket 07 Implementation Plan

> **For agentic workers:** Execute this plan task by task with TDD. The primary agent implements each task in this session and runs a final independent code review.

**Goal:** Separate the authoritative domain logic from browser bundles and verify its contracts through direct source tests and observable server/browser flows.

**Architecture:** Add an authored ESM domain source under `src/`; keep `server/domain.mjs` and its `createDomain(initial, actorId, onDecision)` contract while delegating to that source. Build a browser artifact from the same source, load it before UI scripts, and replace test-time bundle extraction with source and public-flow tests.

**Tech Stack:** Node.js ESM, existing esbuild dependency, node:test, existing Playwright E2E.

**Spec:** `docs/superpowers/specs/2026-11-25-ticket-07-domain-boundary-design.md`; ticket `.scratch/compromissos-avanco-calendario/issues/07-desacoplar-dominio-do-bundle.md`.

## Global Constraints

- Preserve current permission rules, validation, state transitions, schedule behavior, and startup.
- Keep the existing `server/domain.mjs` exports and `createDomain(initial, actorId, onDecision)` caller contract.
- Add no dependency; use the installed esbuild and test stack.
- Keep classic browser script order, with the shared domain artifact loaded before its consumers.

## Review Focus

- Unauthorized operations still return the same forbidden result and decision callback data.
- Empty state and generated/forced IDs retain existing behavior.
- Valid, incomplete, and cyclic schedule inputs keep current outcomes.
- Backend projection, commands, and audits preserve their existing contract.
- Missing or failed browser domain loading does not silently start with a second implementation.

## File Map

- Create `src/domain.mjs`: canonical source for the domain operations and schedule rules currently recovered from bundles.
- Create `scripts/build-domain.mjs`: build the browser artifact from `src/domain.mjs` using existing esbuild.
- Create `tests/domain-source.test.mjs`: direct-source behavior and schedule contract tests.
- Modify `server/domain.mjs`: import source code directly; preserve exports and caller API.
- Modify `dist/index.html` and build scripts: load the generated domain artifact before browser consumers.
- Modify `dist/app.js` and `dist/workspace.js`: delegate moved rules to the explicit domain API.
- Modify `tests/prd3-ui-contract.test.mjs`, `tests/prd5.test.mjs`, and any other bundle-inspection tests found in the inventory: use direct domain tests or browser/API behavior checks.
- Modify the relevant browser E2E file only for observable UI integration contracts.

### Task 1: Create the canonical source and direct tests

**Interfaces:**
- Preserve the existing `createDomain(initial, actorId, onDecision)` behavior and returned server-facing methods.
- Export a deliberate browser API from the same ESM source; do not expose VM context internals.

- [x] Write direct tests for empty-state creation, authorization decisions and callback output, and schedule analysis for a valid relation and an invalid cycle.
- [x] Run `node --test tests/domain-source.test.mjs`; confirm it fails because the source module/API is absent.
- [x] Implement the initial source module API and schedule analyzer from the existing behavior.
- [x] Run the focused test and the existing backend suite; focused tests pass (3/3), backend passes (56/56).
- [ ] Commit the source and tests to the current branch.

### Task 2: Remove server bundle execution

**Interfaces:**
- `server/domain.mjs` re-exports or adapts the source API while keeping all existing imports stable.

- [x] Add a regression test that initializes `createDomain` and exercises its public methods without reading files under `dist/`.
- [x] Run the focused test; confirm it fails against the current bundle-backed implementation or detects its dependency.
- [x] Replace `vm.Script`, `dist/app.js` reads, and `scheduleAnalysis` slicing with direct source imports.
- [x] Run `node --test tests/backend*.test.mjs` and confirm existing service behavior passes.
- [ ] Commit the server change and regression test.

### Task 3: Use the same source in the browser

**Interfaces:**
- The browser artifact exposes the same domain API as `src/domain.mjs`; `dist/index.html` loads it before `app.js`, `backend.js`, and `workspace.js`.

- [x] Add a failing build/startup contract test asserting the browser artifact is generated and loaded before its consumers.
- [x] Run that test and confirm it fails because the artifact and script reference are missing.
- [x] Build the artifact with the existing esbuild dependency and update browser consumers to call the shared domain API.
- [x] Run the browser backend E2E that covers a measurement flow and a schedule/relationship flow; confirm visible behavior and saved API state remain unchanged.
- [ ] Commit the build and browser integration.

### Task 4: Remove bundle-code extraction from behavior tests

**Interfaces:**
- Domain assertions import `src/domain.mjs`; UI assertions use public browser/API behavior or observable HTML/CSS.

- [x] Inventory every test that slices or regex-extracts functions/constants from `dist/app.js`, `dist/workspace.js`, or `dist/graph.js`; record each behavioral assertion and its owner.
- [x] Convert retained domain/API/UI contracts to source-domain or authenticated browser/API tests before removing them from maintained commands.
- [x] Run the focused tests and verify the new test-workflow guard fails against the old script, then passes with the maintained source/API suite.
- [x] Remove legacy bundle tests from maintained commands. Preserve their files only as inactive, ticket-owned records: UI behavior under 07g/07h and localStorage/offline migration assertions under 08.
- [x] Run `npm run test:all`, `npm run check`, and `npm run check:backend`. The maintained `test:all` includes source/domain/API tests and all authenticated backend browser E2Es; offline/static VM tests are excluded and assigned to tickets 07g/07h or 08.
- [ ] Commit the migrated tests and update ticket 07 status/comments with the evidence.

## Final verification

With the provided portable Node directory temporarily added to `PATH`, run `npm run test:all`, `npm run check`, and `npm run check:backend`. `test:all` includes maintained domain/API tests, backend tests, and authenticated browser E2Es. Legacy VM tests for browser bundles are not a maintained gate; their UI owners are 07g/07h and offline/local-storage retirement is owned by ticket 08. Start the app with `npm start` and verify the health endpoint plus one authenticated browser flow. Then run the code-review skill against the pre-task commit and commit the completed work to `revisao-02-oficial` using the connected GitHub workflow if local Git remains unavailable.
