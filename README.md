# Fluxo Visual — PRD6

Gestão visual de projetos, atividades, dependências TI e aprovações, com Gantt estruturado e grafo analítico. A **PRD6**, versão **0.7.0-prd6**, integra o frontend PRD5 a um servidor com autenticação real, persistência compartilhada, autorização GPO, auditoria e anexos privados.

**Código desta implementação:** [branch PRD6](https://github.com/GuilhermeBorja/FLUXOSVISUAL/tree/PRD6), no repositório [GuilhermeBorja/FLUXOSVISUAL](https://github.com/GuilhermeBorja/FLUXOSVISUAL). O pacote entregue também contém o projeto completo para execução local. A demonstração estática existente continua disponível no [GitHub Pages](https://guilhermeborja.github.io/FLUXOSVISUAL/). Para usar as contas e os dados compartilhados desta versão, abra a URL do servidor iniciado abaixo.

## Executar com Node.js

Requisito: **Node.js 24 LTS**. Obtenha a PRD6 pelo GitHub ou extraia o pacote entregue. A instalação inicial cria um administrador e um workspace vazio.

```sh
git clone --branch PRD6 https://github.com/GuilhermeBorja/FLUXOSVISUAL.git
cd FLUXOSVISUAL
```

Na pasta do projeto:

```sh
npm ci
npm run build
cp .env.example .env
npm run setup -- --email seu@email.com --name "Seu nome" --organization "Sua empresa" --workspace "Sua obra" --state PE
npm start
```

No PowerShell, substitua `cp .env.example .env` por `Copy-Item .env.example .env`.

Abra **http://localhost:3000**. O setup apresenta uma senha aleatória uma única vez; use-a no primeiro login e altere-a pelo menu da conta. Também é possível fornecer uma senha de 12 a 128 caracteres por entrada padrão, conforme o [guia de operação](docs/BACKEND-OPERACAO.md). Não existem senhas padrão. Repetir o setup preserva a instalação existente.

Os scripts `start`, `setup`, `backup` e `restore` carregam `.env`. O banco SQLite e os anexos ficam em `DATA_DIR`, inicialmente `./data`. Mantenha esse diretório em armazenamento persistente.

## Executar com Docker Compose

Na pasta do projeto entregue, depois de copiar `.env.example` para `.env`:

```sh
docker compose build
docker compose run --rm fluxosvisual node scripts/setup.mjs --email seu@email.com --name "Seu nome" --organization "Sua empresa" --workspace "Sua obra" --state PE
docker compose up -d
docker compose logs -f fluxosvisual
```

O container utiliza usuário sem privilégios e volume persistente para os dados. Consulte [instalação, atualização e restauração](docs/BACKEND-OPERACAO.md) para portas, permissões do volume e proxy HTTPS. O endpoint `GET /api/health` verifica se o serviço responde e consegue consultar o banco.

## Funcionalidades implementadas

| Área | Comportamento |
| --- | --- |
| Contas e sessões | Login por e-mail e senha, scrypt, cookie HttpOnly, CSRF, limitação de tentativas, troca e redefinição de senha com revogação de sessões. |
| Workspace e GPO | Vínculo de acesso obrigatório, regras por usuário e perfil, escopo mais específico, Negar no empate e ausência de regra negando acesso. O servidor aplica a autorização às leituras e às alterações. |
| Hierarquia e TI | `parentId` como única origem da hierarquia; Contém derivado nas consultas; criação de árvore, movimentação e edição em lote atômicas; rejeição de ciclos, órfãos e TI entre grupos. |
| Cronograma | Dias corridos inclusivos, duração nula preservada, baseline, recálculo TI, resumos ponderados e criticidade somente com rede completa e válida. |
| Aprovações e bloqueios | Um aprovador por rodada, decisões imutáveis, reabertura em nova rodada, revisão após reprovação e fontes de impedimento resolvidas individualmente. |
| Cadastros e modelos | Empresas, setores, usuários, perfis, regras, cores/ícones por empresa, arquivamento e modelos com novas identidades. Aprovações copiadas começam pendentes. |
| Colaboração | Revisão do workspace e versão dos itens, resposta 409 para conflito, preservação do rascunho, atualização periódica entre sessões e preferências por pessoa/workspace. |
| Anexos e histórico | Conteúdo privado, SHA-256, links temporários com nova autorização, exclusão lógica, auditoria append-only e consulta paginada com filtros. |
| Operação | Configuração por ambiente, logs estruturados com correlação, backup online e restauração verificada de banco e anexos. |

A exportação operacional usa os dados autorizados da sessão. A projeção da API fornece o mesmo conjunto filtrado para Gantt, grafo e contadores; o cálculo é refeito no servidor ao gravar. O navegador não é fonte de autenticação, permissões, decisões históricas ou campos calculados.

## Configuração principal

| Variável | Padrão / finalidade |
| --- | --- |
| `HOST` | `127.0.0.1` com Node; `0.0.0.0` dentro do container. |
| `PORT` | `3000`; no Compose, é a porta publicada no host. |
| `DATA_DIR` | `./data` com Node; volume em `/var/lib/fluxosvisual` no container. |
| `PUBLIC_ORIGIN` | `http://localhost:3000`; URL exata do navegador. Exigida em produção, com HTTPS para origem pública. |
| `TZ` | `America/Sao_Paulo` no exemplo e no Compose. |
| `ATTACHMENT_MAX_BYTES` | `10485760` — 10 MiB por arquivo. |
| `ATTACHMENT_QUOTA_BYTES` | `1073741824` — 1 GiB por workspace, incluindo arquivos excluídos logicamente. |
| `ATTACHMENT_SCAN_COMMAND` | Executável opcional de inspeção de anexos; recebe o caminho do arquivo. |
| `REQUIRE_ATTACHMENT_SCAN` | `true` para recusar upload sem scanner configurado. |

O armazenamento desta versão foi preparado para **uma instância da aplicação por banco SQLite**, com disco local persistente. Hospedagem sem disco persistente ou múltiplas réplicas simultâneas exige adaptar a camada de armazenamento. O frontend e a API são servidos na mesma origem.

## Backup e recuperação

```sh
npm run backup -- /caminho/novo/backup
npm run restore -- /caminho/do/backup /caminho/novo/dados-restaurados
```

O backup pode ocorrer com o serviço ativo. A restauração valida manifesto, SHA-256, integridade e referências do banco, exige um destino novo/vazio e revoga sessões antigas. Siga o [procedimento completo de restauração](docs/BACKEND-OPERACAO.md#5-restaurar-sem-sobrescrever-a-instalação) para interromper o serviço, validar a recuperação e apontar a instalação ao novo diretório. A retenção dos backups é uma decisão operacional da empresa.

## Verificar a implementação

```sh
npm run check
npm run check:backend
npm run test:all
npx playwright install chromium
npm run test:backend:browser
node tests/backend-benchmark.mjs
```

A [workflow do backend](.github/workflows/backend.yml) executa testes de contrato, API, autorização, persistência, recuperação, três cenários completos de navegador, medição com 500 itens/1.000 relações e um teste do container com reinício e conferência de persistência.

Os testes de navegador usam instalações temporárias e contas próprias de teste. O [relatório de aceite](docs/backend-acceptance.md) distingue os resultados efetivamente executados e os limites das medições. `tests/core.test.mjs` contém cenários históricos anteriores à hierarquia canônica da PRD5; o gate atual usa `tests/prd5.test.mjs` e as suítes `backend*.test.mjs`.

## Organização do código

- `server/index.mjs`: servidor HTTP, rotas, frontend e anexos.
- `server/storage.mjs`, `auth.mjs`, `credential-policy.mjs`: persistência, sessões e administração de credenciais.
- `server/domain.mjs`, `commands.mjs`, `service.mjs`: domínio, validação, GPO, transações, projeções e auditoria.
- `dist/backend.js`: integração do frontend com a API.
- `dist/app.js`, `dist/workspace.js`, `dist/graph.js`: frontend integrado e regras compartilhadas originadas na PRD5.
- `scripts/setup.mjs`, `backup.mjs`, `restore.mjs`: instalação e recuperação.

O servidor executa as regras compartilhadas da PRD5 em contexto isolado, acrescidas de validação e autorização próprias. A API aceita comandos definidos; não executa código enviado pelo cliente. Os arquivos em `sources/` permanecem referências históricas; o frontend mantido neste repositório fica em `dist/`.

## Documentação e implantação

- [Instalação e operação](docs/BACKEND-OPERACAO.md)
- [Contrato HTTP e exemplos da API](docs/BACKEND-API.md)
- [Contrato funcional PRD5](docs/PRD5-BACKEND-CONTRATO.md)
- [Cobertura e resultados de aceite](docs/backend-acceptance.md)

O setup começa vazio e não importa automaticamente dados de demonstração armazenados em outro navegador. Uma migração de dados reais exige o arquivo de origem, mapeamento de contas e validação dos registros descrita no contrato PRD5.

Para disponibilizar o backend pela internet, é necessário definir o servidor/provedor, o volume persistente e a URL HTTPS. O GitHub Pages continua atendendo à demonstração estática; a execução do backend ocorre na instalação Node ou Docker.
