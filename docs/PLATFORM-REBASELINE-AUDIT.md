# FLUXOSVISUAL — Auditoria de rebaseline da plataforma

Data: 2026-11-17  
Escopo: código atual, PRD3, PRD5, PRD6, revisão de compromissos e tendência, planos de implementação, testes e browser-tests.  
Status atual: auditoria documental, estrutural e validação incremental concluídas para o estado descrito nas seções 17 e 18. As marcações históricas de pendência abaixo permanecem como rastreabilidade do estado anterior.

## 1. Objetivo central

O FLUXOSVISUAL deve definir compromissos de projeto, registrar fatos de execução, calcular a tendência de prazo e mostrar com clareza onde o fluxo está parado, qual é o impacto e quem precisa agir.

O Gantt é a superfície principal. A Sintética e o mapa Analítico são visões auxiliares da mesma projeção autorizada. Nenhuma visão pode inventar datas, responsáveis, progresso ou relações diferentes do modelo oficial.

## 2. Fontes consolidadas

Foram considerados:

- `README.md`;
- todos os documentos em `docs/`;
- planos em `docs/superpowers/plans/`;
- `dist/app.js`, `dist/backend.js`, `dist/graph.js`, `dist/workspace.js`, `dist/styles.css` e `dist/index.html`;
- todos os módulos em `server/`, incluindo `server/migrations/003_commitments_trends.mjs`;
- todos os testes em `tests/`;
- todos os fluxos em `browser-tests/`;
- decisões confirmadas na conversa e no Grill-me/Experience First.

Inventário lido: 74 arquivos, aproximadamente 1,48 MB de conteúdo.

## 3. Modelo atual

### 3.1 Domínio

- Workspace, empresas, setores, usuários e perfis GPO.
- Item hierárquico com `parentId` como origem única da árvore.
- Relações persistidas somente como TI; Contém é derivado da hierarquia.
- Duração explícita, datas planejadas, peso, avanço e status.
- Aprovação com rodada, decisão e histórico append-only.
- Bloqueadores com identidade individual e resolução independente.
- Anexos privados, exclusão lógica e auditoria.
- Templates com novas identidades na aplicação.

### 3.2 Cronograma

- Calendário legado em dias corridos e calendário configurável para novos projetos.
- Duração inclusiva.
- TI com `lagDays`.
- Recálculo de datas planejadas e caminho crítico quando a rede é válida.
- Baseline separada da previsão recalculada.
- Migração de `target`/`replanned` para compromissos versionados.

### 3.3 Compromissos, medições e tendência

O backend possui migração, tabelas, projeção e comandos para:

- baseline;
- acordo vigente e acordos anteriores;
- medições factuais;
- correções de medição;
- bloqueio factual;
- duração remanescente ajustada pelo planejamento;
- frequência de medição;
- snapshots de tendência;
- ações de aceite bilateral;
- horizonte operacional.

A regra do produto é correta: o executor registra avanço e fatos; não propõe nova data. A tendência é derivada do fato e pode ser ajustada pelo planejamento.

## 4. Funções existentes e classificação

