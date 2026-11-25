# 07a: Fundacao do dominio no source

**What to build:** Establish `src/domain.mjs` as the maintained source for domain primitives, permissions, state validation, and schedule analysis, with direct tests for those contracts.

**Blocked by:** None.

**Status:** done

- [x] Export the existing server-facing constants and helpers from the source module.
- [x] Move shared permission and state-validation behavior into the source module without changing observable results.
- [x] Cover these contracts with direct tests, including invalid state and authorization decisions.
- [x] Keep server imports stable while it transitions to the source module.
- [x] Run focused source tests and the backend suite.

## Comments

- Split from ticket 07 to make the foundational domain extraction independently testable. Ticket 07 remains the umbrella acceptance and stays open until all dependent work is complete.
- 2026-11-25: Completed. `src/domain.mjs` now owns shared constants/helpers, permission evaluation, state validation and schedule analysis; `server/domain.mjs` imports/re-exports these APIs, and server error handling recognizes `DomainError`. Source tests passed 4/4; backend suite passed 56/56 on the provided Node 26.13.1 runtime. The bundle-backed `createDomain` remains for 07b.
