# PRD3 — Matriz de auditoria de requisitos

**Branch:** `PRD3`  
**Data:** 18/10/2026  
**Decisão de release:** não publicar em produção enquanto qualquer requisito P0 estiver parcial/defeituoso ou enquanto a validação funcional completa não tiver evidência.

`Parcial` significa que há implementação ou teste limitado, mas falta evidência para declarar conformidade integral. A prioridade P0/P1/P2 foi copiada do PRD3 e funciona como risco de release.

| ID | Fonte | Requisito / critério de aceite | Prioridade | Arquivos afetados | Estado | Testes, evidência e pendência | Decisão |
|---|---|---|---|---|---|---|---|
| R2-01 | PRD2 | Ao criar ou mover um item para subitem, vinculá-lo a todos os pais pela relação CONTÉM | P0 | dist/app.js; tests/core.test.mjs | Parcial | Contenção sincronizada na subárvore ao mover; testes cobrem neto/ancestrais e rollback transacional de movimento e criação quando a validação temporal falha. Falta validar criação, reordenação, remoção e restauração em todos os caminhos. | Não liberar; fechar pendências |
| R2-02 | PRD2 | Redimensionar, ocultar e mostrar colunas na Sintética | P0 | dist/workspace.js; dist/styles.css; tests/prd3-ui-contract.test.mjs | Parcial | Colunas ocultáveis e redimensionamento por arraste foram verificados em Chromium; viewport móvel de 390px foi testada. Faltam as cinco resoluções completas e teste de redimensionamento por teclado. | Não liberar; fechar pendências |
| R2-03 | PRD2 | Histórico dos filhos consultável no histórico do pai | P1 | dist/workspace.js; tests/prd3-ui-contract.test.mjs | Parcial | Histórico consulta descendentes e identifica a origem; teste de agregação e filtro de visibilidade incluído. Faltam permissões, arquivamento e duplicação. | Não liberar; fechar pendências |
| R2-04 | PRD2 | Trabalhar com durações e relações, não exigir datas individuais na criação de cada atividade | P0 | dist/app.js; dist/workspace.js; tests/core.test.mjs; tests/prd3-ui-contract.test.mjs | Parcial | Duração explícita, previsão sem duração presumida, início herdado e duração por etapa em lote. Falta validar a pré-visualização integrada antes da confirmação. | Não liberar; fechar pendências |
| R2-05 | PRD2 | Início e término idealizados imutáveis após criação, salvo repactuação explícita | P0 | dist/app.js; tests/core.test.mjs | Parcial | Baseline e repactuação separadas; testes existentes confirmam baseline preservada. Falta auditar todas as operações e eventos. | Não liberar; fechar pendências |
| R2-06 | PRD2 | Previsão derivada das durações e relações | P0 | dist/app.js; dist/workspace.js; tests/core.test.mjs; tests/prd3-ui-contract.test.mjs | Parcial | Rede temporal, paralelismo, caminho crítico, ciclos e fórmulas TI/II/TT/IF têm testes dinâmicos. Falta validação integrada com dados reais. | Não liberar; fechar pendências |
| R2-07 | PRD2 | Transformar um tipo de item em aprovação | P1 | dist/app.js; tests/core.test.mjs | Parcial | Conversão para aprovação preservando ID, relações e histórico tem teste de regressão. | Não liberar; fechar pendências |
| R2-08 | PRD2 | Editar uma relação sem excluir e recriar | P1 | dist/app.js; tests/core.test.mjs | Parcial | Edição preserva ID da relação e registra evento; teste de regressão incluído. Faltam permissões e rollback de todas as transições. | Não liberar; fechar pendências |
| R2-09 | PRD2 | Perfis GPO padrão atribuíveis a usuários e exceções individuais | P0 | dist/app.js; tests/core.test.mjs | Parcial | Perfis GPO e exceções têm testes existentes. Falta matriz completa de precedência, herança e edição posterior. | Não liberar; fechar pendências |
| R2-10 | PRD2 | Histórico detalhado: estado anterior/novo, usuário, empresa, data e hora | P1 | dist/app.js; dist/workspace.js; tests/core.test.mjs | Parcial | Eventos capturam snapshots de ator/contexto e valores anterior/novo. Falta cobertura sistemática por operação. | Não liberar; fechar pendências |
| R2-11 | PRD2 | Editar item pai: nome, responsável e término idealizado; previsto herdado | P0 | dist/app.js; dist/workspace.js; tests/core.test.mjs | Parcial | Edição de pai e previsão herdada existem em parte. Falta validar repactuação, baseline e recálculo em todos os casos. | Não liberar; fechar pendências |
| R2-12 | PRD2 | Substituir BACKLOG por Lista de pendências | P1 | dist/app.js; dist/workspace.js | Parcial | Rótulo Lista de pendências existe. Falta validar compatibilidade com registros legados reais. | Não liberar; fechar pendências |
| R2-13 | PRD2 | “Pronto” substituído por “Liberado para execução”, atribuído automaticamente quando predecessor liberar | P0 | dist/app.js; tests/core.test.mjs | Parcial | Liberação automática tem testes de múltiplas predecessoras e bloqueios. Faltam reabertura, aprovação e fluxo completo. | Não liberar; fechar pendências |
| R2-14 | PRD2 | Remover “Em análise” e “Em correção” dos estados operacionais comuns | P1 | dist/app.js; dist/workspace.js | Parcial | Estados transitórios são omitidos de seletores comuns. Falta auditoria de todas as superfícies e dados antigos. | Não liberar; fechar pendências |
| R2-15 | PRD2 | Magnetismo dos nós inspirado em mindmap | P0 | dist/graph.js; dist/workspace.js; dist/styles.css; tests/prd3-ui-contract.test.mjs | Parcial | Fallback para arraste individual aplicado e testado por contrato. Falta teste manual de magnetismo, pan, zoom e persistência. | Não liberar; fechar pendências |
| R2-16 | PRD2 | IDs da Sintética renumerados após reordenação/indentação | P1 | dist/workspace.js; tests/core.test.mjs | Parcial | ID visual é derivado da ordenação exibida sem alterar ID interno. Faltam testes com todas as mudanças de hierarquia/filtro. | Não liberar; fechar pendências |
| R2-17 | PRD2 | Criar várias etapas de uma vez também em subitem | P1 | dist/workspace.js; tests/core.test.mjs; tests/prd3-ui-contract.test.mjs | Parcial | Criação em lote tem rollback em falha e exige duração por etapa. Falta teste funcional em subitem com dados individuais e relações internas. | Não liberar; fechar pendências |
| R2-18 | PRD2 | Alinhar integralmente o painel do item e remover textos auxiliares desnecessários | P1 | dist/workspace.js; dist/styles.css | Parcial | Painel reorganizado; falta inspeção visual para confirmar alinhamento e remoção de todos os textos. | Não liberar; fechar pendências |
| R2-19 | PRD2 | Propagação segue sequência da Sintética, passa pelos subitens, retorna ao pai e continua | P0 | dist/graph.js; dist/workspace.js; README.md | Parcial | Percurso começa no item selecionado, visita descendentes e retorna pelos ancestrais; documentação atualizada. Falta validação manual com filtros e grafos complexos. | Não liberar; fechar pendências |
| R2-20 | PRD2 | Padronizar proporção do eixo horizontal do Gantt | P1 | dist/workspace.js; dist/styles.css | Parcial | Eixo proporcional e ticks existem; faltam testes visuais de zoom e escalas curtas/longas. | Não liberar; fechar pendências |
| R2-21 | PRD2 | Escolher cor de preenchimento das linhas para diferenciar indentação e projeto | P1 | dist/workspace.js; dist/styles.css; tests/prd3-ui-contract.test.mjs | Parcial | Preenchimento da Sintética configurável por nível/projeto, com persistência e fallback seguro. Falta validar contraste e múltiplas resoluções. | Não liberar; fechar pendências |
| R2-22 | PRD2 | Botão “Criar conforme template” ao lado de “Novo item” | P0 | dist/workspace.js; tests/prd3-ui-contract.test.mjs | Conforme | Ações Modelos e Criar conforme template são distintas e lado a lado; teste de contrato passou. | Aceito |
| R2-23 | PRD2 | Modificar cores e ícones dos estados | P1 | dist/app.js; dist/workspace.js; dist/graph.js; dist/styles.css; tests/prd3-ui-contract.test.mjs | Parcial | Cores aplicadas à tabela, grafo, Gantt e seletores; ícones configurados aparecem no Gantt. Falta comprovar consistência completa na legenda e tooltips. | Não liberar; fechar pendências |
| R2-24 | PRD2 | Percentual de avanço e estado se retroalimentam | P0 | dist/app.js; tests/core.test.mjs | Parcial | Avanço, conclusão, reabertura e bloqueios têm regras e testes. Falta matriz de transições de todos os estados. | Não liberar; fechar pendências |
| R2-25 | PRD2 | Exibir início idealizado, término idealizado e duração idealizada ao abrir item | P0 | dist/workspace.js | Parcial | Painel mostra início, término e duração; baseline separada. Falta revisão visual por tipo de item. | Não liberar; fechar pendências |
| R2-26 | PRD2 | Empresa, setor e estado herdados do responsável; remover de “Descrição e contexto” | P1 | dist/workspace.js; tests/prd3-ui-contract.test.mjs | Parcial | Empresa, setor e UF são derivados do responsável na entrada. Falta testar troca de responsável em itens existentes e fallback. | Não liberar; fechar pendências |
| R2-27 | PRD2 | Item cancelado com percentual de controle 100% | P1 | dist/app.js; tests/core.test.mjs | Parcial | Cancelamento define controle em 100% sem marcar conclusão operacional; teste dedicado incluído. | Não liberar; fechar pendências |
| R2-28 | PRD2 | Arquivar itens pais e filhos | P0 | dist/app.js; tests/core.test.mjs | Parcial | Arquivamento/restauração de subárvore tem testes. Faltam relações externas e permissões em todos os casos. | Não liberar; fechar pendências |
| R2-29 | PRD2 | Redimensionar painéis de cadastro e itens | P1 | dist/workspace.js; dist/styles.css | Parcial | Redimensionamento de painéis existe. Faltam testes de mouse/teclado, limites, persistência e telas pequenas. | Não liberar; fechar pendências |
| R2-30 | PRD2 | Simplificar “Mostrar subitens como na visão sintética” para “Mostrar subitens” | P2 | dist/workspace.js; tests/prd3-ui-contract.test.mjs | Conforme | Rótulo Mostrar subitens está presente na Sintética. | Aceito |
| R2-31 | PRD2 | Nome do programa “Fluxo Visual”, remover “Gestão Operacional” e substituir texto genérico pelo nome da organização | P1 | README.md; dist/index.html | Parcial | Título e README padronizados para Fluxo Visual. Falta auditar metadados, login e todos os textos. | Não liberar; fechar pendências |
| R2-32 | PRD2 | Grafo exibe término idealizado inicial abaixo do nome e timer do responsável | P1 | dist/graph.js; dist/workspace.js; dist/styles.css; tests/prd3-ui-contract.test.mjs | Parcial | Nós exibem início/término idealizados, baseline e responsável; timer mede tempo com o responsável atual. Falta validação visual em nós densos. | Não liberar; fechar pendências |
| R2-33 | PRD2 | Clicar no responsável na árvore lateral destaca os itens desse responsável | P1 | dist/workspace.js; dist/styles.css | Parcial | Árvore lateral oferece destaque por responsável. Falta teste de interação e reversão sem perda de contexto. | Não liberar; fechar pendências |