| Área | Evidência atual | Classificação | Observação |
|---|---|---|---|
| Autenticação e sessão | `server/auth.mjs`, `server/http.mjs`, testes backend | Preservar | Há contrato, segurança e testes específicos. |
| GPO server-side | `server/domain.mjs`, `commands.mjs`, `service.mjs` | Preservar | É a autoridade de leitura e escrita. |
| Hierarquia por `parentId` | `dist/app.js`, domínio e testes P0 | Preservar | Não substituir por relações Contém persistidas. |
| TI e defasagem | domínio, trend engine, API e testes | Preservar | Escopo confirmado pelo usuário. |
| Baseline | migração, backend e renderização condicional no Gantt | Corrigir/verificar | O modelo existe, mas a aparição visual no runtime não está comprovada. |
| Compromisso vigente | API, projeção e `state.commitments` | Corrigir/verificar | Há dados e renderização condicional; falta prova de ponta a ponta. |
| Tendência | `server/trend.mjs`, snapshots e projeção | Preservar/corrigir | Motor tem testes; visualização integrada ainda não é comprovada. |
| Medição factual | comandos e API | Preservar | O fluxo deve permanecer sem campo de nova data para executor. |
| Medição prevista na data/hora | requisito do PRD | Implementado/verificar | Formulário consulta projeção histórica somente leitura; falta execução real do browser-test. |
| Ausência vencida | serviço e snapshots | Preservar/verificar | Precisa validação visual de “Medição pendente”. |
| Duração remanescente | comando de planejamento | Preservar | Deve recalcular toda a cadeia afetada. |
| Agrupador pelo maior caminho | `expandedSummaryTi`, trend e Gantt | Corrigir/verificar | Há implementação recente; falta matriz de casos integrados. |
| Detalhamento progressivo | PRD e plano | Não verificado | Não há evidência suficiente de preservação completa do passado ao criar filhos. |
| Meu painel | `ui.operationsOpen`, drawer e seções operacionais | Corrigir/verificar | Implementação existe; falta prova visual, mobile e conteúdo completo de impacto. |
| Horizonte operacional | `state.horizon` e renderização | Preservar/verificar | Deve classificar cada atividade uma única vez. |
| Gantt hierárquico | `renderGantt` | Preservar/corrigir | É a superfície principal, mas existem inconsistências visuais e de interação. |
| Camadas baseline/acordo/tendência | `gantt-commitment-band`, barras e legenda | Corrigir/verificar | Condicionadas à presença de `state.commitments`; sem teste E2E específico. |
| Histórico sob demanda | `gantt-history-inline` e histórico do item | Preservar/verificar | Falta inspeção visual de densidade e legibilidade. |
| Ordenação de colunas | botões `data-gantt-sort` recentes | Corrigir/verificar | Implementação sem teste de comportamento/persistência após reload. |
| Filtro de cabeçalho | PRD/planos | Implementado/verificar | Filtro direto por coluna foi adicionado; ainda falta execução real e persistência após reload. |
| Resize de colunas | `prd5BindGanttColumns` | Preservar/verificar | Há implementação, sem validação visual nesta auditoria. |
| Arraste central de datas | handlers Gantt e backend `moveTaskDates` | Preservar/verificar | Existe, mas a suíte não pôde ser executada neste ambiente. |
| Resize de início/término | handles `data-gantt-date-resize` | Preservar/verificar | Existe; preview de impacto não está comprovado. |
| Arraste hierárquico | `moveItemHierarchy` e browser-test | Corrigir/verificar | Há risco de conflito entre drag, TI e agrupadores. |
| Relação TI por clique na linha | hitbox SVG/HTML | Preservar/verificar | Hitbox foi ampliado; edição de defasagem foi adicionada sem E2E correspondente. |
| Grafo/mapa executivo | `dist/graph.js` layout por agrupamento e nível TI | Implementado/verificar | Layout determinístico substituiu a simulação; falta validar legibilidade em viewport real. |
| Posições livres do grafo | `graphPositions` em frontend e backend | Remover após migração | Novas gravações compartilhadas não persistem posições; leitura estática legada permanece temporariamente. |
| Agrupamento do mapa | `graphGrouping` no serviço, adapter e interface | Implementado/verificar | Preferência alinhada e persistida; falta validar comportamento após reload. |
| Arquivamento agrupado | `renderArchivedItemsGrouped` | Preservar/verificar | Estrutura visual existe; restauração de descendente requer E2E. |
| Templates | `saveFlowTemplate`, `applyFlowTemplate` | Corrigir/simplificar | PRD3 registra duplicidade entre gestão de modelos e criação por template. |
| Aprovações | app, backend, testes | Preservar | Não confundir aprovação comum com aceite bilateral de compromisso. |
| Anexos | backend, storage, testes | Preservar | Fora do núcleo de tendência, mas parte do produto atual. |
| Auditoria | eventos append-only, API e testes | Preservar | Invariante de segurança e explicabilidade. |
| Backup/restauração | scripts e testes | Preservar | Necessário para migrações e retirada de compatibilidade. |

