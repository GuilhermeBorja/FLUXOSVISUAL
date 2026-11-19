# PRD6 — aceite técnico do backend

Este registro acompanha a implementação PRD6, que integra o backend ao frontend originado na PRD5. A referência funcional é [PRD5 — contrato de dados](PRD5-BACKEND-CONTRATO.md); os comandos de instalação e operação estão em [BACKEND-OPERACAO.md](BACKEND-OPERACAO.md).

## Evidência remota da PRD6

Em **21/10/2026**, o [run de pull request 39661502630](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39661502630), vinculado ao [PR #5 — PRD6 sobre PRD5](https://github.com/GuilhermeBorja/FLUXOSVISUAL/pull/5), concluiu os dois jobs com **sucesso**.

O código validado é o commit [2fff88c2486a04cd462f03ea82d2f9126cd67050](https://github.com/GuilhermeBorja/FLUXOSVISUAL/commit/2fff88c2486a04cd462f03ea82d2f9126cd67050), com árvore fonte `8615c81ddf686f869bbca33d2d1cbff18f3c325f`. O checkout do CI registra a integração desse commit com a base PRD5 `501e5c6610245f1b284a1dc00f31fe768dab6f6e`. Os resultados abaixo se referem a essa revisão de código, anterior à atualização documental deste relatório.

| Job e evidência | Resultado confirmado |
| --- | --- |
| [acceptance — job 119435391713](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39661502630/job/119435391713) | Build e sintaxe; **7/7** verificações de contrato PRD5; **54/54** testes de backend; **3/3** fluxos Chromium; gate de desempenho aprovado |
| [container — job 119435391282](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39661502630/job/119435391282) | Imagem construída, setup, healthcheck, login, gravação de item/anexo, reinício e recuperação dos dados/download aprovados |

Os três fluxos de navegador concluíram com sucesso. O fluxo compartilhado confirmou as dimensões de 1366 × 768 e 1920 × 1080; administração registrou nove verificações e modelos/datas/comentários registrou cinco, ambos com `browserErrors: []`. As fases do contêiner e as medições completas deste run estão registradas nas seções seguintes.

## Escopo da verificação

Os testes usam Node.js 24, bancos SQLite temporários e requisições HTTP reais. A autenticação passa pelo endpoint de login; cookies e tokens CSRF são enviados como em uma sessão normal. As contas adicionais são provisionadas pela API de sincronização, com senha derivada no servidor. Cada cenário cria e remove sua própria instalação.

O navegador executa a página servida pelo backend em Chromium, com sessões independentes. Não há injeção de uma base demonstrativa no `localStorage` para fazer os cenários compartilhados passarem.

A execução final local de 21/10/2026 passou nos 54 casos abaixo, nos três fluxos Chromium e no gate de desempenho. A execução remota identificada acima confirmou os mesmos 54 casos, com zero falhas, além das sete verificações de contrato do frontend PRD5. Foram exercitados os seguintes conjuntos:

| Arquivo | Casos | Evidência principal |
| --- | ---: | --- |
| `tests/backend-auth.test.mjs` | 6 | Senhas, sessão, expiração, revogação, CSRF, origem, limite de tentativas e auditoria de acesso |
| `tests/backend.test.mjs` | 18 | HTTP, autorização, concorrência, transações, hierarquia, TI, bloqueios e aprovação |
| `tests/backend-api.test.mjs` | 9 | Endpoints REST, lote, auditoria, preferências e anexos privados |
| `tests/backend-security.test.mjs` | 4 | Escalada de privilégios, identidade compartilhada e exposição indireta de itens ocultos |
| `tests/backend-credential-policy.test.mjs` | 6 | Autorização antes da derivação de senhas, contexto anterior/novo e contas administrativas |
| `tests/backend-backup.test.mjs` | 3 | Backup online, restauração, manifesto, integridade dos anexos e sessões revogadas |
| `tests/backend-schedule.test.mjs` | 2 | Calendário inclusivo, caminho crítico, folga, duração indefinida e ponderação |
| `tests/backend-template.test.mjs` | 3 | Clone sem histórico, contexto do responsável, acesso à subárvore e importação atômica |
| `tests/backend-template-validation.test.mjs` | 3 | Estrutura e escolhas de modelos, ciclos, referências, tipos e números |
| **Total** | **54** | Casos automatizados, além dos fluxos completos no navegador e do benchmark |

## Regras verificadas

### Identidade e autorização

O cookie de sessão é `HttpOnly`, com `SameSite`, validade e opção `Secure` conforme a configuração. O token persistido no banco é derivado; senhas e tokens de sessão não aparecem no usuário público ou na projeção. O logout, a inativação e a troca de senha invalidam sessões anteriores. Expiração total e por inatividade são verificadas sem esperas longas artificiais.

Mutações sem CSRF ou com origem incompatível são rejeitadas antes da gravação. O limite de login retorna HTTP 429 e `Retry-After`. A corrida entre derivação de senha e inativação de uma conta também está coberta.

A regra GPO é aplicada no servidor. Um `Negar` por item prevalece sobre `Permitir` global; no mesmo grau de especificidade, `Negar` de perfil prevalece sobre `Permitir` de usuário. Ausência de regra nega acesso. Trocar `currentUserId` no JSON da aplicação não troca o ator autenticado.

Também foram reproduzidos e transformados em regressões dois caminhos de escalada: atribuir um perfil administrativo durante a criação/edição de conta e redefinir a senha de um administrador com apenas `manage_users`. A autorização usa a situação anterior à mutação. Uma recusa anterior à derivação de senha deixa trilha de autorização. Redefinições autorizadas registram ator, alvo e correlação, sem senha ou hash em auditoria/logs. A administração de um workspace não altera a identidade global de alguém com vínculo ativo em outro workspace.

### Segregação e leitura

Um administrador com permissão global no primeiro workspace continua sem acesso ao segundo workspace sem vínculo. IDs de outro workspace não podem ser usados como referências de relações. Empresa, setor e UF do item acompanham o responsável.

A projeção usa o conjunto autorizado também no Gantt, grafo e contadores. Relações e pais que apontam para itens ocultos não fornecem acesso indireto. A regressão de confidencialidade verifica, além dos itens, comentários automáticos sobre relações, fontes de bloqueio e snapshots do histórico: título, motivo e ID de uma origem negada não são revelados pelo item dependente.

### Transações e concorrência

Uma árvore com três níveis e TI entre folhas é criada em um único commit. Um erro em uma linha cancela a árvore inteira e identifica a linha inválida. O lote inválido devolve os resultados por item como cancelados; nenhum registro parcial, revisão nova ou evento operacional de sucesso permanece.

O backend exige revisão para comandos compostos. O PATCH exige versão ou `If-Match`; a primeira edição confirmada permanece quando outra sessão tenta salvar uma versão antiga. O navegador preserva o rascunho quando recebe HTTP 409 e pede revisão dos dados atuais.

O teste cobre pai único, referência ao próprio item, órfãos, ciclos da hierarquia e TI em um item que deixou de ser folha. `Contém` é gerado na leitura a partir de `parentId`, sem persistir uma segunda hierarquia. Remover TI exige `delete_relation`; arquivar/restaurar uma árvore respeita as permissões dos descendentes.

### Cronograma, bloqueios e aprovação

Uma rede em diamante com durações de 2, 3, 1 e 2 dias tem duração total inclusiva de 7 dias. O servidor identifica os três itens críticos e a folga de 2 dias no ramo curto. Ao remover a duração de uma atividade, a rede fica incompleta e deixa de afirmar criticidade e folga. Duração ausente permanece `null`.

Datas inexistentes no calendário são rejeitadas. TI recalcula datas projetadas preservando a baseline. O resumo ponderado considera as folhas e seus pesos, exclui as canceladas e atualiza os ancestrais. Reabrir uma folha antes concluída também reabre o resumo do pai.

Dois impedimentos independentes mantêm o dependente bloqueado até que ambas as fontes sejam resolvidas. O motivo é obrigatório. Uma atividade em execução continua em execução e recebe o alerta herdado, com suas fontes, em vez de perder o progresso existente.

A aprovação exige a permissão específica e o aprovador designado. A rodada pendente, sua decisão e eventual cancelamento são persistidos. Decidir novamente a mesma solicitação é rejeitado. A reabertura inicia outra rodada sem alterar a decisão anterior; adulterar `approvalDecisions` no snapshot do cliente não reescreve o histórico.

### Modelos

O clone recebe novas identidades, preserva árvore, ordem, TI, peso e duração explícita ou `null`, e desloca as datas para o início escolhido. Empresa, setor e UF acompanham cada responsável escolhido, inclusive quando pertence a outro setor da mesma empresa. Uma aprovação clonada começa pendente, sem decisões ou solicitações da execução anterior. Anexos e histórico operacional também permanecem vinculados à origem.

Salvar um modelo exige acesso a todos os descendentes. A validação do modelo exige uma única raiz, referências existentes, TI entre folhas, ausência de ciclos e duplicatas, números válidos e empresa existente. A aplicação valida setor, data inicial e escolhas por item. Importar um modelo inválido cancela também as outras alterações do mesmo snapshot e preserva a versão anterior. A autorização continua a cargo dos comandos do servidor; normalizar um modelo não concede permissão.

### Anexos e preferências

Uploads têm validação de extensão, conteúdo esperado, tamanho e quota, com SHA-256 e metadados persistidos. Arquivos ficam fora da raiz pública. A URL temporária exige a sessão do usuário ao qual foi emitida; um colega autorizado solicita sua própria URL. Assinatura inválida, inclusive um valor Unicode de tamanho inesperado, retorna erro controlado.

A exclusão é lógica e preserva os bytes para a trilha histórica e o backup. A ausência do scanner quando a varredura é obrigatória, ou uma reprovação pelo processo configurado, impede o upload e limpa o arquivo temporário. Esse teste verifica a integração e a recusa de arquivos; a eficácia de um produto antivírus depende da ferramenta instalada no ambiente de operação.

Preferências de colunas, agrupamento e posições do grafo pertencem ao usuário e workspace. Outra sessão da mesma pessoa recupera as escolhas; o colega mantém suas próprias preferências.

### Auditoria e recuperação

Eventos registram ator, contexto, valores anteriores/posteriores, instante efetivo, instante de gravação e correlação. A consulta possui filtros e paginação. Os testes tentam modificar os registros de auditoria, acesso e decisões diretamente no SQLite e confirmam as proteções de escrita append-only.

O backup é produzido com a instalação aberta. Na restauração, a conta, os dados e os bytes dos anexos são recuperados, as sessões anteriores são revogadas e o evento de restauração é registrado. O destino existente é recusado.

Arquivo alterado, caminho inseguro ou entrada de anexo ausente no manifesto interrompe a restauração antes da criação de uma instalação parcial. A comparação cobre os anexos referenciados pelo banco, incluindo os excluídos logicamente. Um backup com blob referenciado ausente também é recusado.

## Fluxos no navegador

`browser-tests/backend-e2e.mjs` cobre login, criação de projeto com subitens e TI, edição compartilhada por duas pessoas, salvamento confirmado, conflito com preservação de rascunho, upload/download, preferências por usuário e logout. As dimensões de 1366 × 768 e 1920 × 1080 são verificadas, incluindo ausência de overflow residual no Gantt.

`browser-tests/backend-admin-e2e.mjs` cobre cadastro de conta com senha real, mudança de perfil refletida na outra sessão, empresa, setor, personalização de status e tipos, novo perfil/regra GPO, atualização de contexto do usuário e trocas de senha com revogação de sessão.

`browser-tests/backend-template-e2e.mjs` cobre modelos com pais criados depois dos filhos, duração explícita ou nula, nova aprovação sem decisões anteriores, datas TI recalculadas sem edição manual do dependente, limpeza da duração e comentários isolados na auditoria. Os três scripts verificam erros de página; os fluxos compartilhado e de administração também verificam avisos relacionados a ícones.

## Desempenho com 500 itens e 1.000 TI

O benchmark usa 10 projetos, 490 folhas, 1.000 TI e 490 relações `Contém` derivadas. Todos os 1.500 comandos de criação são enviados em uma transação HTTP. São descartadas duas leituras de aquecimento, seguidas de 20 leituras medidas e 20 edições medidas.

### Medição remota do código validado

O [job acceptance do run 39661502630](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39661502630/job/119435391713) registrou o benchmark às **19:26:55 UTC de 21/10/2026**, com Node.js **24.21.0**, Linux x64 e **AMD EPYC 9V74 80-Core Processor**. O transporte foi HTTP loopback, em processo único no runner.

A criação atômica dos 500 itens e 1.000 TI levou **1.394,2 ms**. As operações seguintes tiveram estes resultados:

| Operação | Amostras | Mediana — p50 | p75 | p95 | Máximo | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Projeção | 20 | 203,0 ms | **210,1 ms** | 232,6 ms | **243,9 ms** | p75 < 2.500 ms — aprovado |
| Edição | 20 | 489,5 ms | 496,9 ms | **503,9 ms** | **511,5 ms** | p95 < 1.000 ms — aprovado |

Nesta execução, inclusive os máximos ficaram abaixo dos respectivos limites de 2.500 ms e 1.000 ms. Não houve amostra acima desses limites entre as 20 leituras e 20 edições medidas. O conjunto é uma medição controlada no CI; os percentis e máximos apresentados não garantem a mesma latência sob carga ou rede diferentes.

### Registro da execução local

Medição final local registrada em 21/10/2026, após as integrações de segurança e modelos, em Node.js 24.19.0, Linux x64, AMD EPYC 9V74, HTTP loopback, processo único:

| Operação | Medição | Referência do gate |
| --- | ---: | ---: |
| Criação atômica dos 500 itens e 1.000 TI | 1.870,0 ms | Informativa |
| Projeção p50 | 275,2 ms | Informativa |
| Projeção p75 | **295,2 ms** | < 2.500 ms |
| Projeção p95 | 335,1 ms | Informativa |
| Edição p50 | 635,5 ms | Informativa |
| Edição p95 | **668,0 ms** | < 1.000 ms |

As medições incluem autenticação, GPO, SQLite, auditoria, serialização e transferência HTTP local da projeção. A meta em rede corporativa também depende do servidor escolhido, da latência e da renderização no computador do usuário; os resultados permitem repetir a comparação sem afirmar a homologação desse ambiente externo.

## Reproduzir

Execute na raiz do projeto com Node.js 24:

```sh
npm ci
npm run build
npm run check
npm run check:backend
npm test
npm run test:backend
npx playwright install chromium
node browser-tests/backend-e2e.mjs
node browser-tests/backend-admin-e2e.mjs
node browser-tests/backend-template-e2e.mjs
node tests/backend-benchmark.mjs
```

Para tornar os limites locais do benchmark obrigatórios:

```sh
FLUXOS_PERFORMANCE_GATE=true node tests/backend-benchmark.mjs
```

Os testes HTTP precisam que o ambiente permita abrir uma porta em `127.0.0.1`. Nenhuma instalação real ou senha de produção é necessária. As senhas dos fixtures são exclusivas de testes.

## CI e validação do contêiner

O workflow `.github/workflows/backend.yml` executa build, sintaxe, contratos do frontend, testes de backend, os três fluxos Chromium e o benchmark. Um job independente roda `tests/backend-container-smoke.mjs`.

O smoke Docker usa projeto e volume próprios, gera uma senha aleatória sem imprimi-la, faz o setup por stdin, espera o healthcheck, autentica, grava item/anexo, reinicia o serviço e verifica a persistência. Ao terminar, remove apenas o projeto de teste.

O [job container do run 39661502630](https://github.com/GuilhermeBorja/FLUXOSVISUAL/actions/runs/39661502630/job/119435391282) executou esse fluxo com sucesso. As fases registradas em **21/10/2026**, em UTC, foram:

| Horário | Fase iniciada e verificada |
| --- | --- |
| 19:25:33 | Build da imagem |
| 19:25:45 | Setup privado com a senha fornecida por stdin |
| 19:25:46 | Inicialização e espera do healthcheck |
| 19:25:51 | Login e persistência inicial de item/anexo |
| 19:25:52 | Reinício do serviço e nova espera de saúde |
| 19:25:57 | Novo login, dados preservados e download do anexo |
| 19:25:58 | Confirmação de sucesso, seguida da limpeza do projeto de teste |

O teste comparou o item, a identidade da conta, o SHA-256 do anexo e seus bytes após o reinício. As requisições do smoke usam conexões HTTP novas para atravessar o reinício sem reaproveitar um socket encerrado; os logs de diagnóstico identificam fase, método e caminho, sem senhas, cookies ou assinaturas da URL de download.

Para reproduzir em um host com Docker Compose:

```sh
node tests/backend-container-smoke.mjs
```

**Ambiente verificado:** a CLI Docker não estava disponível no ambiente de desenvolvimento local; o build e a execução do contêiner foram confirmados remotamente pelo job acima. Essa evidência usa um servidor temporário no runner do GitHub Actions. A configuração do ambiente operacional, do host, do domínio e de HTTPS segue o [manual de operação](BACKEND-OPERACAO.md).
