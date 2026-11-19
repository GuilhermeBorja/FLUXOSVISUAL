# Revisão de Compromissos e Tendência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir a PRD6 do FLUXOSVISUAL para controlar compromissos versionados, fatos de execução e tendência recalculável, sem perder auditoria, GPO ou histórico.

**Architecture:** A persistência continua em SQLite e o GPO continua a autorizar cada comando no servidor. O novo núcleo separa `Commitment` (acordo aprovado), `Measurement` (fato imutável) e `TrendSnapshot` (projeção derivada), com calendário e motor de tendência testáveis sem DOM. A interface consome uma projeção única do backend para operação, Gantt e mapa executivo.

**Tech Stack:** Node.js 24, módulos ES, SQLite `node:sqlite`, DOM sem framework, D3 Force apenas onde ainda permanecer necessário, Playwright e `node:test`.

**Spec:** `docs/PRD-REVISAO-COMPROMISSOS-TENDENCIA.md` (deve acompanhar a branch de implementação; o documento foi elaborado contra a `main` remota da PRD6).

## Global Constraints

- Trabalhar contra a `main` remota da PRD6; não implementar sobre o MVP local sem backend.
- Preservar autenticação, GPO server-side, concorrência otimista, transações SQLite e auditoria append-only.
- Persistir somente relações TI entre itens-folha; `lagDays` continua opcional.
- Linha de base e compromisso aprovado nunca podem ser sobrescritos por medição ou tendência.
- Executor registra percentual, ocorrência e evidência; não informa nova data nem duração remanescente.
- Novos projetos usam calendário configurável; projetos migrados mantêm dias corridos até conversão explícita.
- Não persistir posições livres do mapa; preservar apenas a preferência de agrupamento.
- Sem nova dependência de runtime. Node deve permanecer `>=24.0.0 <25`.

## Review Focus

- Medição registrada fora de ordem: recalcular a tendência por `effectiveAt`, preservar `recordedAt` e não corromper o último fato válido. **Task 2.**
- Ausência de medição: marcar pendência e deslocar tendência sem criar medição fictícia de 0%. **Task 3.**
- Migração parcial ou repetida: ser idempotente, manter projetos legados em dias corridos e não duplicar compromissos/medições. **Task 1.**
- Relação TI com predecessor concluído antecipadamente e defasagem: antecipar a obrigação da sucessora no calendário aplicável. **Task 2.**
- Usuário sem permissão tentando medir, ajustar restante ou aceitar acordo: responder 403 e não criar evento, snapshot nem alteração de revisão. **Task 3.**

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `server/migrations/003_commitments_trends.mjs` | Migração idempotente de dados PRD6 para compromissos, medições e configurações de calendário. |
| `server/calendar.mjs` | Cálculo puro de dias/horas úteis e adição de duração por calendário. |
| `server/trend.mjs` | Projeção pura de tendência, estados derivados, contadores e snapshots. |
| `server/domain.mjs` | Validação de estado, novas operações GPO e interfaces do domínio. |
| `server/commands.mjs` | Comandos de medição, bloqueio, duração remanescente, proposta e aceite de compromisso. |
| `server/service.mjs` | Tabelas, leitura/persistência, projeção e transações de domínio. |
| `server/index.mjs` | Rotas REST e processador agendado de frequência vencida. |
| `dist/app.js` | Modelo compartilhado e formulários de criação/edição sem datas livres. |
| `dist/workspace.js` | Tela operacional, horizonte, Gantt em camadas e integração da projeção. |
| `dist/graph.js` | Layout determinístico do mapa executivo; remove arraste e salvamento de coordenadas. |
| `dist/styles.css` | Estados, contadores, barras compactas e acessibilidade visual. |
| `tests/trend-engine.test.mjs` | Testes unitários de calendário, cadeia TI e tendência. |
| `tests/commitments-api.test.mjs` | Migração, GPO, comandos REST, auditoria e snapshots. |
| `browser-tests/trend-workspace-e2e.mjs` | Fluxos reais de atualização, Gantt, horizonte e mapa. |

