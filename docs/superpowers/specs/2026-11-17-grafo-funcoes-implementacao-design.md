# Design — Grafo de funções e status de implementação

## Objetivo

Criar um HTML independente que permita identificar quais funções da plataforma existem, onde são usadas e quais devem ser verificadas, preservadas ou consideradas candidatas à remoção.

## Escopo

- Nós de funções agrupados por área funcional.
- Nós de superfícies da plataforma: Gantt, Grafo, Meu painel, Backend e Administração.
- Classificação explícita: implementado, verificar, candidato à remoção e não verificado.
- Busca, filtros, legenda e detalhes com arquivos de evidência.
- Nenhuma alteração no comportamento da aplicação e nenhuma dependência nova.

## Abordagem escolhida

Será usado um HTML estático em `visuals/`, com dados declarativos e SVG/DOM nativo. Um grafo automático de arquivos seria tecnicamente mais fiel, mas menos útil para decidir o valor funcional de cada recurso; uma tabela isolaria as funções e esconderia as dependências.

## Limites

O status representa a evidência disponível no código, documentação e auditoria. “Implementado” não significa que o fluxo foi validado recentemente no navegador. A decisão final de remoção continua dependendo da necessidade operacional.

