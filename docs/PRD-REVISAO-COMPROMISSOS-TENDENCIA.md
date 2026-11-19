# PRD Revisão de Compromissos e Tendência no FLUXOSVISUAL

## Objetivo

Reduzir atrito de uso e transformar o FLUXOSVISUAL em uma plataforma de controle de compromissos e tendências. A revisão evolui a implementação PRD6 existente; não recria autenticação, GPO, auditoria, TI, hierarquia ou backend que já estão na `main`.

## Problema

A aplicação já modela itens, hierarquia, TI com defasagem, baseline e Gantt, mas ainda não distingue compromisso, medição real e tendência. O avanço é sobrescrito no item; o Gantt calcula datas planejadas, não uma tendência auditável; o grafo usa layout livre e torna difícil identificar quem interrompeu o fluxo.

## Resultado esperado

O sistema deve preservar o compromisso inicial, calcular uma tendência atualizada por fatos de execução, evidenciar responsabilidade por liberação, espera, bloqueio e execução, e dar à diretoria leitura clara de cadeia, responsável e impacto.

## Referências e insights aplicados

O OpenProject separa acompanhamento por percentual, trabalho e trabalho restante, e permite agendamento automático a partir de duração e predecessoras. Esse é o ponto correto de partida: percentual é evidência de execução, não previsão autônoma de prazo. A revisão incorpora essa separação, mas adota uma simplificação deliberada para obra: o executor não informa esforço nem nova data; ele só registra avanço e fato. O planejamento analisa o fato e governa a duração remanescente.

O OpenProject também confirma a utilidade de dependências e Gantt, mas não resolve por si só a leitura de responsabilidade exigida aqui. O diferencial proposto para o FLUXOSVISUAL é o mapa determinístico por responsável, empresa ou projeto, com contadores de liberação, espera, bloqueio e execução. Ele preserva o valor relacional do grafo atual sem manter a complexidade de um canvas de posições livres.