### Task 1: Persistência, tipos de domínio e migração idempotente

**Files:**
- Create: `server/migrations/003_commitments_trends.mjs`
- Create: `tests/commitments-api.test.mjs`
- Modify: `server/service.mjs`
- Modify: `server/domain.mjs`
- Modify: `server/commands.mjs`
- Modify: `docs/BACKEND-API.md`

**Interfaces:**
- Produces `runCommitmentsTrendMigration(storage): void`.
- Produces estado com `projectCalendar`, `commitments`, `measurements`, `trendSnapshots` e `measurementPolicies`.
- Produces operações GPO: `record_measurement`, `adjust_remaining_duration`, `manage_commitment` e `manage_calendar`.

- [ ] **Step 1: Escrever testes de migração no `tests/commitments-api.test.mjs`**

Cobrir: projeto legado recebe calendário `legacy-calendar-days`; item com `baselineStartAt/baselineDueAt` gera baseline imutável; `target*` ou `replannedDueAt` gera compromisso vigente; `progressPercent` gera uma única medição de origem `migration`; segunda execução não altera quantidade nem IDs.

- [ ] **Step 2: Executar o teste de migração e confirmar falha**

Run: `node --test tests/commitments-api.test.mjs`  
Expected: FAIL porque a migração e as coleções ainda não existem.

- [ ] **Step 3: Criar `runCommitmentsTrendMigration(storage): void`**

Adicionar tabelas normalizadas para compromisso, parte do acordo, medição, snapshot e calendário, todas com `workspace_id`, chaves estáveis e índices por item/data. Registrar `003_commitments_trends` em `schema_migrations`; usar uma única transação SQLite. Não apagar os campos legados nesta entrega: mantê-los apenas para leitura/rollback até a Task 8.

- [ ] **Step 4: Estender validação e GPO em `server/domain.mjs` e o bootstrap em `server/service.mjs`**

Definir entidades: `Commitment { id, itemId, kind: 'baseline'|'agreement', version, startAt, dueAt, scopeNote, status: 'proposed'|'active'|'superseded', proposedBy, acceptedAt }`; `Measurement { id, itemId, percent, occurrence, effectiveAt, recordedAt, actorId, description, evidenceIds, correctionOfId? }`; `TrendSnapshot { id, itemId, causedByEventId, calculatedAt, startAt, dueAt, state }`. Criar perfis-base de planejamento, execução, aprovador e consulta somente como templates GPO configuráveis.

- [ ] **Step 5: Executar teste e testes de regressão de backend**

Run: `node --test tests/commitments-api.test.mjs && npm run test:backend`  
Expected: PASS; migração é idempotente e a suíte PRD6 permanece verde.

- [ ] **Step 6: Commit**

```bash
git add server/migrations/003_commitments_trends.mjs server/service.mjs server/domain.mjs server/commands.mjs tests/commitments-api.test.mjs docs/BACKEND-API.md
git commit -m "feat: persist commitments and measurements"
```

### Task 2: Motor puro de calendário e tendência

**Files:**
- Create: `server/calendar.mjs`
- Create: `server/trend.mjs`
- Create: `tests/trend-engine.test.mjs`
- Modify: `server/domain.mjs`
- Modify: `server/service.mjs`

**Interfaces:**
- Consumes: coleções criadas na Task 1.
- Produces `addWorkingDuration(startAt, duration, calendar): ISODateTime`.
- Produces `calculateTrend({ items, relations, commitments, measurements, calendars, asOf }): TrendProjection`.
- `TrendProjection` inclui `itemTrendById`, `releaseAt`, `derivedState`, `counters` e `affectedItemIds`.

- [ ] **Step 1: Escrever testes em `tests/trend-engine.test.mjs`**

Usar o caso do poço do elevador: atividade de 2 dias medida 25% no dia 2, 66% no dia 3 e 100% no dia 3. Testar que o percentual esperado é apenas referência, que o motor não inventa duração remanescente, que a conclusão libera a TI e que o restante da cadeia se desloca conforme calendário.

