# 03: Encerrar compromisso vigente ao trocar o responsável

**What to build:** Quando a pessoa responsável por uma atividade muda, o compromisso vigente deixa de valer para a nova atribuição, permanece consultável no histórico e o novo responsável pode aceitar um novo compromisso.

**Blocked by:** 02 — Aceitar compromisso individual pela pessoa responsável.

**Status:** done

- [x] A troca de responsável encerra o compromisso vigente sem apagar seu histórico.
- [x] O compromisso encerrado não aparece como aceite vigente do novo responsável.
- [x] A nova pessoa responsável pode aceitar um novo compromisso para a atividade.
- [x] O histórico identifica a mudança de responsável e os compromissos associados antes e depois da mudança.

## Comments

- 2026-11-24: Implementado em `server/service.mjs`; acordos ativos e pendentes são encerrados na persistência da troca, e o evento de histórico registra os IDs encerrados. Teste de regressão em `tests/commitments-api.test.mjs` confirma a preservação dos aceites anteriores e o novo aceite pelo responsável atual. `npm run test:all`: 9/9 + 56/56; teste focado: 25/25.
