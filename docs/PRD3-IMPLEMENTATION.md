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