Adicionar testes: TI+6 dias; predecessor antecipado; calendário legado corrido; calendário útil com feriado; marco de duração zero; ciclo TI rejeitado; bloqueio pausa apenas o contador de execução.

- [ ] **Step 2: Executar os testes e confirmar falha**

Run: `node --test tests/trend-engine.test.mjs`  
Expected: FAIL porque `calendar.mjs` e `trend.mjs` não existem.

- [ ] **Step 3: Implementar `server/calendar.mjs`**

Criar calendário serializável com `timezone`, `workingWeekdays`, janelas de trabalho e feriados. Para o legado, implementar `calendar.kind === 'elapsed_days'`; para novos projetos, `working_time`. Centralizar arredondamento e fuso para que Gantt, alertas e servidor nunca façam contas diferentes.

- [ ] **Step 4: Implementar `calculateTrend(...): TrendProjection` em `server/trend.mjs`**

Ordenar atividades-folha por topologia TI. Para cada item: usar compromisso ativo como referência, a última medição por `effectiveAt`, início real no primeiro percentual positivo e fim real em 100%. Sem ajuste do planejamento, carregar a duração remanescente planejada após a data/hora de status; nunca converter percentual em produtividade. Propagar TI e `lagDays` com o calendário da sucessora. Gerar `not_released`, `released`, `in_progress`, `completed`, `measurement_pending` e `blocked`, mais contadores de ciclo.

- [ ] **Step 5: Integrar o motor no domínio sem executar código de UI no servidor**

Substituir a extração textual de `scheduleAnalysis` de `dist/workspace.js` no `server/domain.mjs` por import explícito de `server/trend.mjs`. Manter um adaptador de compatibilidade temporário para a projeção PRD6, depois removê-lo na Task 8.

- [ ] **Step 6: Executar testes**

Run: `node --test tests/trend-engine.test.mjs && npm run test:backend`  
Expected: PASS; os testes provam cálculo determinístico, calendário e cadeia TI.

- [ ] **Step 7: Commit**

```bash
git add server/calendar.mjs server/trend.mjs server/domain.mjs server/service.mjs tests/trend-engine.test.mjs
git commit -m "feat: add calendar and trend engine"
```

### Task 3: Comandos, frequência e projeção REST

**Files:**
- Modify: `server/commands.mjs`
- Modify: `server/service.mjs`
- Modify: `server/index.mjs`
- Modify: `tests/commitments-api.test.mjs`
- Modify: `docs/BACKEND-API.md`

**Interfaces:**
- Consumes: `calculateTrend` e entidades da Tasks 1–2.
- Produces comandos `recordMeasurement`, `correctMeasurement`, `setBlocked`, `adjustRemainingDuration`, `proposeCommitment`, `acceptCommitment` e `setMeasurementPolicy`.
- Produces `processMeasurementDue(workspaceId, asOf): ProcessResult`.

- [ ] **Step 1: Escrever testes REST e de autorização**

Cobrir: executor pode registrar medição factual, mas recebe 403 ao ajustar restante/propor compromisso; planejamento ajusta restante mas não altera medição; ocorrência `no_issue` não exige descrição; bloqueio/divergência/correção exige descrição; efetivação futura é rejeitada; correção referencia a medição corrigida; acordo exige aceite de demandante e responsável.

Adicionar teste de frequência vencida: cria `measurement_pending`, snapshot e auditoria, preservando o percentual anterior.

- [ ] **Step 2: Executar os testes e confirmar falha**

Run: `node --test tests/commitments-api.test.mjs`  
Expected: FAIL com comandos/rotas inexistentes.

- [ ] **Step 3: Implementar comandos transacionais em `server/commands.mjs`**

Cada comando deve validar GPO antes de mutar e gravar evento de auditoria com `effectiveAt`, `recordedAt`, ator e correlação. `recordMeasurement` grava fato imutável e recalcula; `adjustRemainingDuration` registra decisão de planejamento e recalcula; `acceptCommitment` só promove proposta após os dois aceites exigidos.

- [ ] **Step 4: Expor rotas e processador em `server/index.mjs`**