## 5. Invariantes do produto

1. Baseline é imutável após o compromisso inicial.
2. Compromisso vigente só muda por proposta e aceite formal.
3. Tendência não é compromisso.
4. Medição registra fato; não propõe data.
5. Executor não informa duração remanescente.
6. Planejamento pode analisar fatos e ajustar duração remanescente.
7. TI é a única dependência temporal persistida.
8. Defasagem representa espera de programação sem criar atividade fictícia.
9. Relações TI não podem alterar silenciosamente a hierarquia.
10. Agrupadores consolidam folhas e usam o maior caminho interno.
11. Histórico é append-only.
12. GPO é aplicado no servidor.
13. Sintética, Analítica e Gantt usam a mesma projeção autorizada.
14. Um item tem identidade estável em todas as visões.
15. Nenhuma data, avanço ou responsável pode ser inventado por uma camada visual.

## 6. Contradições e resíduos identificados

### 6.1 Mapa determinístico versus grafo de forças

O PRD de compromissos determina substituir o layout livre por um mapa determinístico por responsável, empresa ou projeto. O código atual ainda usa `d3.forceSimulation`, arraste e `graphPositions`. Isso é uma contradição funcional, não apenas estética.

Decisão: classificar a simulação livre e a persistência de posições como compatibilidade a remover após a migração e os testes do mapa determinístico.

### 6.2 Camadas do Gantt existem no código, mas não estão comprovadas na tela

`renderGantt` procura compromissos por `entry.itemId === item.id` e só cria as bandas quando encontra baseline ou acordo. O backend retorna `commitments` e o adapter atribui `state.commitments`.

O caminho parece existir, mas a ausência relatada pelo usuário não pode ser explicada somente por inspeção estática. É necessário observar:

1. payload da projeção;
2. `state.commitments` após hidratação;
3. correspondência dos IDs;
4. elementos DOM criados;
5. visibilidade real no navegador.

Status: não verificado em runtime.

### 6.3 CSS duplicado

Há uma regra inicial de `.gantt-commitment-band` com `pointer-events:auto` e uma regra posterior com `pointer-events:none`. O resultado depende da ordem do arquivo. A regra deve ser consolidada em um único local após a validação do comportamento.

### 6.4 Plano e código não estão sincronizados

Os planos possuem checkboxes ainda marcados como `[ ]`, embora partes das tarefas já tenham sido implementadas. Isso impede saber o que foi realmente concluído.

Decisão: atualizar o estado dos planos somente após evidência atual; não usar o plano como prova automática de conclusão.

### 6.5 Cobertura de browser incompleta para o novo núcleo

Existe `commitments-trend-e2e.mjs`, mas o plano de operação previa `trend-workspace-e2e.mjs`, que não está no inventário atual. Não há evidência E2E específica para:

- medição com percentual previsto na data/hora;
- ausência vencida;
- compromisso bilateral na interface;
- três camadas simultâneas no Gantt;
- detalhamento progressivo sem apagar histórico;
- mapa determinístico por agrupamento;
- ordenação de cabeçalho persistida;
- edição de lag pelo hitbox da linha.

### 6.6 Preferências antigas permanecem no caminho atual

`graphPositions` aparece em `dist/app.js`, `dist/workspace.js`, `dist/backend.js` e `server/service.mjs`. O PRD prevê ignorar/remover essa preferência após migração, mas a retirada ainda não foi concluída.

## 7. Auditoria de UX e menus

### Preservar

- Gantt como visão operacional principal.
- Seleção sincronizada entre visões.
- Meu painel lateral sob demanda.
- Histórico expandido somente quando solicitado.
- Ordenação direta por cabeçalho.
- Ações de alta consequência protegidas por GPO e confirmação.

