# 07c: Integracao do dominio no navegador

**What to build:** Build the browser domain API from the maintained source and have browser consumers delegate moved rules to it.

**Blocked by:** 07b.

**Status:** done

- [x] Add a build step for the browser-compatible domain artifact from source.
- [x] Load the artifact before its consumers while preserving application startup.
- [x] Replace duplicate browser rules for moved operations with calls into the shared API.
- [x] Cover startup and visible flows with browser/API regression tests.
- [x] Run relevant E2E flows.

## Comments

- This ticket completes the browser side of ticket 07 after server domain operations are available from source.
- 2026-11-25: Added `scripts/build-domain.mjs`; `npm run build` now builds `dist/domain.js` from `src/domain.mjs`, then versions/cache-busts the scripts. `dist/index.html` loads the API before graph, app, backend, and workspace consumers. Workspace schedule analysis delegates to `FluxosDomain.analyzeSchedule`.
- 2026-11-25: `tests/domain-build.test.mjs` and `tests/build-version.test.mjs` cover build wiring and script order; `npm run check` includes syntax validation for `dist/domain.js`. Browser E2E checks that the loaded API executes schedule analysis and displays the build version. The build passed after running the esbuild step outside the sandbox (sandbox denied esbuild's parent-directory scan).
- 2026-11-25: `browser-tests/backend-e2e.mjs` passed Chromium flows for browser-domain startup, login, shared tree/TI, user editing, confirmed save, stale-edit conflict, attachments/download, preferences, logout, and 1366/1920 layouts.