Adicionar rotas de comando sob o padrão existente de workspace e ampliar `/projection` para devolver `trend`, `commitments`, `measurementStatus`, `horizon` e `flowMap`. Rodar `processMeasurementDue` no início da projeção e em intervalo de servidor configurável; ele deve ser idempotente por item/janela de frequência.

- [ ] **Step 5: Executar validação**

Run: `node --test tests/commitments-api.test.mjs && npm run check:backend && npm run test:backend`  
Expected: PASS; comandos proibidos não deixam eventos, snapshots ou revisões parciais.

- [ ] **Step 6: Commit**

```bash
git add server/commands.mjs server/service.mjs server/index.mjs tests/commitments-api.test.mjs docs/BACKEND-API.md
git commit -m "feat: add measurement and commitment commands"
```

### Task 4: Atualização operacional e detalhamento progressivo

**Files:**
- Modify: `dist/app.js`
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Modify: `tests/commitments-api.test.mjs`
- Create: `browser-tests/trend-workspace-e2e.mjs`

**Interfaces:**
- Consumes: projeção REST da Task 3.
- Produces formulário `recordMeasurement(itemId)` e ações de detalhar, bloquear e ajustar duração restritas por GPO.

- [ ] **Step 1: Escrever cenário E2E de medição**

Criar projeto com cadeia TI e logar como executor. Confirmar que a tela mostra percentual previsto na data/hora escolhida, aceita percentual + ocorrência `Sem impedimento` sem texto, exige texto em bloqueio, não apresenta campo de nova data/duração e atualiza a tendência após salvar.

- [ ] **Step 2: Executar E2E e confirmar falha**

Run: `node browser-tests/trend-workspace-e2e.mjs`  
Expected: FAIL porque os seletores e o fluxo ainda não existem.

- [ ] **Step 3: Substituir edição direta de `progressPercent` pelo registro de medição**

No painel do item, exibir data/hora efetiva com padrão “agora”, percentual esperado, último percentual real e ocorrência. Enviar o comando novo; manter `progressPercent` apenas como campo derivado de leitura. Não abrir modal secundário após a medição.

- [ ] **Step 4: Implementar detalhamento sem apagamento de passado**

Quando atividade iniciada ganha filhos, converter o pai para agrupador e registrar `realizedBeforeBreakdown` como histórico. Permitir TI e medição apenas em folhas; filho novo por padrão detalha escopo existente. Exigir proposta de mudança de escopo quando o usuário marcar expansão.

- [ ] **Step 5: Executar E2E e checagem de frontend**

Run: `node browser-tests/trend-workspace-e2e.mjs && npm run check`  
Expected: PASS; executor não consegue produzir novo prazo por formulário.

- [ ] **Step 6: Commit**

```bash
git add dist/app.js dist/workspace.js dist/styles.css tests/commitments-api.test.mjs browser-tests/trend-workspace-e2e.mjs
git commit -m "feat: add operational measurement flow"
```

### Task 5: Compromissos bilaterais, ações e horizonte

**Files:**
- Modify: `dist/app.js`
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Modify: `browser-tests/trend-workspace-e2e.mjs`

**Interfaces:**
- Consumes: compromissos e `horizon` da Task 3.
- Produces painéis `Minhas ações` e `Horizonte`.

- [ ] **Step 1: Escrever cenários E2E para acordo e horizonte**

Testar que proposta mostra escopo, prazo, responsável e condições; demanda e responsável precisam aceitar; acordo anterior continua visível. Testar que uma atividade aparece uma única vez em Disponíveis agora, Hoje, Esta semana, Próxima semana, Restante do mês ou Próximo mês conforme início de tendência.

- [ ] **Step 2: Executar E2E e confirmar falha**

Run: `node browser-tests/trend-workspace-e2e.mjs`  
Expected: FAIL porque não há ações/horizonte baseados em tendência.

- [ ] **Step 3: Criar a interface de compromisso e ação**

Usar o fluxo atual de aprovação apenas como infraestrutura visual quando for possível; não reutilizar a regra de um revisor. Mostrar aceites pendentes somente em `Minhas ações`, sem notificações repetitivas.