### Simplificar

- Separar claramente gestão de modelos de criação a partir de modelo.
- Reduzir menus aninhados.
- Mostrar primeiro impacto, próxima ação, datas e responsável.
- Manter campos avançados recolhidos sem esconder a ação primária.
- Evitar que o usuário precise abrir várias telas para identificar a pendência.

### Corrigir/verificar

- Conteúdo do Meu painel deve mostrar causa, impacto, responsável e compromisso afetado.
- Gantt deve mostrar baseline, compromisso e tendência de forma identificável sem poluir todas as linhas.
- Relação TI deve abrir com hitbox de pelo menos 32 px, origem, destino, lag e impacto.
- Responsividade deve ser testada em 1366, 1024, 768 e 390 px.
- Nenhuma faixa de compromisso pode bloquear arraste ou clique em relação.

## 8. Fluxos críticos

### 8.1 Atualização de avanço

1. Usuário abre a atividade.
2. Sistema mostra previsto na data/hora da medição.
3. Executor informa percentual e ocorrência.
4. Texto/evidência é exigido quando houver impedimento ou divergência.
5. Backend grava medição imutável.
6. Tendência é recalculada.
7. Gantt e demais visões atualizam sem alterar baseline ou compromisso vigente.

### 8.2 Atraso e repactuação

1. Fato de execução gera tendência.
2. Tendência evidencia impacto.
3. Planejamento analisa fatos e plausibilidade.
4. Proposta de novo compromisso é criada sem alterar a baseline.
5. Demandante e responsável aceitam.
6. Novo acordo torna-se vigente e o anterior permanece no histórico.

### 8.3 Detalhamento progressivo

1. Atividade iniciada recebe subitens.
2. O pai vira agrupador sem apagar fatos anteriores.
3. Novos filhos detalham o escopo por padrão.
4. Ampliação real de escopo exige mudança formal.
5. TI e medições permanecem em folhas.

### 8.4 Arraste no Gantt

- Centro desloca início e término mantendo duração.
- Borda esquerda altera início mantendo término.
- Borda direita altera término mantendo início.
- Baseline não muda.
- Compromisso não é aceito automaticamente.
- Se houver impacto formal, deve existir prévia e confirmação de repactuação.

## 9. Matriz de rastreabilidade resumida

| Requisito | Fonte | Código/teste | Estado atual | Evidência faltante |
|---|---|---|---|---|
| Baseline imutável | PRD3, PRD revisão | `tests/p0-integrity.test.mjs`, `tests/core.test.mjs` | Parcialmente comprovado | Teste visual e projeção real após drag/repactuação. |
| Compromisso vigente versionado | PRD revisão, BACKEND-API | `server/service.mjs`, `tests/commitments-api.test.mjs` | Backend presente | E2E bilateral e Gantt. |
| Tendência por fatos | PRD revisão | `server/trend.mjs`, `tests/trend-engine.test.mjs` | Motor presente | Fluxo de tela completo. |
| Executor não propõe data | PRD revisão | contrato de comandos | Parcial | E2E com executor e ausência do campo. |
| TI com lag | PRD5, PRD revisão | testes de calendário/trend | Preservado | Edição visual por linha. |
| Subitens progressivos | PRD revisão | funções de hierarquia | Parcial | Cenário iniciado → detalhado → histórico. |
| Maior caminho do agrupador | decisões Grill-me | `expandedSummaryTi`, trend | Presente no código | Matriz de casos integrados. |
| Meu painel | plano Experience First | `renderOperationalAttention`, drawer | Implementado parcialmente | Browser e inspeção visual. |
| Ordenação por cabeçalho | plano Experience First | `data-gantt-sort` | Implementado parcialmente | Persistência e teste comportamental. |
| Mapa determinístico | PRD revisão | `dist/graph.js` | Não conforme | Implementação do layout determinístico. |
| Arquivamento por raiz | plano Experience First | `renderArchivedItemsGrouped` | Parcial | Restauração de raiz e descendente. |
| Responsividade | PRD3, plano UX | browser-tests existentes | Parcial | Cenários do novo drawer/Gantt. |
| Consistência entre visões | PRD3/PRD5 | testes PRD4/PRD5 | Parcial | Repetir após cada mutação nova. |

