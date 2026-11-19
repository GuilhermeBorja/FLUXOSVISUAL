# Experience First Gantt UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Tornar o Gantt a superfície principal de decisão, reduzir a carga visual da interface e corrigir hierarquia, relações TI, arraste temporal e arquivamento sem perder baseline, compromisso vigente ou tendência.

**Architecture:** A interface continua em `dist/workspace.js`, `dist/app.js` e `dist/styles.css`, seguindo o padrão atual. O backend continua recebendo alterações por `dist/backend.js`; mudanças temporais usam a atualização validada existente, preservando baseline e registrando evento. Relações TI resumidas continuam no agrupador e o cronograma do agrupador usa o maior caminho interno.

**Tech Stack:** JavaScript ES modules, SQLite backend, Playwright, Node test runner.

**Spec:** `docs/PRD-REVISAO-COMPROMISSOS-TENDENCIA.md` e decisões consolidadas na entrevista Experience First/Grill-me de 2026-11-17.

## Global Constraints

- O Gantt é a superfície principal.
- Todos os papéis usam a mesma estrutura; GPO define alçadas.
- Baseline é imutável.
- Compromisso vigente só muda por registro formal.
- Tendência pode mudar automaticamente.
- Relações TI podem permanecer no agrupador como referência resumida.
- O agrupador usa a duração do maior caminho interno.
- O usuário escolhe ordenação e filtros nos cabeçalhos do Gantt.
- Arraste temporal precisa mostrar prévia e impacto antes de afetar compromisso.

## Review Focus

- Barra coberta por baseline ou compromisso não pode perder o ponteiro.
- Arraste de atividade com relação TI não pode criar estrutura temporal inválida.
- Arraste para dentro precisa preservar a intenção da relação como resumo do agrupador.
- Mudança de data não pode reescrever baseline nem aceitar compromisso automaticamente.
- Arquivamento e restauração precisam preservar a árvore original.

### Task 1: Gantt temporal e relações resumidas

**Files:**
- Modify: `dist/workspace.js`
- Modify: `dist/app.js`
- Modify: `dist/backend.js`
- Modify: `dist/styles.css`
- Test: `browser-tests/gantt-date-drag-e2e.mjs`
- Test: `tests/prd5.test.mjs`

**Interfaces:**
- `FluxosBackend.moveTaskDates(itemId, startAt, dueAt)` shifts a task while preserving baseline.
- `moveItemHierarchy(id, nextParentId)` accepts a grouped target and preserves summary TI references.

- [ ] Write browser tests for center drag, edge duration drag, preview and persistence.
- [ ] Add server-backed date update using the complete item shape and existing validation.
- [ ] Add visual handles for center, left edge and right edge without overlapping commitment bands.
- [ ] Adjust hierarchy movement so a TI relation remains on the grouped item and the parent schedule is recomputed from the longest internal path.
- [ ] Run `node browser-tests/gantt-date-drag-e2e.mjs`, `node browser-tests/gantt-interactions-e2e.mjs` and `npm test`.

### Task 2: Meu painel and information hierarchy

**Files:**
- Modify: `dist/app.js`
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Test: `browser-tests/backend-e2e.mjs`

**Interfaces:**
- `ui.operationsOpen` controls the lateral drawer.
- Drawer sections render in fixed order: trend delay, delayed/stopped/blocked, upcoming activities, next action.

- [ ] Add one “Meu painel” control beside “Modelos”.
- [ ] Render the four sections in a lateral drawer without pushing the Gantt.
- [ ] Show impact, cause, responsible and affected commitment in each row.
- [ ] Keep one clear path through the drawer and avoid nested menus.
- [ ] Verify desktop and mobile layout, keyboard close and no unnecessary page scroll.

### Task 3: Headers, filtering and task panel order

**Files:**
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Test: `browser-tests/gantt-interactions-e2e.mjs`

- [ ] Make Gantt headers sort and filter like a spreadsheet.
- [ ] Persist view state per user and project.
- [ ] Reorder the activity panel as impact, next action, dates, responsibility/dependencies, history.
- [ ] Keep advanced fields collapsed without hiding the primary action.
- [ ] Test ordering persistence after reload.

### Task 4: TI interaction and hitbox

**Files:**
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Test: `browser-tests/gantt-interactions-e2e.mjs`

- [ ] Replace the tiny relation control with a contextual editor opened by clicking the relation line.
- [ ] Provide a minimum 32 px hitbox and keyboard focus state.
- [ ] Show source, target, lag and impact before saving.
- [ ] Use a bottom sheet on narrow screens.
- [ ] Verify the hitbox does not block date drag or hierarchy drag.

### Task 5: Archived project grouping

**Files:**
- Modify: `dist/workspace.js`
- Modify: `dist/styles.css`
- Test: `tests/prd5.test.mjs`

- [ ] Group archived items by their project/process root.
- [ ] Render descendants inside the root group.
- [ ] Restore the root as a complete structure.
- [ ] Restore an individual descendant as a child of the archived project.
- [ ] Verify parent references and archived relations remain intact.

### Task 6: Final verification

**Files:**
- Test: `browser-tests/gantt-date-drag-e2e.mjs`
- Test: `browser-tests/gantt-interactions-e2e.mjs`
- Test: `browser-tests/backend-e2e.mjs`

- [ ] Run `npm run check`.
- [ ] Run `npm run check:backend`.
- [ ] Run `npm test`.
- [ ] Run all three browser tests at 1366, 768 and 390 px.
- [ ] Confirm no missing icon warnings, uncaught page errors or unexpected page scroll.