- [ ] **Step 4: Criar horizonte enxuto**

Renderizar seis seções fixas ordenadas por início de tendência. Cada cartão deve mostrar ação, compromisso vigente, tendência e contador de ciclo; não duplicar o mesmo item entre seções nem confundir data de baseline com tendência.

- [ ] **Step 5: Executar E2E**

Run: `node browser-tests/trend-workspace-e2e.mjs`  
Expected: PASS; aceite bilateral e classificação exclusiva no horizonte são demonstrados.

- [ ] **Step 6: Commit**

```bash
git add dist/app.js dist/workspace.js dist/styles.css browser-tests/trend-workspace-e2e.mjs
git commit -m "feat: add commitments actions and horizon"
```

### Task 6: Gantt em camadas e histórico sob demanda

**Files:**
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Modify: `browser-tests/trend-workspace-e2e.mjs`

**Interfaces:**
- Consumes: `TrendProjection`, compromissos versionados e snapshots.
- Produces `renderTrendGantt(projection, options)`.

- [ ] **Step 1: Escrever cenário E2E visual/semântico**

Validar linha de data/hora de status, barra de tendência, marcadores discretos de baseline e compromisso ativo, indicador `↺ n acordos`, e expansão da linha que revela baseline, acordos anteriores, acordo vigente e tendência.

- [ ] **Step 2: Executar E2E e confirmar falha**

Run: `node browser-tests/trend-workspace-e2e.mjs`  
Expected: FAIL porque o Gantt atual ainda usa apenas datas planejadas/legadas.

- [ ] **Step 3: Implementar renderização compacta**

Manter árvore e setas TI existentes. Na faixa padrão, renderizar apenas tendência + marcadores; no item selecionado, abrir faixas de histórico no próprio row group. Garantir contraste e rótulos acessíveis, sem transformar cada acordo em uma barra permanente.

- [ ] **Step 4: Executar E2E e checagem**

Run: `node browser-tests/trend-workspace-e2e.mjs && npm run check`  
Expected: PASS; o histórico só ocupa espaço quando solicitado.

- [ ] **Step 5: Commit**

```bash
git add dist/workspace.js dist/styles.css browser-tests/trend-workspace-e2e.mjs
git commit -m "feat: show commitments and trends in gantt"
```

### Task 7: Mapa executivo determinístico por responsabilidade

**Files:**
- Modify: `dist/graph.js`
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Modify: `server/service.mjs`
- Modify: `browser-tests/trend-workspace-e2e.mjs`

**Interfaces:**
- Consumes: `flowMap` da Task 3 e preferência `graphGrouping`.
- Produces `layoutFlowMap(nodes, relations, grouping): PositionedFlowMap`.

- [ ] **Step 1: Escrever testes de algoritmo e E2E**

Adicionar teste unitário em `tests/trend-engine.test.mjs`: posição X respeita ordem topológica TI e, no empate, início de tendência; agrupamento por responsável, empresa e projeto muda apenas contêineres. E2E: arrastar nó não altera posição persistida; filtro inicial contém pendências, bloqueios ou tendência após compromisso e suas vizinhas diretas.

- [ ] **Step 2: Executar testes e confirmar falha**

Run: `node --test tests/trend-engine.test.mjs && node browser-tests/trend-workspace-e2e.mjs`  
Expected: FAIL porque o mapa atual usa força/arraste e `graphPositions`.

- [ ] **Step 3: Implementar `layoutFlowMap` e remover escrita de posições**

Trocar a simulação/gestos de nós por layout em colunas topológicas e linhas determinísticas dentro de cada grupo. Preservar zoom, pan, seleção, acessibilidade e criação/edição TI onde aplicável. Remover `graphPositions` de `preferenceKeys` e ignorar dados legados; preservar `graphGrouping`.

- [ ] **Step 4: Ajustar cartões e leitura de responsabilidade**

Exibir título, estado/ação necessária, tendência versus compromisso, e responsável quando o agrupamento não for responsável. Exibir `Liberada há X`, `Em execução há X`, `Bloqueada há X`, ou concluída com `Ciclo total / aguardou início / executou`. Nunca atribuir atraso a uma sucessora apenas por esperar predecessor.