## 10. Resíduos e itens candidatos à remoção

Não remover nesta etapa. Primeiro validar dependências e compatibilidade.

### Candidatos

- `graphPositions` e handlers de posição livre após mapa determinístico validado.
- Código duplicado de arraste temporal em `dist/workspace.js`.
- Regras CSS duplicadas da faixa de compromisso.
- Caminhos de modelo que misturam gestão e criação.
- Testes antigos que validam apenas texto interno, quando houver teste comportamental equivalente.
- Adaptadores temporários de campos legados somente depois de migração e backup verificados.

### Preservar mesmo que pareçam antigos

- migrações;
- leitura compatível de dados existentes;
- auditoria;
- backup/restauração;
- GPO server-side;
- testes de segurança e concorrência;
- campos legados necessários para rollback documentado.

## 11. Ordem de implementação recomendada

### Fase 0 — Reprodução e evidência

1. Criar fixture com baseline, acordo e tendência diferentes.
2. Abrir a aplicação real.
3. Capturar payload, `state`, DOM e tela.
4. Corrigir a primeira falha observada, sem refatoração ampla.

### Fase 1 — Cadeia temporal

1. Fechar baseline/acordo/tendência.
2. Validar medição e reagendamento.
3. Validar TI, lag e maior caminho.
4. Validar preservação após reload.

### Fase 2 — Consistência e hierarquia

1. Detalhamento progressivo.
2. Arraste hierárquico.
3. Relações TI resumidas.
4. Arquivamento/restauração.

### Fase 3 — Experiência operacional

1. Meu painel.
2. Ordenação e filtros.
3. Gantt responsivo.
4. Relações por linha.

### Fase 4 — Mapa executivo

1. Implementar layout determinístico.
2. Remover posições livres após migração.
3. Validar agrupamento por responsável, empresa e projeto.

### Fase 5 — Limpeza

1. Remover duplicações comprovadamente sem uso.
2. Atualizar documentação e planos.
3. Rodar suíte completa e inspeção visual.

## 12. Critérios de aceite por etapa

### Cadeia temporal

- API retorna baseline, acordo e tendência.
- Frontend hidrata os três dados com IDs correspondentes.
- DOM possui três camadas identificáveis.
- Tela mostra as três camadas com legenda.
- Recarregar mantém os dados.

### Medição

- Executor vê percentual previsto na data/hora.
- Executor não vê campo de nova data.
- Impedimento exige fato/justificativa no mesmo registro.
- Tendência muda após salvar.
- Baseline e compromisso permanecem iguais.

### Hierarquia/TI

- Criar subitem não apaga histórico.
- Arraste para agrupador preserva intenção resumida.
- TI editada mantém identidade.
- Ciclos são rejeitados sem mutação parcial.

### UX

- Meu painel é opcional e não empurra o Gantt.
- Usuário identifica pendência, causa, impacto e responsável.
- Gantt não exige rolagem horizontal para a ação principal em viewport alvo.
- Arraste de datas e linhas não é bloqueado por camadas visuais.

### Mapa executivo

- Layout é determinístico.
- Agrupamento altera contêineres, não o cronograma.
- Responsável pela interrupção é visível.
- Posições livres não são persistidas.

## 13. Validação executada na auditoria inicial (histórico)

Executado:

- leitura integral dos 74 arquivos do escopo;
- inventário de documentação, código e testes;
- busca de símbolos de compromissos, tendências, Gantt, grafo, preferências e interações;
- comparação entre PRDs, planos e implementação atual.

Não executado nesta etapa:

