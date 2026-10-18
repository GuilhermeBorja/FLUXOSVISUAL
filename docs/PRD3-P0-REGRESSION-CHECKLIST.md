# Checklist de regressão PRD3 — prioridade P0

**Branch:** `PRD3`  
**Data:** 18/10/2026  
**Escopo:** 44 itens que estavam marcados como parciais na matriz de auditoria, priorizando os P0.  
**CI de referência:** [run #145 — sucesso](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39171144437): sintaxe, 76 testes automatizados e smoke browser aprovados.  
**Limite:** os estados descrevem a evidência atual, não certificam o produto para produção. “Preservado” significa que o comportamento coberto pelos testes não regrediu; as pendências listadas continuam abertas.

## Resumo dos 44 itens

| Estado | Quantidade |
|---|---:|
| preservado | 13 |
| corrigido | 6 |
| regressão encontrada | 0 |
| não verificado | 25 |

Foram reproduzidos cinco defeitos P0: peso zero legado interpretado como peso 1; baseline final vazia quando o término era derivado da duração; predecessora cancelada deslocando a previsão de atividade ativa; relações CONTÉM ancestrais obsoletas ao excluir um pai mantendo os filhos; e edição parcial antes de uma negação GPO. Os cinco foram corrigidos e validados nos CI #131, #135, #136 e #140; o CI #145 também passou com 76/76 testes e smoke browser. Nenhuma regressão permanece identificada como aberta no CI atual; isso não substitui a validação dos itens ainda não verificados.

## 1. Checklist P0 (21 itens parciais + R2-22 já conforme)

| ID | Requisito | Estado | Evidência e próxima verificação |
|---|---|---|---|
| R2-01 | Ao criar ou mover um item para subitem, vinculá-lo a todos os pais pela relação CONTÉM | corrigido | Teste P0 reproduziu relações CONTÉM ancestrais obsoletas após excluir um pai mantendo os filhos. Corrigido em 2c05b43a; CI #135 passou. CI #136 também validou relações CONTÉM e temporais após arquivar/restaurar. A matriz completa de mutações ainda está pendente. |
| R2-02 | Redimensionar, ocultar e mostrar colunas na Sintética | preservado | CI #125 validou ocultar/mostrar colunas, redimensionamento por mouse e teclado e larguras 1920/1366/1024/768/390 px sem overflow horizontal. Ainda falta ampliar a inspeção visual de estados e combinações de colunas. |
| R2-04 | Trabalhar com durações e relações, não exigir datas individuais na criação de cada atividade | não verificado | A duração explícita e o início herdado são cobertos por testes de contrato. Falta executar o fluxo real de pré-visualização de criação em lote/subitem, conferir término calculado antes da confirmação e garantir cancelamento sem mutação parcial. |
| R2-05 | Início e término idealizados imutáveis após criação, salvo repactuação explícita | corrigido | Teste P0 reproduziu `baselineDueAt` vazio quando o término era derivado da duração. Corrigido no commit 13568c6a; CI #136 passou com 74/74 testes e smoke browser. Falta percorrer todas as operações que alteram datas e conferir eventos. |
| R2-06 | Previsão derivada das durações e relações | corrigido | Teste P0 reproduziu predecessora cancelada deslocando atividade ativa para 2027-01-09. Corrigido no commit 13568c6a para não usar sua duração no cálculo da previsão. CI #136 passou com 74/74 testes e smoke browser; falta validação integrada com dados reais. |
| R2-09 | Perfis GPO padrão atribuíveis a usuários e exceções individuais | preservado | Testes cobrem padrão fechado, negação sem mutação, regras por escopo, perfil herdado e exceção individual. Falta matriz completa de precedência por operação/escopo e alteração de perfil após atribuição. |
| R2-11 | Editar item pai: nome, responsável e término idealizado; previsto herdado | preservado | Teste P0 valida edição do nome/responsável, repactuação do pai, recálculo da previsão dos descendentes, baseline original inalterada e eventos de auditoria. CI #145 passou; a inspeção visual do painel ainda não foi verificada. |
| R2-13 | “Pronto” substituído por “Liberado para execução”, atribuído automaticamente quando predecessor liberar | preservado | Teste automatizado verifica múltiplas predecessoras e bloqueios antes da liberação automática. Falta cobrir reabertura, aprovação e correção, inclusive regressão de estado após mudança de predecessor. |
| R2-15 | Magnetismo dos nós inspirado em mindmap | não verificado | Contrato verifica o fallback de arraste individual, mas não prova magnetismo visual. Executar pan/zoom, encaixe de nós, persistência de posições após recarregar e interações em grafos densos. |
| R2-19 | Propagação segue sequência da Sintética, passa pelos subitens, retorna ao pai e continua | não verificado | Existe teste de contrato para a ordem do percurso. Falta validar manualmente filtros, grafos complexos, ramos desconectados e parada em bloqueio, comparando a sequência à Sintética. |
| R2-22 | Botão “Criar conforme template” ao lado de “Novo item” | preservado | Requisito já marcado Conforme na matriz. Teste de contrato verifica ações separadas Modelos/Criar conforme template e botão acessível no cabeçalho. |
| R2-24 | Percentual de avanço e estado se retroalimentam | preservado | Testes cobrem conclusão/reabertura, percentual e status herdado de grupos. Falta percorrer a matriz completa de transições para todos os estados e validar os reflexos nas três visões. |
| R2-25 | Exibir início idealizado, término idealizado e duração idealizada ao abrir item | não verificado | Código e teste de contrato indicam datas idealizadas no grafo; falta inspeção visual do painel de item para todos os tipos, incluindo datas vazias e repactuação. |
| R2-28 | Arquivar itens pais e filhos | preservado | Testes cobrem arquivamento/restauração de pai e filhos; teste P0 adicional confirma que relações CONTÉM e temporais permanecem consistentes após arquivar/restaurar (CI #136). Falta validar relações externas e permissões em todos os descendentes. |
| M-01 | Preservar modelo amorfo e separar contenção de dependência temporal | não verificado | A separação entre CONTÉM e relações temporais tem testes básicos. Falta a matriz completa de operações e comprovação de que reordenação/hierarquia não altera dependências temporais. |
| M-02 | Consistência entre Sintética, Analítica e Gantt após mutações | não verificado | Smoke browser #145 confirma um item recém-criado e depois renomeado nas três visões. Falta repetir após reordenação, alteração de relação, conclusão, arquivamento e restauração. |
| M-04 | Progresso ponderado sem dupla contagem e sem percentuais inventados | corrigido | Regressão reproduzida: peso legado explícito 0 era convertido em 1 e produzia avanço fictício (80%). Corrigido para usar `??` no cálculo e na exibição. CI #136 passou com 74 testes e smoke browser; falta ampliar cenários de hierarquia profunda/múltiplos pesos inválidos. |
| M-06 | Caminho crítico/folgas corretos para rede temporal, paralelismo e defasagens | preservado | Testes cobrem fórmulas TI/II/TT/IF, paralelismo, ciclos, caminho crítico e folga numérica (0 dias para tarefas críticas e 4 dias para a tarefa não crítica no cenário de referência). CI #145 passou; falta rede integrada com dados reais. |
| M-09 | Aprovações/correções preservam decisão, motivo, autor, data e rodada | não verificado | Há teste para reprovação e criação de revisão ligada. Falta validar todas as rodadas, reabertura, autor/revisor, motivo, data/hora e encadeamento da decisão anterior. |
| M-10 | Templates preservam estrutura, relações, pesos, durações e rollback | preservado | CI #122 passou nos testes de template: subitens, pesos, durações, relação temporal interna e rollback integral após referência inválida. Falta ampliar para múltiplos tipos de relação e matriz GPO. |
| M-12 | GPO local com escopos, precedência e exceções; sem alegar segurança server-side | corrigido | Teste P0 reproduziu mutação parcial: o título mudava antes de uma repactuação ser negada pelo GPO. Corrigido no commit 46864d31 com pré-validação de permissões; CI #140 passou com 75/75 testes e smoke browser. GPO segue client-side e a matriz completa de operações continua pendente. |
| M-13 | Critérios de aceite, testes e evidência rastreáveis | não verificado | A matriz foi atualizada e o CI #145 passou com 76/76 testes e smoke browser. Ainda há 25 requisitos não verificados; não liberar produção até fechar todos os P0. |

## 2. Checklist dos demais itens parciais

| ID | Prioridade | Requisito | Estado | Evidência atual / pendência registrada |
|---|---|---|---|---|
| R2-03 | P1 | Histórico dos filhos consultável no histórico do pai | preservado | Histórico consulta descendentes e identifica a origem; teste de agregação e filtro de visibilidade incluído. Faltam permissões, arquivamento e duplicação. |
| R2-07 | P1 | Transformar um tipo de item em aprovação | preservado | Conversão para aprovação preservando ID, relações e histórico tem teste de regressão. |
| R2-08 | P1 | Editar uma relação sem excluir e recriar | preservado | Edição preserva ID da relação e registra evento; teste de regressão incluído. Faltam permissões e rollback de todas as transições. |
| R2-10 | P1 | Histórico detalhado: estado anterior/novo, usuário, empresa, data e hora | não verificado | Eventos capturam snapshots de ator/contexto e valores anterior/novo. Falta cobertura sistemática por operação. |
| R2-12 | P1 | Substituir BACKLOG por Lista de pendências | não verificado | Rótulo Lista de pendências existe. Falta validar compatibilidade com registros legados reais. |
| R2-14 | P1 | Remover “Em análise” e “Em correção” dos estados operacionais comuns | não verificado | Estados transitórios são omitidos de seletores comuns. Falta auditoria de todas as superfícies e dados antigos. |
| R2-16 | P1 | IDs da Sintética renumerados após reordenação/indentação | não verificado | ID visual é derivado da ordenação exibida sem alterar ID interno. Faltam testes com todas as mudanças de hierarquia/filtro. |
| R2-17 | P1 | Criar várias etapas de uma vez também em subitem | não verificado | Criação em lote tem rollback em falha e exige duração por etapa. Falta teste funcional em subitem com dados individuais e relações internas. |
| R2-18 | P1 | Alinhar integralmente o painel do item e remover textos auxiliares desnecessários | não verificado | Painel reorganizado; falta inspeção visual para confirmar alinhamento e remoção de todos os textos. |
| R2-20 | P1 | Padronizar proporção do eixo horizontal do Gantt | não verificado | Eixo proporcional e ticks existem; faltam testes visuais de zoom e escalas curtas/longas. |
| R2-21 | P1 | Escolher cor de preenchimento das linhas para diferenciar indentação e projeto | corrigido | Defeito de fallback de cor corrigido no commit 10a16c78; testes unitários de precedência/fallback e smoke browser da cor de linha passam. Contraste visual e combinações extensas de projeto/nível ainda não verificados. |
| R2-23 | P1 | Modificar cores e ícones dos estados | não verificado | Cores aplicadas à tabela, grafo, Gantt e seletores; ícones configurados aparecem no Gantt. Falta comprovar consistência completa na legenda e tooltips. |
| R2-26 | P1 | Empresa, setor e estado herdados do responsável; remover de “Descrição e contexto” | não verificado | Empresa, setor e UF são derivados do responsável na entrada. Falta testar troca de responsável em itens existentes e fallback. |
| R2-27 | P1 | Item cancelado com percentual de controle 100% | preservado | Cancelamento define controle em 100% sem marcar conclusão operacional; teste dedicado incluído. |
| R2-29 | P1 | Redimensionar painéis de cadastro e itens | não verificado | Redimensionamento de painéis existe. Faltam testes de mouse/teclado, limites, persistência e telas pequenas. |
| R2-31 | P1 | Nome do programa “Fluxo Visual”, remover “Gestão Operacional” e substituir texto genérico pelo nome da organização | não verificado | Título e README padronizados para Fluxo Visual. Falta auditar metadados, login e todos os textos. |
| R2-32 | P1 | Grafo exibe término idealizado inicial abaixo do nome e timer do responsável | preservado | Nós exibem início/término idealizados, baseline e responsável; timer mede tempo com o responsável atual. Falta validação visual em nós densos. |
| R2-33 | P1 | Clicar no responsável na árvore lateral destaca os itens desse responsável | não verificado | Árvore lateral oferece destaque por responsável. Falta teste de interação e reversão sem perda de contexto. |
| M-03 | P1 | Tipos configuráveis com campos obrigatórios, estados e transições coerentes | não verificado | Falta matriz por tipo e fluxo de aprovação. |
| M-05 | P1 | Atraso/risco/bloqueio como indicadores, não estados operacionais | não verificado | Falta validar todas as visões e filtros. |
| M-07 | P1 | Tooltip analítico completo | não verificado | Falta inspeção visual e teste de todos os campos. |
| M-08 | P1 | Árvore/filtros com expansão, seleção e combinações coerentes | não verificado | Falta matriz de combinações de filtros. |
| M-11 | P1 | Limitações de anexos locais explicitadas; sem simular backend | não verificado | Auditar avisos em todas as superfícies. |

## 3. Correções e commits de evidência

- **Progresso ponderado — defeito reproduzido e corrigido:** [commit 7ac89fa1](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/7ac89fa1ea6ce30d9b1179dbbac5ce89142e1860). O cálculo agora distingue peso ausente de peso zero inválido.
- **Exibição do peso na Sintética:** [commit 49156ef0](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/49156ef04348759301ad3a63ea6a6b521428e281). A interface deixa de exibir peso zero como se fosse peso 1.
- **Teste de regressão de peso:** [commit 9049b942](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/9049b94287dbb27145b49c26cd926023c83556e5). O primeiro CI reproduziu a falha (68 aprovados, 1 falha), confirmando a causa antes da correção.
- **Templates com rollback:** testes acrescentados em [commit 9049b942](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/9049b94287dbb27145b49c26cd926023c83556e5) e aprovados no CI #122.
- **Consistência entre visões:** teste browser acrescentado em [commit f1245041](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/f12450413aceab80aa2a33f52ad02d3e988d5603); confirmou um item recém-criado na Sintética, Analítica e Gantt no [CI #123](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39170217684).
- **Integridade de relações:** o teste [130cd927](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/130cd927355520c0a6d1368135879a6fa324282a) reproduziu relações CONTÉM ancestrais obsoletas ao excluir um pai mantendo os filhos; corrigido no [commit 2c05b43a](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/2c05b43a0f57f0b67f4719ced4748379a21f663c). O CI #135 passou com 73 testes e o CI #136 validou também arquivar/restaurar relações.
- **Baseline e rede temporal:** testes P0 adicionados nos commits [f6a673a4](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/f6a673a4c186c6b50fce0d0f1f479f3b86ce6184) e [194aa2a1](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/194aa2a1ff3b1aa8cced6e3233323fa12ae534d9) reproduziram baseline final vazia e previsão deslocada por predecessora cancelada; a correção está no [commit 13568c6a](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/13568c6a7ecf06dcb34b5594c56c8f53ec27ca01).
- **GPO e integridade transacional:** o teste [26a78c34](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/26a78c34cc42d0f4917ea9e7087ad055a429f668) reproduziu mutação parcial antes da negação GPO; corrigido no [commit 46864d31](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/46864d319ef2001d0de5052f381f13fa49258eee). O CI #140 passou com 75 testes e smoke browser.
- **Parent editing e folgas:** os testes P0 de edição/repactuação do pai e folgas numéricas do caminho crítico passaram no [CI #145](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39171144437).
- **Validação consolidada mais recente:** [CI #145](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39171144437), 76/76 testes e smoke browser aprovados.

## 4. Ordem de execução pendente

1. **Integridade:** cobrir criação, movimentação, reordenação, remoção, arquivamento e restauração de itens/relações; conferir rollback e ausência de referências órfãs.
2. **Baseline/repactuação e rede temporal:** testar edição de pai, preservação da baseline, fórmulas TI/II/TT/IF, folgas e caminho crítico em uma mesma rede integrada.
3. **Progresso ponderado:** ampliar casos de hierarquia profunda, pesos inválidos/ausentes e ausência de resultado sem inventar percentual.
4. **Templates:** testar tipos variados de relação, permissões e falha em cada etapa da instanciação com rollback integral.
5. **GPO:** completar a matriz de operações, escopos, herança, precedência e exceções; documentar explicitamente que a autorização atual é client-side.
6. **Consistência entre visões:** repetir a comparação Sintética/Analítica/Gantt após cada mutação relevante, não apenas após criação.
7. **Aprovações e interface:** fechar rodadas de aprovação, fluxos de correção, inspeção visual e navegação/filtros.

**Gate de release:** não publicar em produção enquanto qualquer P0 permanecer como `não verificado` ou enquanto os cenários integrados acima não tiverem evidência reproduzível.