## Requisitos transversais

| ID | Fonte | Critério de aceite | Prioridade/risco | Arquivos/evidência | Estado | Pendência | Decisão |
|---|---|---|---|---|---|---|---|
| M-01 | PRD Mestre v1.1 | Preservar modelo amorfo e separar contenção de dependência temporal | P0 | dist/app.js; tests/core.test.mjs | Parcial | Falta regressão completa para todas as operações. | Não liberar |
| M-02 | PRD Mestre v1.1 | Consistência entre Sintética, Analítica e Gantt após mutações | P0 | dist/app.js; dist/workspace.js; dist/graph.js | Parcial | Falta teste integrado após cada mutação relevante. | Não liberar |
| M-03 | PRD Mestre v1.1 | Tipos configuráveis com campos obrigatórios, estados e transições coerentes | P1 | dist/app.js; dist/workspace.js | Parcial | Falta matriz por tipo e fluxo de aprovação. | Não liberar |
| M-04 | PRD Mestre v1.1 | Progresso ponderado sem dupla contagem e sem percentuais inventados | P0 | dist/app.js; tests/core.test.mjs | Parcial | Falta teste amplo para pesos ausentes e hierarquias profundas. | Não liberar |
| M-05 | PRD Mestre v1.1 | Atraso/risco/bloqueio como indicadores, não estados operacionais | P1 | dist/app.js; dist/workspace.js | Parcial | Falta validar todas as visões e filtros. | Não liberar |
| M-06 | PRD Mestre v1.1 | Caminho crítico/folgas corretos para rede temporal, paralelismo e defasagens | P0 | dist/workspace.js; tests/prd3-ui-contract.test.mjs | Parcial | Testes automatizados existem; falta validação integrada com dados reais. | Não liberar |
| M-07 | PRD Mestre v1.1 | Tooltip analítico completo | P1 | dist/graph.js; dist/workspace.js | Parcial | Falta inspeção visual e teste de todos os campos. | Não liberar |
| M-08 | PRD Mestre v1.1 | Árvore/filtros com expansão, seleção e combinações coerentes | P1 | dist/workspace.js | Parcial | Falta matriz de combinações de filtros. | Não liberar |
| M-09 | PRD Mestre v1.1 | Aprovações/correções preservam decisão, motivo, autor, data e rodada | P0 | dist/app.js; tests/core.test.mjs | Parcial | Falta teste integrado de todas as rodadas. | Não liberar |
| M-10 | PRD Mestre v1.1 | Templates preservam estrutura, relações, pesos, durações e rollback | P0 | dist/app.js; dist/workspace.js | Parcial | Falta validação de relações internas e falha transacional. | Não liberar |
| M-11 | PRD Mestre v1.1 | Limitações de anexos locais explicitadas; sem simular backend | P1 | dist/app.js; dist/workspace.js; README.md | Parcial | Auditar avisos em todas as superfícies. | Não liberar |
| M-12 | PRD Mestre v1.1 | GPO local com escopos, precedência e exceções; sem alegar segurança server-side | P0 | dist/app.js; tests/core.test.mjs; README.md | Parcial | Falta matriz completa; autorização é apenas client-side. | Não liberar |
| M-13 | PRD Mestre v1.1 | Critérios de aceite, testes e evidência rastreáveis | P0 | docs/PRD3.md; docs/PRD3-AUDIT.md; .github/workflows/prd3-validation.yml | Parcial | CI automatizado passa, mas faltam testes visuais/interação e fechamento dos itens parciais. | Não liberar |