- `npm run check`;
- `npm run check:backend`;
- suítes Node;
- browser-tests;
- inspeção visual em navegador;
- teste de payload/runtime da projeção.

O shell atual não possui `node`, `npm` nem host de navegador disponível. Portanto, nenhuma conclusão visual ou de execução foi promovida a “conforme”.

## 14. Próxima etapa mínima definida na auditoria inicial (histórico)

Não iniciar uma revisão geral de código ainda.

A próxima etapa deve ser uma reprodução controlada da cadeia baseline → compromisso → tendência no Gantt, com dados diferentes e inspeção do caminho API → state → DOM → tela.

Somente depois dessa evidência devem ser feitas as correções e a limpeza associadas.

## 15. Conclusão da auditoria

O produto possui um núcleo de backend significativamente mais completo do que a interface demonstra. O principal risco atual é a divergência entre:

- requisitos já definidos;
- funções parcialmente implementadas;
- código legado ainda ativo;
- testes que não cobrem a experiência visual;
- planos que não refletem o estado real.

A plataforma não deve receber novas funções amplas antes de fechar a rastreabilidade e a prova visual da cadeia temporal. O próximo trabalho deve ser orientado por evidência, em unidades pequenas, preservando o core e removendo somente resíduos comprovados.

## 16. Execução posterior à auditoria

Foi aplicada uma correção de ponte no Gantt para o primeiro item classificado como `corrigir/verificar`:

- `ganttCommitmentsFor(item)` usa os compromissos autorizados retornados pela API;
- quando a projeção ainda não contém uma linha legada de baseline ou acordo, usa os campos migrados do próprio item como fallback compatível;
- as três camadas passaram a ter marcadores semânticos `data-gantt-layer="baseline|agreement|trend"`;
- a regra CSS duplicada da faixa de compromisso foi consolidada em `pointer-events:none`, evitando que a faixa bloqueie arraste ou clique.
- `browser-tests/commitments-trend-e2e.mjs` passou a exigir as três camadas semânticas e a legenda no Gantt.
- `tests/prd43.test.mjs` passou a verificar os marcadores das camadas e a separação entre medição factual e edição genérica.

Também foi removido do formulário genérico de edição, quando o backend está ativo, o campo direto de `progressPercent`. O avanço passa a ser informado somente pelo formulário de medição, que registra data/hora e ocorrência. O teste E2E passou a verificar essa separação.

O Meu painel foi alinhado à prioridade confirmada: atenção/tendência, horizonte de próximas atividades e, por último, minhas ações. Os cartões de atenção passaram a mostrar causa, responsável, tendência, compromisso afetado e impacto. O browser-test passou a verificar a ordem e o fechamento por Escape.

Os cabeçalhos do Gantt passaram a oferecer filtro direto por coluna, persistido na preferência da visão, além da ordenação existente. O browser-test passou a filtrar uma atividade, conferir a ocultação da não correspondente e limpar o filtro antes de continuar o fluxo.

No backend, `graphPositions` deixou de ser uma preferência persistível. Dados legados podem continuar sendo lidos pelo frontend estático, mas novas gravações compartilhadas não preservam posições livres do mapa executivo.

A preferência `graphGrouping` foi alinhada entre servidor, adapter e interface. A escolha de agrupamento do mapa agora é persistida por usuário/workspace sem reintroduzir posições livres.

O arraste temporal do Gantt agora calcula explicitamente a nova janela antes de enviar a mutação. Quando o término projetado diverge do compromisso vigente, o usuário confirma o desvio; a baseline não é alterada. A mesma regra é aplicada ao redimensionamento pelas extremidades.

O editor em lote deixa de exibir e aceitar o campo direto de avanço quando o backend está ativo. Nesse modo, a medição factual continua sendo o único fluxo autorizado para registrar progresso; a compatibilidade do campo permanece apenas no modo estático legado.

