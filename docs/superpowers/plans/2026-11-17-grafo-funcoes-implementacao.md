# Grafo de funções e status de implementação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Criar um HTML independente para analisar as funções da plataforma e localizar candidatos à remoção.

**Architecture:** Um único arquivo HTML em `visuals/`, com dados funcionais declarativos, SVG para as relações e filtros em JavaScript nativo. O arquivo não depende do backend nem de bibliotecas externas.

**Tech Stack:** HTML, CSS e JavaScript nativo.

**Spec:** `docs/superpowers/specs/2026-11-17-grafo-funcoes-implementacao-design.md`

## Global Constraints

- Não alterar o comportamento da aplicação existente.
- Não adicionar dependências.
- Separar evidência de implementação de decisão de produto.
- Manter o artefato abrível localmente.

## Review Focus

- Filtros devem esconder e mostrar nós sem quebrar as conexões visíveis.
- Funções candidatas à remoção devem continuar identificadas como candidatas, não como removidas.
- Cada função deve possuir categoria, status e evidência legível.
- O grafo deve continuar utilizável sem JavaScript externo ou servidor.

### Task 1: HTML do grafo funcional

**Files:**
- Create: `visuals/mapa-funcoes-implementacao.html`

**Interfaces:**
- Consumes: inventário funcional consolidado de `README.md`, `docs/PLATFORM-REBASELINE-AUDIT.md`, `docs/BACKEND-API.md` e `dist/workspace.js`.
- Produces: página local com grafo, filtros, busca e painel de detalhes.

- [ ] Criar dados dos nós com `id`, `label`, `category`, `status`, `evidence` e `note`.
- [ ] Criar relações entre funções e superfícies da plataforma.
- [ ] Renderizar o grafo em SVG e aplicar cores por status.
- [ ] Implementar busca, filtros por categoria/status e seleção de nó.
- [ ] Exibir legenda, contagem e aviso de que o status não substitui validação operacional.

### Task 2: Validação do artefato

**Files:**
- Test: `visuals/mapa-funcoes-implementacao.html`

- [ ] Executar `node --check` sobre o JavaScript extraído ou validar a abertura com um navegador disponível.
- [ ] Conferir que os rótulos dos quatro status aparecem no arquivo.
- [ ] Conferir que as referências aos arquivos de evidência aparecem no arquivo.
- [ ] Conferir que o arquivo está presente e não altera outros arquivos da aplicação.