Referências consultadas: [OpenProject — Progress tracking](https://www.openproject.org/docs/user-guide/time-and-costs/progress-tracking/), [OpenProject — Gantt scheduling](https://www.openproject.org/docs/user-guide/gantt-chart/scheduling/), [Microsoft Project — Update work on a project](https://support.microsoft.com/en-us/project/update-work-on-a-project).

## Não objetivos

- Não criar relações II, TT ou IF.

- Não substituir o cronograma por um mapa visual.

- Não atribuir atraso com base somente em percentual realizado.

- Não exigir do executor duração remanescente, nova data ou explicação extensa.

- Não substituir o GPO existente por autorização paralela.

## Princípios

1. Linha de base aprovada é imutável.

2. Compromisso vigente é versionado e só muda após aceite bilateral.

3. Tendência não é compromisso.

4. Medição registra fato; duração remanescente é análise do planejamento.

5. Todo tempo de cronograma deve ser visível como duração de atividade ou defasagem TI.

6. Histórico é append-only.

## Modelo de cronograma

- Apenas relações TI entre atividades-folha, com `lagDays` opcional.

- TI + defasagem representa espera de programação sem trabalho controlável.

- Espera com responsável, evidência, risco ou marco de saída vira atividade explícita.

- Datas de tendência são calculadas por duração remanescente, TI, defasagem e calendário da atividade.

- Datas manuais são restrições externas justificadas, exclusivas do planejamento.

- Ciclos são rejeitados com identificação da cadeia conflitante.

- Atividades concluídas antecipadamente antecipam a obrigação de início das sucessoras, respeitando defasagem e calendário.

- Projetos migrados permanecem em dias corridos; novos projetos usam calendário configurável. Migração de calendário só ocorre por comando explícito do planejamento.

## Estrutura de itens

- Atividade: duração, medição e tendência próprias.

- Marco: duração zero e confirmação de ocorrência.

- Agrupador/fase: consolida filhos; não recebe medição própria.

- Uma atividade iniciada pode ser detalhada durante a execução. O pai vira agrupador, preserva baseline e compromisso; medições anteriores ficam registradas como histórico de realizado anterior ao detalhamento.

- Subtarefas com duração ou marco participam da tendência. Contexto, evidência e checklist permanecem como fatos da atividade.

- Novos filhos detalham o escopo do pai por padrão. Ampliação de escopo exige mudança formal antes de afetar a tendência.

- Conclusão seguida de retrabalho cria atividade corretiva vinculada; não reabre silenciosamente a original.

## Medição e tendência

Cada medição armazena, de forma imutável: percentual, data/hora efetiva, data/hora de registro, usuário, ocorrência, evidência opcional e correção quando aplicável.

A tela operacional mostra o percentual previsto na data/hora da medição como referência. O previsto usa distribuição linear por padrão; o planejamento pode configurar marcos físicos quando necessário. Essa comparação não altera prazo sozinha.

O executor informa somente avanço e ocorrência. A ocorrência abre com `Sem impedimento`; descrição/evidência é obrigatória para impedimento, divergência ou correção. O primeiro avanço acima de zero registra o início real; 100% conclui a atividade e libera sucessoras. Redução de avanço é apenas correção auditável.

O planejamento pode ajustar duração remanescente após analisar os fatos. Sem ajuste, a parcela não realizada é mantida e deslocada após a data/hora de status. O backend recalcula a tendência após eventos e quando vence a frequência de medição. Ausência vencida gera `Medição pendente`, sem afirmar avanço real igual a zero.

## Compromissos

O ciclo é: rascunho → compromisso inicial aprovado → execução → proposta de compromisso → aceite bilateral → compromisso vigente.

A proposta registra prazo, escopo, responsável e condições. Ela exige aceite de quem demanda e de quem assume. Baseline, acordos anteriores e snapshots de tendência são preservados. Toda alteração de tendência gera snapshot com evento causador.

## Papéis

Os perfis-base configuráveis no GPO são:

- Planejamento: estrutura, duração, TI, defasagem, calendário, restrições e duração remanescente.

- Execução: medição, ocorrência factual e bloqueio.

- Aprovador: compromisso inicial, mudança de escopo e proposta de compromisso.

- Consulta: leitura por escopo.

## Experiência operacional

A página inicial combina:

- **Minhas ações:** situações que exigem resposta ou aceite, sem lembretes repetitivos.

- **Horizonte:** Disponíveis agora, Hoje, Esta semana, Próxima semana, Restante do mês e Próximo mês. Cada item aparece uma vez pela data de início da tendência; compromisso inicial continua visível.

Estados principais são derivados: não liberada, liberada, em execução, concluída e medição pendente. Bloqueio é manual, exige fato e pode coexistir com propagação de bloqueio.

Contadores usam o calendário da atividade:

- não iniciada e liberada: `Liberada há X dias úteis`;

- em execução: `Em execução há X dias úteis`;

- bloqueada: ciclo continua, execução pausa e mostra `Bloqueada há X dias úteis`;

- concluída: `Ciclo total`, `aguardou início` e `executou`.

## Gantt

A visão principal é cronograma hierárquico de tendência, com árvore expansível, linha de data/hora de status, barras de tendência e setas TI.

Na leitura normal, cada linha mostra marcadores discretos de baseline, compromisso vigente, tendência atual e contador de acordos anteriores. Ao selecionar a atividade, o histórico expande no próprio Gantt: linha de base, acordos anteriores, compromisso vigente e tendência. O histórico não ocupa permanentemente a faixa principal.

## Mapa executivo de fluxo

Substitui o layout livre atual. É complementar ao Gantt e responde quem segura a cadeia.

- Agrupamento selecionável por responsável, empresa ou projeto.

- Posição automática: esquerda para direita por ordem topológica TI; empates por início de tendência.

- Sem arraste livre e sem posições salvas.

- Abre filtrado para medição pendente, bloqueio ou tendência após compromisso, mais predecessoras e sucessoras diretas; permite expansão.

- Cartão mostra nome, situação/ação necessária, tendência versus compromisso e responsável quando ele não for o agrupamento.

- O contador de ciclo é a leitura temporal principal.

- Relações mostram transferências entre grupos. Dependência externa exige atividade específica, responsável/empresa e compromisso próprios.

## Migração da PRD6

1. Evoluir `baseline`, `target` e `replanned` para compromissos versionados; a meta atual vira primeiro compromisso vigente quando aplicável.

2. Migrar `progressPercent` para projeção da última medição; preservar o valor existente como medição inicial identificada.

3. Preservar datas atuais com calendário corrido nos projetos existentes.

4. Descartar posições livres do grafo; preservar preferência de agrupamento.

5. Reutilizar GPO como base dos perfis.

6. Manter auditoria, concorrência otimista, transações e autorização server-side da PRD6.

## Fases internas

1. Domínio e migração: compromissos, medições, calendários, frequência, tendência, snapshots e regras de permissão.

2. Operação: atualização enxuta, ações, horizonte, contadores, bloqueios, detalhamento e retrabalho.

3. Leitura: Gantt por camadas e mapa executivo de fluxo determinístico.

## Critérios de aceite

- Uma medição não altera baseline nem compromisso vigente.

- Uma ausência vencida cria medição pendente e atualiza a tendência sem inventar percentual real.

- Ajuste de duração remanescente recalcula toda a cadeia TI afetada.

- Aceite bilateral cria novo compromisso vigente e preserva versões anteriores.

- Detalhar atividade iniciada não apaga progresso ou eventos existentes.

- TI com defasagem usa calendário aplicável; ciclos são rejeitados.

- Um item liberado exibe contador desde a liberação; bloqueio pausa apenas execução.

- Gantt compacto não desenha todos os acordos históricos; seleção os expande.

- Mapa executivo ordena por TI, agrupa pela dimensão escolhida e evidencia o responsável da interrupção.

- GPO continua sendo aplicado no servidor para leitura e escrita.

## Premissas e limites

A PRD6 já fornece backend multiusuário, autenticação, GPO, auditoria e TI. Esta revisão exige migração controlada de dados e testes de regressão do cálculo de cronograma. Indicadores de responsabilidade devem ser derivados de liberação, início e término reais; não podem ser inferidos apenas de percentual ou cor de status.