O Gantt agora explicita a data de referência atual: a linha vertical “Hoje” aparece na régua e nas trilhas quando a data está dentro do horizonte, com a data formatada e item correspondente na legenda.

O Meu painel também exibe explicitamente a data de status usada para interpretar atenção e horizonte operacional.

A data de status também aparece no cabeçalho geral do workspace e no cabeçalho do painel Gantt, sem depender da abertura do Meu painel nem da leitura da régua temporal.

O backend passou a devolver um único `asOf` por projeção. Tendência, horizonte e a indicação visual de “Hoje” usam essa mesma referência, evitando divergência entre relógio do servidor e relógio local do navegador.

O handler legado duplicado de arraste temporal em `bindWorkspace` foi removido. O fluxo passa a ter uma única implementação em `prd43BindGantt`, incluindo deslocamento, redimensionamento e confirmação de impacto.

O formulário de medição passou a recalcular o percentual esperado para a data/hora selecionada. O backend oferece uma projeção histórica somente leitura (`asOf`) para esse preview; ela não executa o scheduler nem cria snapshots. Assim, o executor compara o avanço real com a referência correta da medição, sem preencher uma nova data.

O fluxo de atualização também passou a mostrar os contadores operacionais derivados: ciclo desde a liberação, espera, execução e bloqueio. Isso torna visível quanto tempo a atividade está em andamento sem exigir um campo adicional ao executor.

O campo de data/hora da medição recebe o limite máximo do instante de status e uma orientação explícita. O backend continua sendo a autoridade que rejeita registros futuros.

Como o mapa deixou de usar animação de forças, o menu de configuração mantém apenas zoom, enquadramento, agrupamento e os controles de percurso já cobertos pelos testes legados; a disposição do mapa não depende mais desses controles.

As preferências gerais deixaram de oferecer “restaurar posições” quando o backend está ativo, pois o mapa compartilhado não usa posições persistidas. O texto passa a explicar apenas os agrupamentos disponíveis.

Status: alteração aplicada, mas ainda não validada por execução real de navegador nesta sessão. Não classificar como concluída até confirmar payload, DOM, visibilidade e persistência.

## 17. Validação incremental posterior

Status atual desta seção: validada em execução real de navegador e nos testes direcionados abaixo. A anotação histórica de pendência acima permanece apenas como registro do estado anterior.

Foi corrigido um erro de sintaxe introduzido pela declaração duplicada de `renderBulkEditor`, que impedia o carregamento do frontend. A versão atual passa em `node --check` para os arquivos de aplicação e servidor.

Os testes de backend, projeção temporal, grafo determinístico, compromissos e interações do Gantt foram executados com sucesso. O teste de interações confirmou a data de status no workspace e a linha “Hoje” no Gantt.

Os testes antigos de PRD4 ainda possuem expectativas incompatíveis com decisões posteriores (motivo obrigatório de bloqueio e TI resumida em agrupadores); permanecem como resíduo de teste e não devem ser usados como prova de regressão do fluxo atual sem revisão.

Os testes direcionados `tests/prd43.test.mjs` e `tests/prd5.test.mjs` foram alinhados às decisões vigentes e passaram integralmente. Os browser-tests de compromissos/tendência e de interações do Gantt também passaram.

A correção de portabilidade em `tests/build-version.test.mjs` passou a usar o caminho do próprio Node e `fileURLToPath`, eliminando falhas artificiais em Windows com espaços e acentos no diretório.

O conjunto `tests/commitments-api.test.mjs`, `tests/backend-schedule.test.mjs` e `tests/backend.test.mjs` passou integralmente (38 testes). Isso comprova no servidor: medição factual, ausência vencida, reagendamento, TI com defasagem, maior caminho, hierarquia, quebra progressiva sem perda do avanço realizado, compromissos bilaterais e arquivamento.