- [ ] **Step 5: Executar testes**

Run: `node --test tests/trend-engine.test.mjs && node browser-tests/trend-workspace-e2e.mjs && npm run check`  
Expected: PASS; mesma projeção produz o mesmo mapa e nenhum arraste grava preferência.

- [ ] **Step 6: Commit**

```bash
git add dist/graph.js dist/workspace.js dist/styles.css server/service.mjs tests/trend-engine.test.mjs browser-tests/trend-workspace-e2e.mjs
git commit -m "feat: replace free graph with executive flow map"
```

### Task 8: Retirada de compatibilidade, regressão e aceite de migração

**Files:**
- Modify: `server/domain.mjs`
- Modify: `server/service.mjs`
- Modify: `server/commands.mjs`
- Modify: `dist/app.js`
- Modify: `dist/workspace.js`
- Modify: `package.json`
- Modify: `docs/BACKEND-API.md`
- Create: `docs/COMMITMENTS-TRENDS-ACCEPTANCE.md`

**Interfaces:**
- Consumes: entregas das Tasks 1–7.
- Produces comando de validação completo e checklist operacional de implantação.

- [ ] **Step 1: Escrever testes de regressão de compatibilidade**

Cobrir workspace PRD6 com itens, TI, anexos, aprovação comum e preferências antigas. Confirmar que migração mantém leitura/auditoria, que `graphPositions` é ignorado sem erro, e que não há dependência do texto extraído de `dist/workspace.js` para o servidor.

- [ ] **Step 2: Executar a suíte e confirmar falhas residuais**

Run: `npm run test:all && npm run test:backend:browser`  
Expected: identificar qualquer contrato PRD6 que ainda esteja usando campo de cronograma legado.

- [ ] **Step 3: Remover adaptadores temporários e consolidar scripts**

Eliminar o acoplamento servidor→`dist/workspace.js`, retirar campos legados somente após a migração estar coberta por teste e trocar os scripts `test`/E2E para incluir as novas suítes. Não remover dados legados se um backup restaurado ainda precisar deles; nesse caso, manter leitura compatível e documentar janela de remoção.

- [ ] **Step 4: Produzir `docs/COMMITMENTS-TRENDS-ACCEPTANCE.md`**

Incluir roteiro manual de: baseline, medição sem impedimento, pendência vencida, ajuste de restante, acordo bilateral, detalhamento, TI+lag, Gantt expandido, mapa por responsável e permissões cruzadas.

- [ ] **Step 5: Executar validação final**

Run: `npm run check && npm run check:backend && npm run test:all && npm run test:backend:browser`  
Expected: PASS em todas as suítes; sem erro de console ou resposta 5xx nos cenários E2E.

- [ ] **Step 6: Commit**

```bash
git add server dist tests browser-tests package.json docs
git commit -m "chore: finalize commitments and trends revision"
```

## Sequência de entrega

1. **Tasks 1–3:** núcleo confiável; não liberar interface de produção antes desta passagem.
2. **Tasks 4–5:** operação de obra e acordos; liberar para piloto controlado.
3. **Tasks 6–7:** leitura de planejamento/diretoria; liberar após validar dados reais do piloto.
4. **Task 8:** retirar compatibilidade somente após backup restaurável e aceite do piloto.

## Self-review

- **Cobertura do PRD:** compromissos, medições, ausência, calendário, TI+lag, hierarquia dinâmica, GPO, horizonte, Gantt, mapa e migração estão associados às Tasks 1–8.
- **Fora de escopo intencional:** relações II/TT/IF, proposta de data pelo executor, arraste persistente do mapa e novas dependências de runtime.
- **Dependências:** Task 2 usa o modelo da Task 1; Task 3 usa o motor; Tasks 4–7 só consomem projeções já persistidas; Task 8 fecha compatibilidade.
- **Risco residual:** a regra de “duração remanescente sem ajuste” precisa ser validada no piloto com dados reais antes de retirar definitivamente os campos legados.
