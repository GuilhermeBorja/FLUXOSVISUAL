# Fluxos · Gestão operacional

MVP navegável com uma única área operacional. O núcleo mantém Item, Relação, Evento e Pessoa/Papel; tabela e grafo consultam os mesmos registros e as mesmas alçadas.

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

Depois acesse `http://localhost:8080`.

## Fluxo de uso

1. Entrar com um perfil demonstrativo.
2. Usar a visão **Sintética** para consultar os projetos em tabela; ativar **Mostrar subitens** para expandir sua estrutura.
3. Usar a visão **Analítica** para ver os itens como nós conectados. Arrastar nós, ampliar, enquadrar e agrupar por projeto, responsável, empresa ou conexão. A posição dos nós é salva por usuário e agrupamento.
4. Selecionar uma linha ou um nó para atualizar nome, status, responsável, início, término e contexto. Cada mudança registra autor, data efetiva e data do registro.
5. Criar itens e subitens pelo painel lateral. Na criação de um projeto, adicionar várias etapas de uma vez e conectá-las por TI.
6. Consultar ou criar relações no painel do item; o histórico fica na aba do mesmo painel.
7. Administradores acessam usuários, empresas, setores e alçadas pelo painel **Cadastros**.
8. O nível 10 pode excluir itens pela lixeira da tabela ou do painel, e usuários, empresas e setores pelas lixeiras em **Cadastros**. A confirmação mostra quais vínculos serão alterados.

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

## Limites desta versão

Este MVP usa login por seleção de perfil e persistência local (`localStorage`), sem autenticação de aplicação nem sincronização entre navegadores. As alçadas são aplicadas na interface e nos comandos locais; não são uma barreira de segurança para uso de produção com múltiplas empresas. O acesso ao Site permanece privado. A próxima etapa de produto exige autenticação real, banco compartilhado e autorização no servidor antes de uso operacional entre empresas.

As relações TI/II/TT/IF são registradas e exibidas com defasagem. Esta versão não recalcula cronogramas nem impõe bloqueios automáticos de transição.

## Próxima evolução

- Backend com autenticacao.
- Banco PostgreSQL para itens, relacoes e eventos.
- Permissoes por empresa, contexto, papel e acao.
- Colaboracao em tempo real.
- Motor de regras e alertas.
- Integracao com IA para sumarizacao, gargalos e proximos passos.
