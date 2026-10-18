# PRD3 — Matriz de auditoria de requisitos

**Branch:** `PRD3`  
**Data:** 18/10/2026  
**Regra de release:** não publicar em produção enquanto qualquer requisito P0 estiver parcial/defeituoso ou enquanto a validação funcional completa não tiver evidência.

Esta matriz separa a existência de código da validação funcional. `Parcial` significa que há implementação ou teste limitado, mas falta evidência para declarar conformidade integral.

| ID | Requisito | Estado | Evidência atual / pendência |
|---|---|---|---|
| R2-01 | Ao criar ou mover um item para subitem, vinculá-lo a todos os pais pela relação CONTÉM | Parcial | Contenção sincronizada na subárvore ao mover; teste cobre neto e ancestrais. Falta validar criação, reordenação, remoção e restauração. |
| R2-02 | Redimensionar, ocultar e mostrar colunas na Sintética | Parcial | Colunas configuráveis, autoajuste e responsividade existem. Faltam testes visuais nas cinco resoluções e operação por teclado. |
| R2-03 | Histórico dos filhos consultável no histórico do pai | Parcial | Histórico consulta descendentes e identifica a origem. Faltam testes de permissões, arquivamento e ausência de duplicação. |
| R2-04 | Trabalhar com durações e relações, não exigir datas individuais na criação de cada atividade | Parcial | Duração explícita, previsão sem duração presumida, início herdado pelo subitem e duração explícita por etapa em lote. Falta validação funcional integrada da pré-visualização da rede antes de confirmar. |
| R2-05 | Início e término idealizados imutáveis após criação, salvo repactuação explícita | Parcial | Baseline e repactuação separadas; teste confirma baseline preservada. Falta auditar todas as operações e eventos. |
| R2-06 | Previsão derivada das durações e relações | Parcial | Rede temporal, paralelismo, caminho crítico, ciclos e fórmulas TI/II/TT/IF têm testes. Falta validação integrada com dados reais. |
| R2-07 | Transformar um tipo de item em aprovação | Parcial | Conversão para aprovação preservando ID, relações e histórico tem teste de regressão. |
| R2-08 | Editar uma relação sem excluir e recriar | Parcial | Edição preserva ID da relação e registra evento; teste de regressão incluído. Faltam permissões e rollback de todas as transições. |
| R2-09 | Perfis GPO padrão atribuíveis a usuários e exceções individuais | Parcial | Perfis GPO e exceções têm testes existentes. Falta matriz completa de precedência, herança e edição. |
| R2-10 | Histórico detalhado: estado anterior/novo, usuário, empresa, data e hora | Parcial | Eventos capturam snapshots de ator/contexto e valores anterior/novo. Falta cobertura sistemática por operação. |
| R2-11 | Editar item pai: nome, responsável e término idealizado; previsto herdado | Parcial | Edição de pai e previsão herdada existem em parte. Falta validar repactuação, baseline e recálculo. |
| R2-12 | Substituir BACKLOG por Lista de pendências | Parcial | Rótulo Lista de pendências existe. Falta validar compatibilidade com registros legados reais. |
| R2-13 | “Pronto” substituído por “Liberado para execução”, atribuído automaticamente quando predecessor liberar | Parcial | Liberação automática tem testes de predecessoras e bloqueios. Faltam reabertura, aprovação e fluxo completo. |
| R2-14 | Remover “Em análise” e “Em correção” dos estados operacionais comuns | Parcial | Estados transitórios são omitidos de seletores comuns. Falta auditoria de todas as superfícies e dados antigos. |
| R2-15 | Magnetismo dos nós inspirado em mindmap | Parcial | Fallback para arraste individual aplicado e testado estaticamente. Falta teste manual de magnetismo, pan, zoom e persistência. |
| R2-16 | IDs da Sintética renumerados após reordenação/indentação | Parcial | ID visual é derivado da ordenação exibida sem alterar ID interno. Faltam testes com todas as mudanças de hierarquia/filtro. |
| R2-17 | Criar várias etapas de uma vez também em subitem | Parcial | Criação em lote tem rollback em falha. Falta teste funcional em subitem com dados individuais e relações internas. |
| R2-18 | Alinhar integralmente o painel do item e remover textos auxiliares desnecessários | Parcial | Painel reorganizado; falta inspeção visual para confirmar alinhamento e remoção de textos. |
| R2-19 | Propagação segue sequência da Sintética, passa pelos subitens, retorna ao pai e continua | Parcial | Percurso começa no item selecionado, visita descendentes e retorna pelos ancestrais. Falta validação manual com filtros e grafos complexos. |
| R2-20 | Padronizar proporção do eixo horizontal do Gantt | Parcial | Eixo proporcional e ticks existem; faltam testes de zoom e escalas curtas/longas. |
| R2-21 | Escolher cor de preenchimento das linhas para diferenciar indentação e projeto | Parcial | Preenchimento da Sintética configurável por nível e projeto, com persistência local e fallback seguro. Falta validar contraste e persistência em múltiplas resoluções. |
| R2-22 | Botão “Criar conforme template” ao lado de “Novo item” | Conforme | Ações Modelos e Criar conforme template são distintas e lado a lado; teste de contrato passou. |
| R2-23 | Modificar cores e ícones dos estados | Parcial | Cores configuráveis aplicadas à tabela, grafo, Gantt e seletores; ícones configurados aparecem no Gantt. Falta comprovar consistência completa na legenda e tooltips. |
| R2-24 | Percentual de avanço e estado se retroalimentam | Parcial | Avanço, conclusão, reabertura e bloqueios têm regras e testes. Falta matriz de transições de todos os estados. |
| R2-25 | Exibir início idealizado, término idealizado e duração idealizada ao abrir item | Parcial | Painel mostra início, término e duração; baseline separada. Falta revisão visual por tipo de item. |
| R2-26 | Empresa, setor e estado herdados do responsável; remover de “Descrição e contexto” | Parcial | Empresa, setor e UF são derivados do responsável na entrada. Falta testar troca de responsável em itens existentes e fallback. |
| R2-27 | Item cancelado com percentual de controle 100% | Parcial | Cancelamento define controle em 100% sem usar estado concluído. Falta teste dedicado e semântica explícita em toda a interface. |
| R2-28 | Arquivar itens pais e filhos | Parcial | Arquivamento/restauração de subárvore tem testes. Faltam relações externas e permissões em todos os casos. |
| R2-29 | Redimensionar painéis de cadastro e itens | Parcial | Redimensionamento de painéis existe. Faltam testes de mouse/teclado, limites, persistência e telas pequenas. |
| R2-30 | Simplificar “Mostrar subitens como na visão sintética” para “Mostrar subitens” | Conforme | Rótulo Mostrar subitens está presente na Sintética. |
| R2-31 | Nome do programa “Fluxo Visual”, remover “Gestão Operacional” e substituir texto genérico pelo nome da organização | Parcial | Título e identidade visual padronizados em parte. Falta auditar README, metadados, login e todos os textos. |
| R2-32 | Grafo exibe término idealizado inicial abaixo do nome e timer do responsável | Parcial | Nós exibem início/término idealizados, baseline e responsável; timer mostra tempo com o responsável atual e o tooltip separa o tempo total. Falta validar visualmente em nós densos. |
| R2-33 | Clicar no responsável na árvore lateral destaca os itens desse responsável | Parcial | Árvore lateral oferece destaque por responsável. Falta teste de interação e reversão sem perda de contexto. |