## Correções transacionais recentes — aguardando CI

- `moveItemHierarchy` restaura itens, relações, eventos e relações arquivadas se a validação temporal falhar.
- `createItem` restaura itens, relações, eventos e relações arquivadas se a validação temporal falhar.
- `createRelation` preserva o `parentId` anterior quando a criação da relação CONTÉM é revertida por cronograma inválido.
- Foram adicionados testes de regressão para os três cenários. Não marcar como aprovados até verificar o resultado do workflow acionado por esses commits.

## Validação automatizada

- Execução integral bem-sucedida consultada: https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39167615310
- O workflow executa `npm ci`, `npm run check`, `npm test`, `npm run build` e smoke test de navegador Playwright em Chromium (navegação, Gantt, grafo, cor de linha, subitem, ocultação/redimensionamento de coluna e viewport móvel).
- CI verde não equivale a aprovação funcional final. Não foi realizado deploy de produção nesta branch.


### CI após correção do smoke test

A falha verificada no workflow `Validate PRD3` (run 39168227194) foi o teste de responsividade que usava `.drawer.count() === 0`, embora o painel fechado permaneça como elemento oculto no DOM. O teste passou a exigir `.drawer:visible`. A nova execução automática 39168432112 foi iniciada; não registrar como validada até que seu resultado terminal esteja disponível.


