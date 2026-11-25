# 07: Desacoplar a lógica de domínio do bundle do navegador

**What to build:** A lógica de domínio pode ser desenvolvida e verificada sem depender de ler, compilar ou recortar código dos bundles do navegador, preservando o comportamento atual da aplicação.

**Blocked by:** None (can start immediately).

**Status:** done

**Blocked by:** 07a, 07b, 07c, 07d (umbrella acceptance remains open until each is complete).

## Comments

- 2026-11-25: Split implementation into 07a-07d so source primitives, server operations, browser integration, and bundle-test migration can be validated in separate steps. The initial direct source tests pass; the server no-bundle regression test currently fails because `server/domain.mjs` reads `dist/app.js`.
- 2026-11-25: The initial server bundle dependency was removed and `tests/server-domain-source.test.mjs` now passes with browser bundle reads forbidden. Subtickets 07a, 07b, and 07c are done. 07d remains open: full legacy run reports 81 failures in 340 tests, and UI/source test coverage still needs migration and gap review before the parent acceptance can be marked complete.
- 2026-11-25: 07d completed after 07e-07i added source/API/browser replacement coverage, removed the legacy test command from maintained workflows, and assigned offline/local-state migration assertions to ticket 08. `npm run test:all` passed 112 maintained source/domain/API tests, 59 backend tests, and all four Chromium E2Es; `npm run check` and `npm run check:backend` also passed. Old VM test files remain preserved but inactive; maintained test/build workflows do not execute bundle extraction.

- [x] A lógica de domínio possui uma fronteira explícita com a interface e seus artefatos compilados.
- [x] A aplicação continua iniciando e executando os fluxos existentes após a separação.
- [x] A verificação automatizada cobre os contratos observáveis entre domínio e interface, sem depender de detalhes internos do bundle.
- [x] A construção da aplicação deixa de depender de extração de lógica por busca de nomes ou recortes de código do bundle do navegador.
