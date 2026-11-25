# 07f: Contratos publicos de autorizacao e visibilidade

**What to build:** Verify that source-backed server APIs preserve authorization, relation visibility, event history, and atomic rollback contracts formerly exercised through the client VM.

**Blocked by:** 07b, 07e.

**Status:** done

- [x] Map relevant assertions in `core.test.mjs`, `deletion.test.mjs`, `p0-integrity.test.mjs`, and `prd4.test.mjs` to public commands, projections, and source API contracts.
- [x] Test that a relation is visible only when both endpoint items are visible to the actor.
- [x] Test denied subtree moves, relation edits/removal, and deletions for no partial state or event writes.
- [x] Verify successful parent moves and relation edits preserve item/relation identity, baselines, and audit history through the backend API.
- [x] Run focused backend security and command tests; full backend suite is reserved for final acceptance.

## Comments

- The source GPO and deletion suites already cover several denial cases. Add public API checks only for gaps between source operations and command/service behavior.
- Preserve workspace isolation and authorization as server-owned contracts.
- 2026-11-25: Added a public projection contract for both hidden relation endpoints and subsequent restoration when both become visible. Added command API coverage for relation retarget identity/baseline/audit preservation and for denied moves, relation edits, deletions, and event/revision rollback. Focused security and command regressions passed.