### Correção complementar do teste de fechamento

A execução 39168432112 reproduziu o erro após trocar a asserção de contagem para visibilidade: o painel de configurações continuava visível ao iniciar a matriz de viewports. O smoke test agora aguarda o elemento `.drawer` ser removido do DOM logo após o comando de fechar, antes de executar essa matriz. A execução 39168493777 está em andamento; o requisito permanece não validado até o CI concluir.


### Causa-raiz complementar identificada

A execução 39168432112 confirmou que o teste ainda falhava porque, após validar o formulário de criação do subitem, o próprio teste mantinha esse painel aberto e em seguida exigia zero painéis visíveis ao avaliar a matriz de viewports. O smoke test agora fecha o formulário e aguarda o painel ser removido antes de medir as resoluções. A execução correspondente é a [39168536101](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39168536101); confirmar o resultado antes de marcar CI como verde.


### Resultado confirmado do CI

- A correção do smoke test fechou o drawer de criação de subitem antes da matriz de resoluções. A execução [39168536101](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39168536101) terminou com `success`.
- O smoke test passou em 1920, 1366, 1024, 768 e 390 px; as etapas anteriores de `npm ci`, `npm run check`, `npm test`, build e instalação do Chromium também passaram.
- Resultado limita-se ao workflow de validação da branch `PRD3`. A auditoria funcional permanece aberta e a branch não foi publicada em produção.
