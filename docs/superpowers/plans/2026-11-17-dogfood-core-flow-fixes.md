# Correções do fluxo central de acompanhamento — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os sete achados do dogfood e comprovar o fluxo medição → proposta → aprovação no navegador.

**Architecture:** Manter o domínio existente e corrigir os contratos nas bordas: ordenação das medições, autorização dos compromissos e renderização do painel. Evitar novas dependências e mudanças amplas no cronograma.

**Tech Stack:** Node.js 24, SQLite, JavaScript sem framework, `node:test`, Playwright existente e agent-browser.

**Spec:** `docs/superpowers/specs/2026-11-17-dogfood-core-flow-fixes-design.md`

## Global Constraints

- Baseline é imutável.
- Executor registra fatos e não propõe datas.
- Planejamento propõe; Aprovador decide; proponente não aprova a própria proposta.
- Não adicionar dependências.
- Toda mudança de comportamento começa por teste falhando.

## Review Focus

- Duas medições com a mesma data efetiva devem respeitar a ordem de gravação.
- Uma resposta do servidor que não reflita o percentual enviado não pode gerar sucesso.
- Proponente não pode aprovar a própria proposta.
- Executor não pode propor compromisso por manipulação direta da API.
- Agrupador criado depois do início deve continuar preservando histórico e baseline.

---

### Task 1: Medição determinística e confirmação factual

**Files:**
- Modify: `server/trend.mjs`
- Modify: `server/service.mjs`
- Modify: `dist/backend.js`
- Modify: `dist/workspace.js`
- Test: `tests/trend-engine.test.mjs`
- Test: `tests/commitments-api.test.mjs`

**Interfaces:**
- Produces: `trend.itemTrendById[itemId].lastMeasurement` com percentual, ocorrência, descrição, data efetiva e data de gravação.

- [ ] Escrever testes para desempate por `recordedAt`, segunda medição no mesmo minuto e detalhes da última medição na projeção.
- [ ] Executar os testes e confirmar falha pela ordenação/dados ausentes.
- [ ] Incluir `recordedAt`, ocorrência e descrição na consulta e no cálculo da tendência.
- [ ] Validar no cliente que a projeção retornada contém o percentual enviado antes de notificar sucesso.
- [ ] Renderizar um resumo persistente da última medição.
- [ ] Executar testes direcionados e confirmar sucesso.

### Task 2: Proposta pelo Planejamento e aprovação independente

**Files:**
- Modify: `server/service.mjs`
- Modify: `dist/workspace.js`
- Modify: `dist/backend.js`
- Test: `tests/commitments-api.test.mjs`
- Test: `browser-tests/commitments-trend-e2e.mjs`

**Interfaces:**
- Produces: proposta por Planejamento e decisão única por Aprovador distinto do proponente.

- [ ] Escrever testes de autorização e ativação do compromisso.
- [ ] Executar e confirmar falha no modelo bilateral atual.
- [ ] Ajustar perfis, validações e ações pendentes sem ampliar permissão do Executor.
- [ ] Exibir proposta ao Planejamento e ação ao Aprovador.
- [ ] Executar testes direcionados e confirmar sucesso.

### Task 3: Formulários seguros e hierarquia robusta

**Files:**
- Modify: `dist/workspace.js`
- Modify: `dist/backend.js`
- Modify: `dist/styles.css`
- Test: `tests/prd5.test.mjs`
- Test: `tests/prd43.test.mjs`

**Interfaces:**
- Produces: normalização de entrada hierárquica e indicador de salvamento não bloqueante.

- [ ] Escrever testes para `\\n` literal, cópia correta e semântica de agrupador.
- [ ] Executar e confirmar falha.
- [ ] Normalizar a entrada, corrigir textos tocados e esclarecer campos de agrupadores.
- [ ] Remover bloqueio global do indicador e proteger somente o envio ativo.
- [ ] Executar testes direcionados e confirmar sucesso.

### Task 4: Validação integrada

**Files:**
- Modify: `browser-tests/commitments-trend-e2e.mjs`
- Create: `dogfood-output/poco-elevador/report-correcoes.md`

**Interfaces:**
- Consumes: fluxo completo das Tasks 1–3.

- [ ] Rodar sintaxe e testes backend direcionados.
- [ ] Rodar a suíte principal e registrar falhas preexistentes separadamente.
- [ ] Subir o servidor local e reproduzir o roteiro completo com agent-browser.
- [ ] Registrar evidências de medição, proposta, aprovação, baseline e compromisso vigente.
- [ ] Fazer revisão final do diff e do comportamento.

