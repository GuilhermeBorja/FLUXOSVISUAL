# 07b: Operacoes do dominio no source

**What to build:** Move the operations currently recovered from `dist/app.js` into explicit source modules, preserving the server domain API and command behavior.

**Blocked by:** 07a.

**Status:** done

- [x] Port domain mutations and queries to source modules with explicit state and authorization inputs.
- [x] Preserve generated and forced item IDs, deferred scheduling, authorization decisions, and error contracts.
- [x] Keep `server/domain.mjs` exports and `createDomain(initial, actorId, onDecision)` stable.
- [x] Integrate and verify item/hierarchy/relation operations.
- [x] Integrate and verify schedule, blocker, approval, template, GPO, registry, and deletion operations.
- [x] Prove command/service behavior with backend regression tests.
- [x] Remove server reads, VM execution, and slicing of browser bundles.

## Comments

- This is the server-side core of ticket 07 and depends on the shared primitives and tests in 07a.
- 2026-11-25: Direct-source slices are in progress for schedule/blockers, item/relation mutations, approvals/templates, and event/tree helpers. They are intentionally not wired into the server until parity checks cover each operation group.
- 2026-11-25: Completed composition of schedule/blocker, item/hierarchy/relation, approval/template, GPO, registry/event/tree, parent summary, and archive/deletion operations in `src/domain.mjs#createDomain`. `server/domain.mjs` is now a source-backed adapter preserving `HttpError` behavior. `tests/server-domain-source.test.mjs` verifies the API runs with reads of browser bundles forbidden. Combined source tests passed 72/72 and backend tests 56/56.