O browser-test `prd43-responsive.mjs` revelou dois problemas reais e ambos foram corrigidos: o layout determinístico do grafo ainda entregava endpoints de aresta como strings, quebrando a renderização; e o Gantt mantinha overflow horizontal em breakpoints menores. O mesmo teste agora passa em seis larguras, inclusive 390 px.

O browser-test `prd5-full-acceptance.mjs` também passou integralmente. Foi corrigido o conflito entre o hitbox amplo das relações TI e os controles das colunas do Gantt, além de substituir o nome de ícone não disponível no bundle por um ícone existente.

O browser-test `gantt-date-drag-e2e.mjs` passou, comprovando deslocamento visual da atividade e persistência da nova janela no servidor, mantendo a baseline separada.

## 18. Evidência da rodada atual

Foi removida a gravação de posições livres do mapa determinístico: o layout continua calculado por agrupamento e nível lógico, enquanto zoom, enquadramento, seleção e relações permanecem disponíveis. O teste estático foi atualizado para refletir essa decisão, sem reintroduzir o menu legado de restauração de posições.

Os testes `tests/prd43.test.mjs`, `tests/prd5.test.mjs` e `tests/graph.test.mjs` passaram integralmente (20 testes). A validação de navegador `prd5-full-acceptance.mjs` passou com 14 verificações, `prd43-responsive.mjs` passou nos seis breakpoints e `gantt-interactions-e2e.mjs` confirmou ordenação, redimensionamento, reordenação e contenção responsiva.

A data de status/hoje foi confirmada no DOM em `[data-status-date]`, no Meu painel e no cabeçalho do Gantt; a linha Hoje permanece visível na régua quando dentro do horizonte. Portanto, a ausência reportada não reproduz na versão atual servida pela pasta `dist`.

O sufixo de cache dos assets foi renovado com `scripts/build-version.mjs`, evitando que o navegador reutilize a versão anterior de `workspace.js` e esconda a correção após a publicação.

Na mesma rodada, o mapa deixou de exibir nomenclatura de “animação” para o percurso determinístico; os controles agora descrevem reprodução, pausa e reinício da sequência. A ocorrência de medição `divergence` passou a ser exibida ao usuário como “Desvio”, mantendo o identificador de API estável.

A suíte backend direcionada passou integralmente com 83 testes, incluindo autenticação, GPO, calendário, reagendamento, medições, compromissos bilaterais, maior caminho, detalhamento progressivo, arquivamento e backup. Os browser-tests de compromissos/tendência, interações do Gantt e arraste de datas também passaram nesta rodada.

## 19. Fechamento da execução do objetivo

| Fase | Evidência final |
|---|---|
| Baseline, compromisso e tendência | Camadas semânticas e legenda no Gantt; E2E confirma as três camadas e histórico. |
| Medição e reagendamento | Backend cobre medição factual, projeção `asOf`, ausência vencida e reagendamento; tela mostra previsto na data e bloqueia futuro. |
| TI, defasagem e maior caminho | Backend cobre lag e maior caminho; Gantt mantém TI como dependência persistida e permite edição por linha. |
| Hierarquia e detalhamento | Backend preserva avanço ao quebrar atividade; criação e paridade entre Gantt/mapa foram verificadas no browser. |
| Meu painel e menus | Drawer fechado por padrão, ordem atenção → horizonte → ações, data de status visível e teste de abertura/fechamento. |
| Arraste, ordenação e filtros | E2E cobre arraste temporal, resize, reordenação, larguras persistidas e filtros por cabeçalho. |
| Mapa executivo | Layout determinístico, agrupamento configurável, sem persistência de posições livres e paridade de relações com o Gantt. |
| Responsividade | Testes em seis breakpoints, incluindo 390 px, sem overflow horizontal. |
| Limpeza | Handler temporal duplicado, nomenclatura de animação obsoleta, gravação de posições e ícone inválido removidos/corrigidos; cache dos assets renovado. |
| Validação final | 83 testes backend direcionados, 20 testes PRD/grafo, 13 testes de versão/PRD e browser-tests críticos aprovados. |