## Requisitos transversais

| ID | Estado | Evidência / pendência |
|---|---|---|
| M-01 | Parcial | Modelo amorfo e separação entre contenção e dependências existem; falta regressão completa para todas as operações. |
| M-02 | Parcial | Sintética, Analítica e Gantt compartilham estado local; falta teste integrado após cada mutação relevante. |
| M-03 | Parcial | Tipos configuráveis existem; falta matriz de campos obrigatórios, estados e transições por tipo. |
| M-04 | Parcial | Progresso ponderado dos descendentes existe; falta teste amplo contra dupla contagem e pesos ausentes. |
| M-05 | Parcial | Atraso/risco/bloqueio são indicadores separados do status; falta validar todas as visões. |
| M-06 | Parcial | Testes cobrem paralelismo, ciclos e caminho crítico; falta validação integrada de defasagens e datas. |
| M-07 | Parcial | Tooltip contém status, responsável, durações, datas, desvios, bloqueios e dependências; falta teste visual. |
| M-08 | Parcial | Árvore e filtros existem; falta matriz de combinações, expansão e seleção. |
| M-09 | Parcial | Rodadas de aprovação/correção preservam decisões; falta teste integrado da sequência completa. |
| M-10 | Parcial | Templates e prévia existem; falta validar estrutura, relações internas, permissões e rollback. |
| M-11 | Parcial | Anexos permanecem locais; falta confirmar as limitações em todas as superfícies. |
| M-12 | Parcial | GPO local não representa autenticação/autorização segura no servidor; falta matriz de escopos e exceções. |
| M-13 | Parcial | CI executa sintaxe, testes e build; faltam testes manuais, resoluções exigidas e fechamento de critérios. |

## Validação automatizada recente

- Última execução integral bem-sucedida consultada: https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39166466903
- Testes cobrem contenção ancestral, rollback em ciclo, fórmulas de cronograma, caminho crítico, edição de relações, conversão para aprovação, templates e cores.
- CI verde não equivale a aprovação funcional final. Atualizar esta matriz somente com evidência real.
