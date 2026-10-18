# Checklist de regressão PRD3 — prioridade P0

**Branch:** `PRD3`  
**Data:** 18/10/2026  
**Escopo:** 44 itens que estavam marcados como parciais na matriz de auditoria, priorizando os P0.  
**CI de referência:** [run #125 — sucesso](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39170269793): sintaxe, 70 testes automatizados e smoke browser aprovados.  
**Limite:** os estados descrevem a evidência atual, não certificam o produto para produção. “Preservado” significa que o comportamento coberto pelos testes não regrediu; as pendências listadas continuam abertas.

## Resumo dos 44 itens

| Estado | Quantidade |
|---|---:|
| preservado | 14 |
| corrigido | 2 |
| regressão encontrada | 0 |
| não verificado | 28 |

Foi encontrada uma regressão P0 no cálculo do progresso ponderado: peso zero legado era interpretado como peso 1, gerando um percentual fictício. A correção foi implementada e validada pelos testes. Nenhuma regressão permanece identificada como aberta no CI atual; isso não substitui a validação dos itens ainda não verificados.

## 1. Checklist P0 (21 itens parciais + R2-22 já conforme)

| ID | Requisito | Estado | Evidência e próxima verificação |
|---|---|---|---|
| R2-01 | Ao criar ou mover um item para subitem, vinculá-lo a todos os pais pela relação CONTÉM | não verificado | Os testes atuais cobrem contenção ancestral em criação/movimentação e rollback temporal. Executar matriz integrada de criar, mover, reordenar, remover, arquivar e restaurar; confirmar que relações CONTÉM são sincronizadas, relações temporais não mudam e nenhum vínculo fica órfão. |
| R2-02 | Redimensionar, ocultar e mostrar colunas na Sintética | preservado | CI #125 validou ocultar/mostrar colunas, redimensionamento por mouse e teclado e larguras 1920/1366/1024/768/390 px sem overflow horizontal. Ainda falta ampliar a inspeção visual de estados e combinações de colunas. |
| R2-04 | Trabalhar com durações e relações, não exigir datas individuais na criação de cada atividade | não verificado | A duração explícita e o início herdado são cobertos por testes de contrato. Falta executar o fluxo real de pré-visualização de criação em lote/subitem, conferir término calculado antes da confirmação e garantir cancelamento sem mutação parcial. |
| R2-05 | Início e término idealizados imutáveis após criação, salvo repactuação explícita | preservado | Testes de cronograma e repactuação confirmam baseline inicial preservada após recálculo/repactuação. Falta percorrer todas as operações que alteram datas e conferir eventos, sem permitir edição silenciosa da baseline. |
| R2-06 | Previsão derivada das durações e relações | preservado | Testes dinâmicos cobrem TI/II/TT/IF, defasagens, ciclos, duração ausente e caminho crítico. Falta executar o mesmo cenário integrado com dados de projeto real e verificar datas exibidas nas três visões. |
| R2-09 | Perfis GPO padrão atribuíveis a usuários e exceções individuais | preservado | Testes cobrem padrão fechado, negação sem mutação, regras por escopo, perfil herdado e exceção individual. Falta matriz completa de precedência por operação/escopo e alteração de perfil após atribuição. |
| R2-11 | Editar item pai: nome, responsável e término idealizado; previsto herdado | não verificado | Falta validar edição de item pai (nome, responsável, término repactuado), herança do previsto, preservação da baseline, recálculo de descendentes e trilha de auditoria em uma única jornada. |
| R2-13 | “Pronto” substituído por “Liberado para execução”, atribuído automaticamente quando predecessor liberar | preservado | Teste automatizado verifica múltiplas predecessoras e bloqueios antes da liberação automática. Falta cobrir reabertura, aprovação e correção, inclusive regressão de estado após mudança de predecessor. |
| R2-15 | Magnetismo dos nós inspirado em mindmap | não verificado | Contrato verifica o fallback de arraste individual, mas não prova magnetismo visual. Executar pan/zoom, encaixe de nós, persistência de posições após recarregar e interações em grafos densos. |
| R2-19 | Propagação segue sequência da Sintética, passa pelos subitens, retorna ao pai e continua | não verificado | Existe teste de contrato para a ordem do percurso. Falta validar manualmente filtros, grafos complexos, ramos desconectados e parada em bloqueio, comparando a sequência à Sintética. |
| R2-22 | Botão “Criar conforme template” ao lado de “Novo item” | preservado | Requisito já marcado Conforme na matriz. Teste de contrato verifica ações separadas Modelos/Criar conforme template e botão acessível no cabeçalho. |
| R2-24 | Percentual de avanço e estado se retroalimentam | preservado | Testes cobrem conclusão/reabertura, percentual e status herdado de grupos. Falta percorrer a matriz completa de transições para todos os estados e validar os reflexos nas três visões. |
| R2-25 | Exibir início idealizado, término idealizado e duração idealizada ao abrir item | não verificado | Código e teste de contrato indicam datas idealizadas no grafo; falta inspeção visual do painel de item para todos os tipos, incluindo datas vazias e repactuação. |
| R2-28 | Arquivar itens pais e filhos | preservado | Testes cobrem arquivamento/restauração de pai e filhos. Falta validar relações externas, permissões em todos os descendentes e consistência após restaurar em combinação com filtros. |
| M-01 | Preservar modelo amorfo e separar contenção de dependência temporal | não verificado | A separação entre CONTÉM e relações temporais tem testes básicos. Falta a matriz completa de operações e comprovação de que reordenação/hierarquia não altera dependências temporais. |
| M-02 | Consistência entre Sintética, Analítica e Gantt após mutações | não verificado | Teste de navegador #123 confirmou que um item criado aparece na Sintética, Analítica e Gantt. Falta repetir após edição, reordenação, mudança de relação, conclusão, arquivamento e restauração. |
| M-04 | Progresso ponderado sem dupla contagem e sem percentuais inventados | corrigido | Regressão reproduzida: peso legado explícito 0 era convertido em 1 e produzia avanço fictício (80%). Corrigido para usar `??` no cálculo e na exibição. CI #125 passou com 70 testes e smoke browser; falta ampliar cenários de hierarquia profunda/múltiplos pesos inválidos. |
| M-06 | Caminho crítico/folgas corretos para rede temporal, paralelismo e defasagens | não verificado | Testes cobrem caminho crítico em uma rede, paralelismo, fórmulas de dependência, defasagem e ciclo. Ainda falta validar numericamente as folgas e uma rede integrada maior. |
| M-09 | Aprovações/correções preservam decisão, motivo, autor, data e rodada | não verificado | Há teste para reprovação e criação de revisão ligada. Falta validar todas as rodadas, reabertura, autor/revisor, motivo, data/hora e encadeamento da decisão anterior. |
| M-10 | Templates preservam estrutura, relações, pesos, durações e rollback | preservado | CI #122 passou nos testes de template: subitens, pesos, durações, relação temporal interna e rollback integral após referência inválida. Falta ampliar para múltiplos tipos de relação e matriz GPO. |
| M-12 | GPO local com escopos, precedência e exceções; sem alegar segurança server-side | preservado | Testes cobrem GPO local por usuário/escopo, negação, padrão fechado e precedência perfil/exceção individual. Essa lógica é client-side; não representa autorização server-side. Falta completar a matriz de operações. |
| M-13 | Critérios de aceite, testes e evidência rastreáveis | não verificado | A matriz foi atualizada e o CI #125 passou com 70/70 testes e smoke browser. Ainda há requisitos sem evidência integrada; não liberar produção até fechar todos os P0. |

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
- **Validação consolidada mais recente:** [CI #125](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39170269793), 70/70 testes e smoke browser aprovados.

## 4. Ordem de execução pendente

1. **Integridade:** cobrir criação, movimentação, reordenação, remoção, arquivamento e restauração de itens/relações; conferir rollback e ausência de referências órfãs.
2. **Baseline/repactuação e rede temporal:** testar edição de pai, preservação da baseline, fórmulas TI/II/TT/IF, folgas e caminho crítico em uma mesma rede integrada.
3. **Progresso ponderado:** ampliar casos de hierarquia profunda, pesos inválidos/ausentes e ausência de resultado sem inventar percentual.
4. **Templates:** testar tipos variados de relação, permissões e falha em cada etapa da instanciação com rollback integral.
5. **GPO:** completar a matriz de operações, escopos, herança, precedência e exceções; documentar explicitamente que a autorização atual é client-side.
6. **Consistência entre visões:** repetir a comparação Sintética/Analítica/Gantt após cada mutação relevante, não apenas após criação.
7. **Aprovações e interface:** fechar rodadas de aprovação, fluxos de correção, inspeção visual e navegação/filtros.

**Gate de release:** não publicar em produção enquanto qualquer P0 permanecer como `não verificado` ou enquanto os cenários integrados acima não tiverem evidência reproduzível.
