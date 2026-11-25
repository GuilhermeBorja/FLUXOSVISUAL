# 07h: Fluxos visiveis de grafo, acessibilidade e configuracao

**What to build:** Replace bundle/VM assertions for graph behavior, pane interactions, and status presentation with observable browser contracts.

**Blocked by:** 07c.

**Status:** done

- [x] Cover graph projection and user interaction through the browser, including hierarchy visibility and relation endpoints.
- [x] Cover pane resizing and keyboard/accessibility controls through rendered DOM behavior.
- [x] Cover status colors, blocked/overdue indicators, and organization-specific configuration through the rendered UI.
- [x] Replace maintained graph, accessibility, status, and configuration checks with browser assertions; retire the corresponding internal-code checks from maintained commands.
- [x] Run Chromium E2E against the Node server and assert outcomes a user can observe.

## Comments

- Do not create a new graph implementation as part of this ticket. Keep changes limited to tests and the smallest integration fixes required by an observable regression.
- Browser verification: `browser-tests/backend-admin-e2e.mjs` covers the visible blocked item, keyboard opening of its detail panel, company-specific graph/status color, overdue badge, splitter keyboard resize and ARIA values, and pane focus/restore. `browser-tests/graph-projection-e2e.mjs` uses an isolated fixture with ordinary ready items to verify root projection, collapsed/expanded hierarchy, relation endpoints, and Enter activation. The blocked status fixture narrows the graph to its operational focus item by design; no production blocker found. The remaining broad checklist item to replace bundle/VM checks is still open.
- 2026-11-25: `npm run test:all` passed the admin and graph-projection Chromium flows with no browser errors. `graph.test.mjs` and `prd3-ui-contract.test.mjs`, `prd41.test.mjs`, `prd42.test.mjs`, and `prd43.test.mjs` remain preserved but are no longer invoked by maintained npm/CI commands. The test-only force-layout internals have no source graph module and are not a supported public contract; observable graph projection and interaction are covered by `graph-projection-e2e.mjs`.
