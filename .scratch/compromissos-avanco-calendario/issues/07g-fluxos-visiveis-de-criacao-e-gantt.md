# 07g: Fluxos visiveis de criacao e Gantt

**What to build:** Replace VM-based UI assertions for pasted hierarchies, schedule display, and Gantt relation/trend editing with browser tests against the Node server.

**Blocked by:** 07c, 07e, 07f.

**Status:** done

- [x] Cover pasted hierarchy input, parent assignment, durations, and sequential TI creation through visible controls and persisted API state.
- [x] Cover Gantt creation, selection, editing, and deletion of TI relations through visible controls, including the resulting schedule and history.
- [x] Cover displayed schedule dates, inclusive ranges, zero-duration milestones, baseline/commitment/trend layers, and trend drag where supported by the existing UI.
- [x] Cover a visible error path and confirm the server rejects invalid or unauthorized edits without partial persistence.
- [x] Replace the maintained behavior checks with authenticated browser assertions; retire the corresponding VM assertions from maintained commands after replacement coverage passes.
- [x] Run the Chromium E2E flow against the local Node server and confirm there are no browser exceptions or 5xx responses.

## Comments

- Existing backend E2E already covers pasted sequential activities and Gantt item editing. Extend that flow instead of creating parallel fixtures where practical.
- 2026-11-25: `browser-tests/backend-e2e.mjs` verifies pasted multiline hierarchy/sequence persistence, visible Gantt TI create/edit/delete and schedule/history, zero-duration inclusive dates, and baseline/trend/proposal/agreement layers. A real date drag on a 10-day milestone opens a visible commitment proposal; submitting it preserves the plan and baseline. The owner accepts it through the visible operations panel, and the Gantt then shows the active agreement. The E2E also sends an authenticated, CSRF-valid direct `updateRelation` command as a user without `edit_relation`; it receives HTTP 403, and the persisted revision, domain events, and relation remain unchanged. Focused command: `& 'C:\Users\guilherme.borja\Downloads\node-v26.13.1-win-x64\node-v26.13.1-win-x64\node.exe' browser-tests/backend-e2e.mjs` (exit 0; output: `Backend Chromium: login, shared tree/TI, 2 users, confirmed save, stale-edit draft, attachment/download, user preferences, logout and 1366/1920 layouts passed.`). The visible paste parity check creates an identical tree from literal `\\n` sequences plus four-space indentation, and compares persisted parent assignment, durations, schedule dates, and sequential TIs to input with real newlines. The parser does not decode literal `\\t` tokens; this E2E uses the documented four-space indentation form, so no production change was needed.
- 2026-11-25: The maintained `npm test` and `test:all` commands no longer invoke the legacy VM files. `prd3-ui-contract.test.mjs`, `prd42.test.mjs`, `prd43.test.mjs`, and the non-migration behavior checks in `prd5.test.mjs` remain preserved but inactive; their supported behavior is exercised by the source/API and visible browser contracts above. The local-state migration assertion in `prd5.test.mjs` belongs to ticket 08.
