# PRD3 — Registro de implementação

**Branch:** `PRD3`  
**Status:** Em implementação; não declarar PRD3 integralmente concluído até fechar a matriz de requisitos e executar validação funcional na interface.

## Alterações aplicadas nesta rodada

- **Propagação do grafo:** a sequência passa a começar no item selecionado; percorre seus descendentes, retorna pelos ancestrais e percorre os demais ramos sem repetir nós. Componentes desconectados são visitados ao final para que o percurso cubra o grafo visível.
- **Movimentação dos nós:** aplicada a contingência do PRD3. Arrastar um nó move apenas o nó selecionado, em vez de deslocar todo o componente conectado. Arraste de grupo, pan, zoom e persistência de posição permanecem separados.
- **Templates:** “Modelos” mantém o modo de gestão; “Criar conforme template” abre o fluxo de seleção e revisão, com rótulo e ações distintos. O botão permanece ao lado de “Novo item”.
- **Edição de usuários:** o cadastro lista uma ação “Editar”; o formulário permite revisar nome, e-mail, empresa, setor, UF e perfil GPO, com validação de e-mail duplicado, escopo GPO e vínculo entre setor e empresa. A edição registra evento de cadastro e permite cancelar.
- **Tabela e responsividade:** reforçados ajuste automático de layout, alinhamento dos dados tabulares, quebra de texto e comportamento responsivo para telas menores.
- **Identidade do produto:** título do documento HTML padronizado para “Fluxo Visual”.
- **Validação automatizada:** criado `.github/workflows/prd3-validation.yml`, isolado do workflow de produção. Executa `npm ci`, `npm run check`, `npm test` e `npm run build` em pushes para `PRD3`.

## Validação observada

- A execução de CI no commit `540fdcf3cca3d1473df1dc552a9788e161c2eef9` concluiu com sucesso: sintaxe JavaScript, testes automatizados e build.
- A alteração posterior de arraste livre está em execução de CI no momento deste registro: [workflow](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39164124159).
- CI automatizado não substitui testes visuais e funcionais com dados reais, múltiplas resoluções e fluxos de interação.

## Requisitos ainda sujeitos a auditoria/implementação

Não considerar fechados sem evidência específica:

- Planejamento temporal completo para todas as relações TI/II/TT/IT, defasagens, paralelismo, ciclos e caminho crítico.
- Imutabilidade de baseline, repactuação explícita e histórico anterior/novo em todas as operações relevantes.
- Contenção ancestral sem duplicações em todos os caminhos de criação, indentação, movimento e arquivamento.
- Histórico de descendentes consultável no pai.
- Edição de relação preservando identidade e histórico em todos os campos suportados.
- Automação de status frente a múltiplas predecessoras, bloqueios, reabertura e aprovação.
- Progresso ponderado, sem dupla contagem de agrupadores.
- Aplicação completa de templates, relações internas, permissões e rollback transacional em falhas.
- Herança organizacional pelo responsável em itens já existentes, com consistência entre Sintética, Analítica e Gantt.
- Coloração configurável por indentação/projeto; datas e timer nos nós; destaque por responsável na árvore lateral.
- Critérios de aceite por resolução (1920, 1366, 1024, 768 e 390 px), teclado e acessibilidade.
- Teste manual da animação de propagação, incluindo origem em subitem, irmãos, ramos paralelos, ciclos, filtros e nós bloqueados.
- Verificação completa da edição de usuário e seus efeitos sobre itens atribuídos e permissões existentes.

## Restrições preservadas

Backend, banco de dados, autenticação remota, sincronização multiusuário, anexos remotos e cobrança continuam fora do escopo. Os dados permanecem locais no navegador; não afirmar sincronização entre dispositivos ou segurança SaaS.


## Correções funcionais adicionais — 18/10/2026

- **Contenção ao mover subárvore:** `moveItemHierarchy` agora percorre o item movido e todos os seus descendentes e sincroniza os vínculos `CONTÉM` de cada um. Isso evita que netos mantenham vínculos com ancestrais antigos após a mudança de pai. Teste de regressão incluído em `tests/core.test.mjs`.
- **Duração ausente no Gantt:** a análise não presume mais duração de um dia quando faltam duração explícita e intervalo válido de datas. O cronograma permanece marcado como não confiável e informa quais dados precisam ser preenchidos. Teste de contrato incluído em `tests/prd3-ui-contract.test.mjs`.
- **Previsão na criação:** a previsão final só é apresentada quando existe duração válida; a interface não exibe uma data calculada a partir de duração presumida.
- **Criação de subitens:** o início de referência é herdado do pai e não exige uma data inicial individual para cada subitem; a duração permanece explícita e obrigatória.
- **CI:** a execução mais recente consultada antes deste registro concluiu com sucesso em sintaxe, testes automatizados e build: https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39165111757.

## Estado real

Essas correções não significam que o PRD3 esteja concluído. Permanecem obrigatórias a auditoria requisito a requisito, a validação dos cálculos de cronograma para todas as relações e defasagens, os testes de consistência entre as três visões e os testes de interação/responsividade. Não realizar deploy de produção enquanto esses itens não estiverem fechados e evidenciados.

- **Rede temporal:** o recálculo agora respeita a data baseline como limite mínimo para o início de uma atividade dependente; uma restrição calculada não antecipa a atividade para antes do início idealizado original. Testes cobrindo TI, II, TT, IF e ciclos foram adicionados.
- **Integridade transacional:** se a edição de um item provocar um ciclo temporal, a operação é revertida, incluindo alterações nos itens e eventos gerados. Teste de regressão incluído.
- **Grafo Analítico:** os nós exibem início e término idealizados, além da baseline; o texto de interação foi ajustado ao comportamento real de arraste individual.
- **Validação adicional:** testes dinâmicos de cronograma cobrem paralelismo, caminho crítico, duração ausente e ciclos: https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39165465303.

- **Cores de linhas:** a Sintética agora permite definir preenchimento por nível hierárquico e substituir por cor específica de projeto; a preferência é local, persistida no navegador e possui restauração padrão.
- **Cores de estado no Gantt:** o rótulo do item na linha do Gantt usa a cor configurada para o estado. O grafo também aplica a cor de estado ao contorno e ao rótulo de status do nó.
- **Identidade textual:** README atualizado para “Fluxo Visual” e para descrever o arraste individual real do grafo.
- **Auditoria rastreável:** matriz de 33 requisitos PRD2 e 13 transversais criada em `docs/PRD3-AUDIT.md`; os requisitos ainda não têm conformidade integral estão explicitamente marcados como parciais, com pendências registradas.
- **CI:** testes, verificação de sintaxe e build passaram em https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39165896828.

- **Estados no Gantt:** além da cor configurável, o Gantt agora apresenta o ícone configurado para o estado da atividade.
- **CI após as alterações de aparência:** sintaxe, testes automatizados e build passaram: https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39165953797.
- **Matriz de auditoria:** consultar `docs/PRD3-AUDIT.md` para o estado de cada um dos 33 requisitos e dos 13 requisitos transversais. A matriz continua registrando itens parciais; portanto, a branch ainda não está liberada para produção.

- **Validação de cores de linha:** teste dinâmico confirma prioridade da cor do projeto sobre a cor do nível e rejeição de valores inválidos, com fallback seguro para a cor hierárquica.
- **CI mais recente:** https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39166024260 — sintaxe, testes e build aprovados.
