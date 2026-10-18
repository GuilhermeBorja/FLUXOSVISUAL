# Fluxos · Gestão operacional

MVP navegável com uma área operacional. O núcleo mantém Item, Relação, Evento e Pessoa/Papel; tabela, grafo e cronograma consultam os mesmos registros e alçadas. A branch `feature/prd-evolution` inclui os fluxos locais de GPO demonstrativo, aprovação, modelos reutilizáveis e análise de cronograma.

## Como abrir localmente

Para gerar as dependências visuais e verificar o código:

```bash
npm ci
npm run build
npm run check
npm test
```

Abra `dist/index.html` no navegador ou rode um servidor estático dentro desta pasta:

```bash
python3 -m http.server 8080 --directory dist
```

Depois acesse `http://localhost:8080`. A publicação de demonstração fica em [GitHub Pages](https://guilhermeborja.github.io/FLUXOSVISUAL/).

## Fluxo de uso

1. Entrar com um perfil demonstrativo.
2. Usar a visão **Sintética** para consultar os projetos em tabela; ativar **Mostrar subitens** para expandir sua estrutura.
3. Usar a visão **Analítica** para ver os itens como nós conectados. Navegar pela árvore lateral, arrastar nós, ampliar, enquadrar e agrupar por projeto, responsável, empresa ou conexão. A legenda pode destacar itens por status; passe o mouse sobre um nó para consultar progresso, previsão, desvios, bloqueios e dependências. As posições são salvas por usuário e agrupamento.
4. Usar a visão **Gantt** para consultar datas, dependências TI/II/TT/IF, previsão de término e caminho crítico. Os itens com prazo próximo ou vencido recebem indicadores de risco.
5. Selecionar uma linha ou um nó para atualizar nome, status, responsável, início, término, progresso e peso. Cada mudança registra autor, data efetiva e data do registro.
6. Criar itens e subitens pelo painel lateral. Na criação de um projeto, adicionar várias etapas de uma vez e conectá-las por TI.
7. Consultar ou criar relações no painel do item; o histórico fica na aba do mesmo painel. Para uma etapa de aprovação, envie a solicitação, registre aprovação ou rejeição com motivo, ou encaminhe para correção e reenvio.
8. Administradores acessam usuários, empresas, setores e alçadas pelo painel **Cadastros**. O nível 10 também configura regras locais de GPO e modelos de fluxo.
9. O nível 10 pode excluir itens pela lixeira da tabela ou do painel, e usuários, empresas e setores pelas lixeiras em **Cadastros**. A confirmação mostra quais vínculos serão alterados.

## Exclusão e vínculos

- Itens: excluir junto com todos os subitens ou excluir apenas o pai, mantendo os filhos diretos como itens independentes. Relações que envolvem itens excluídos são retiradas do grafo.
- Usuários: saem do cadastro e do login. É possível transferir suas demandas para outro responsável ou mantê-las sem responsável. Autoria e histórico continuam identificando o usuário original.
- Setores: se houver itens ou usuários vinculados, escolher outro setor da mesma empresa para recebê-los. Um setor vazio pode ser excluído diretamente.
- Empresas: exclusão conjunta de seus setores, usuários, itens e descendentes. A confirmação informa subitens de outras empresas incluídos na estrutura e demandas externas que ficam sem responsável.
- O usuário conectado e sua empresa exigem login com outro administrador antes da exclusão, para manter um acesso válido durante o teste.
- As exclusões removem os registros das telas ativas e preservam cópias históricas locais. A exportação administrativa inclui essas cópias e os eventos. Os dados já cadastrados são mantidos ao atualizar a interface.

## O que está implementado

- Nucleo conceitual: Item, Relacao, Evento e Pessoa/Papel.
- Login demonstrativo por usuario.
- Cadastro de empresas, setores, usuarios e niveis de permissao.
- Criacao de projetos, itens, subitens e relacoes.
- Relacoes TI, II, TT, IF, contem, bloqueia, aprova e conecta.
- Atualizacao operacional de status, responsavel, nome, prazo e data/hora da mudanca.
- Criacao de novas subetapas dentro de itens existentes.
- Tabela sintética com subitens expansíveis.
- Grafo analítico com nós móveis, agrupamentos, relações direcionadas e farol.
- Filtro de visualizacao conforme alcadas 1 a 10.
- Persistencia local via `localStorage`.
- Exportacao JSON do estado operacional.



## Recursos PRD disponíveis nesta branch

- **GPO demonstrativo:** regras para usuário ou nível de permissão, por operação e escopo global, empresa, setor, projeto ou item. Regras mais específicas prevalecem; regra de usuário prevalece sobre regra de nível no mesmo escopo; em empate, negar prevalece.
- **Aprovações:** submissão para análise, aprovação ou rejeição com motivo, rodadas de correção e reenvio, reabertura controlada, pré-requisitos por dependências e histórico local de decisões.
- **Modelos de fluxo:** salvar a árvore de um projeto/processo com relações internas e reaplicá-la em outro contexto, com datas deslocadas a partir do novo início.
- **Progresso e cronograma:** peso e percentual por atividade, progresso agregado ponderado, alertas de prazo e risco, cálculo de caminho crítico e data prevista no Gantt e no grafo.

Para começar, entre com um dos perfis demonstrativos. O perfil **Luis (nível 10)** acessa a configuração de GPO e Cadastros; outros perfis mostram diferentes alçadas. As regras, aprovações, modelos e dados de teste são armazenados apenas no navegador em uso. Use **Exportar** para guardar uma cópia JSON antes de limpar o armazenamento local.

## Limites desta versão

A demonstração usa login por seleção de perfil e persiste alterações no `localStorage` do navegador atual. Não há autenticação de aplicação, sincronização entre navegadores nem autorização no servidor. As regras de GPO neste protótipo ajudam a testar alçadas, mas não são uma barreira de segurança para operação real entre empresas. O GitHub Pages publica a aplicação e os dados demonstrativos; os dados alterados por uma pessoa permanecem no navegador dela.

O Gantt calcula datas em dias corridos a partir dos prazos e relações temporais cadastrados. Sem datas completas, mostra um aviso de previsão incompleta; ciclos nas dependências impedem o cálculo do caminho crítico. A liberação da aprovação verifica suas predecessoras temporais/bloqueadoras, mas os demais tipos de tarefa continuam com transições manuais. O limite de risco é configurável em dias na lógica local.

A versão sem servidor foi escolhida para permitir testar os fluxos do PRD agora. Autenticação integrada, colaboração e dados compartilhados seguem fora deste escopo.
