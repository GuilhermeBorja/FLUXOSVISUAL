# Ticket 07 — boundary for domain logic

Date: 2026-11-25

## Intent

Create an explicit source boundary for business and schedule rules so the server and browser build use maintained domain code, while preserving current application behavior. Tests should exercise the domain API directly and verify user-visible contracts through the browser or public server API. Build and test workflows must not read browser bundles to recover logic by function-name searches, regular-expression matches, or string slices.

## Goals

- Remove `vm.Script` execution of `dist/app.js` and extraction of `scheduleAnalysis` from `dist/workspace.js` in `server/domain.mjs`.
- Establish source modules outside `dist/` for the domain operations consumed by the server and UI.
- Build a browser-compatible artifact from that source and load it before consumers; the Node server imports the source module directly.
- Replace tests that extract domain functions from bundles with direct module tests. Cover UI and API behavior through observable contracts, using existing browser E2E and backend test patterns.
- Keep the change scoped to moving existing behavior and its tests. Preserve authorization, validation, state transitions, schedule semantics, and startup behavior.

## Non-goals

- Redesigning the interface or changing product rules.
- Replacing the current browser test framework or introducing dependencies.
- Rewriting unrelated static markup/style checks unless they inspect implementation internals that this ticket requires removing.

## Approach

Use an authored ESM module under `src/` as the canonical domain source. Move the operations and schedule calculation currently used through `server/domain.mjs` into that module with explicit inputs for state, actor, and authorization decisions. Have `server/domain.mjs` import the module directly. Build a browser artifact from the same source with the existing esbuild dependency and expose a deliberate browser API before the classic UI scripts run; update those consumers to delegate to it rather than keep a second copy of the moved rules.

Keep the existing `server/domain.mjs` exports and `createDomain(initial, actorId, onDecision)` caller contract stable while replacing its VM internals. Before test edits, inventory all bundle-inspection tests, including `tests/prd3-ui-contract.test.mjs` and `tests/prd5.test.mjs`; migrate behavior checks to source-domain tests or browser/API flows, and retain only checks of user-observable HTML/CSS and build wiring.

Test-first: add direct-source tests for the public domain operations and schedule contracts, and an integration test proving server projection/commands and the browser flow use those rules. Then remove bundle parsing from domain tests. Replace any remaining internal-bundle assertions in the affected contract suite with observable browser/API checks where they assert behavior. Keep assertions about the built artifact limited to build wiring (for example, the expected script is included), not function body text.

The existing UI is a set of classic scripts under `dist/`, and the server serves `dist/` as the web root. Preserve that loading model unless implementation evidence shows the shared module can be exposed with less glue and no behavior change.

## Alternatives considered

- **Duplicate a server-only domain implementation:** smaller initial frontend change, but rules would drift between server and browser. Rejected because the ticket calls for an explicit domain/UI boundary.
- **Keep extracting code from bundles with stable markers:** less code movement, but build and tests would still depend on bundle internals. Rejected because it leaves the stated failure mode in place.

## Acceptance evidence

- The server domain module has no bundle file reads, VM bundle execution, source slicing, or function-name extraction.
- The browser build consumes the same authored domain source.
- Direct domain tests cover exported operations and schedule rules; browser/API tests cover observable integration.
- Existing application and backend suites pass, and the app starts through the current Node server flow.
