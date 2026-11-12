# PRD6 — contrato HTTP do backend

Versão da implementação: **0.7.0-prd6**. Prefixo: `/api`. O servidor entrega também o frontend, na mesma origem. Todas as rotas de workspace exigem sessão válida, vínculo ativo e permissões GPO aplicáveis; a identidade vem exclusivamente da sessão.

## Autenticação

| Método e caminho | Entrada / resposta |
| --- | --- |
| `GET /api/health` | Público. `{ "status": "ok", "version": "0.7.0-prd6" }` após consulta ao banco. |
| `POST /api/auth/login` | `{ "email": "...", "password": "..." }`; retorna usuário, workspaces, workspace inicial, `csrfToken` e expiração; define cookie `fv_session`. |
| `GET /api/auth/session` | Recupera a sessão e o token CSRF; 401 quando expirada ou revogada. |
| `POST /api/auth/logout` | Revoga a sessão atual e limpa o cookie. |
| `POST /api/auth/password` | `{ "currentPassword": "...", "newPassword": "..." }`; revoga todas as sessões da própria conta após a troca. |
| `GET /api/workspaces` | Lista somente vínculos ativos da pessoa autenticada. |

Guarde o cookie pelo mecanismo do cliente HTTP. Em mutações autenticadas, envie `X-CSRF-Token` com o token recebido e, no navegador, o cabeçalho `Origin` correspondente a `PUBLIC_ORIGIN`. O token CSRF não substitui o cookie. Senhas têm de 12 a 128 caracteres. Uma resposta 429 inclui `Retry-After`.

Tokens de sessão e links de download não devem integrar logs ou URLs públicas. Para integrações automatizadas, use uma conta com permissões restritas e faça login pelo mesmo contrato.

## Concorrência e transações

As respostas de leitura e escrita fornecem `revision`, a revisão corrente do workspace. Comandos, sincronização, árvores, relações, aprovações e movimentações exigem `expectedRevision`. A API cancela integralmente a operação se a revisão mudou.

`PATCH` de item exige ainda `version` ou `If-Match` com a versão do item. Quando `expectedRevision` não é enviada no PATCH, o servidor usa a revisão atual e continua protegendo a alteração pela versão do item. Nos outros comandos, `If-Match` pode substituir `expectedRevision` e representa a revisão do workspace.

Uma falha 409 pede nova leitura e reaplicação consciente da alteração. Não repita automaticamente uma escrita com a nova revisão, pois isso poderia sobrescrever uma mudança concorrente. Preferências pessoais têm persistência separada e não incrementam a revisão do workspace.

Os campos `effectiveAt` e `comment` acompanham a alteração. A data efetiva usa ISO-8601 e não pode ficar mais de cinco minutos no futuro; `recordedAt` sempre vem do servidor. O ator, o identificador de correlação e o histórico não são aceitos do cliente como autoridade.

## Projeção e consultas

`GET /api/workspaces/{workspaceId}/projection` retorna:

```json
{
  "revision": 12,
  "workspace": { "id": "workspace_id", "name": "Minha obra" },
  "limits": { "attachmentMaxBytes": 10485760, "attachmentQuotaBytes": 1073741824 },
  "state": { "items": [], "relations": [], "users": [], "permissionRules": [] },
  "projection": {
    "items": [],
    "relations": [],
    "graph": { "nodes": [], "relations": [] },
    "counters": { "total": 0, "done": 0, "blocked": 0 }
  },
  "schedule": { "reliable": false, "rows": [] }
}
```

O exemplo é reduzido; `state` inclui cadastros autorizados, decisões, metadados de anexos, configurações e preferências da pessoa. Não inclui hashes de senha, sessões nem conteúdo dos anexos. Os filtros operacionais da PRD5 e `project` são aplicados ao conjunto da projeção; Gantt, grafo e contadores usam esse mesmo conjunto.

A hierarquia persistida está em `item.parentId`. Arestas `relationType: "contains"` aparecem somente no grafo e têm `derived: true`. Relações persistidas são TI. Duração indefinida é `plannedDurationDays: null`, preservada nas escritas. Datas planejadas são `YYYY-MM-DD`, com calendário inclusivo; TI sem defasagem começa no dia seguinte ao término da predecessora. Baseline é preservada separadamente das previsões recalculadas.

`state.events` é uma janela dos eventos recentes, limitada a 2.000 registros de domínio/cadastro na origem. Para histórico completo, use a consulta paginada descrita adiante. Rede incompleta retorna `schedule.reliable: false`, com criticidade desativada e folga nula.

## Escritas de itens e relações

Nos caminhos da tabela, `{w}` é o ID do workspace.

| Método e caminho | Corpo principal |
| --- | --- |
| `POST /api/workspaces/{w}/item-trees` | `expectedRevision`, `items`, `parentId` opcional, `startDate` opcional, `createTI` opcional. |
| `PATCH /api/workspaces/{w}/items/{id}` | `version`, `changes`, `expectedRevision` opcional, comentário e data efetiva. |
| `POST /api/workspaces/{w}/items/{id}/move` | `expectedRevision`, `parentId`, `targetId` opcional para reordenar, `position: "before"` ou `"after"`. |
| `POST /api/workspaces/{w}/items/batch` | `expectedRevision`, `items: [{ "id": "...", "version": 1, "changes": {} }]`, `changes` comuns opcionais. |
| `POST /api/workspaces/{w}/items/{id}/archive` | `expectedRevision`; arquiva subárvore após verificar todas as permissões. |
| `POST /api/workspaces/{w}/items/{id}/restore` | `expectedRevision`; restaura subárvore e valida coerência. |
| `POST /api/workspaces/{w}/relations` | `expectedRevision`, `sourceId`, `targetId`, `type: "TI"`, `lagDays`, `description` opcional. |
| `DELETE /api/workspaces/{w}/relations/{id}` | JSON com `expectedRevision`. |

Exemplo de criação atômica de árvore:

```json
{
  "expectedRevision": 0,
  "startDate": "2027-01-04",
  "createTI": true,
  "items": [
    { "key": "obra", "title": "Obra", "type": "project", "ownerId": "usuario_real" },
    { "key": "preparar", "parentKey": "obra", "title": "Preparação", "type": "task", "ownerId": "usuario_real", "plannedDurationDays": 2 },
    { "key": "executar", "parentKey": "obra", "title": "Execução", "type": "task", "ownerId": "usuario_real", "plannedDurationDays": 3 }
  ]
}
```

Informe pais antes de filhos. `key` identifica a linha e `parentKey` referencia outra linha do pedido; o servidor gera IDs quando `id` não é fornecido. A criação automática de TI conecta as folhas na ordem informada e exige duração inteira mínima de um dia. O endpoint admite até 1.000 itens e grava tudo em uma transação.

O contexto organizacional de cada item deriva do responsável ativo. O servidor rejeita ciclos, pais inexistentes, TI com a mesma origem/destino, duplicidade de TI ativa e relações que conectem grupos. Campos derivados de grupos são recalculados pelos filhos.

O lote admite até 1.000 itens. Em sucesso, `results` contém um resultado por item; em falha, `error.details.results` marca todos como não gravados e `atomic: true`. Validações específicas incluem o item ou linha quando disponível. Nenhuma alteração parcial é confirmada.

## Bloqueios e aprovações

| Método e caminho | Corpo principal |
| --- | --- |
| `POST /api/workspaces/{w}/items/{id}/blockers` | `expectedRevision`, `reason` obrigatório. |
| `DELETE /api/workspaces/{w}/blockers/{blockerId}` | `expectedRevision`, `comment` ou `reason` obrigatório. |
| `POST /api/workspaces/{w}/approvals` | `expectedRevision`, `itemId`, `comment`. |
| `POST /api/workspaces/{w}/approval-requests/{requestId}/decisions` | `expectedRevision`, `decision: "approved"` ou `"rejected"`, `comment`, `correctionOwnerId` opcional. |
| `POST /api/workspaces/{w}/approval-requests/{requestId}/cancel` | `expectedRevision`, `comment` obrigatório. |

Cada bloqueador tem identidade própria. Resolver uma fonte mantém as demais e refaz a propagação. Uma aprovação tem somente uma rodada pendente por vez. A decisão exige o aprovador designado e permissão GPO; o perfil administrativo não substitui a designação. Reprovação cria revisão, preserva a decisão anterior e reorganiza as dependências conforme a regra PRD5. Reabertura é um comando explícito e registra nova rodada.

## Comandos e integração com a interface existente

`POST /api/workspaces/{w}/commands` aceita uma lista de 1 a 2.000 comandos definidos:

```json
{
  "expectedRevision": 12,
  "comment": "Atualização do planejamento",
  "commands": [
    { "type": "updateItem", "args": ["item_id", { "title": "Título revisado", "version": 3 }] }
  ]
}
```

Além das operações das tabelas, estão disponíveis `reorderItem`, `reopenApproval`, `saveFlowTemplate`, `applyFlowTemplate`, `removeFlowTemplate`, `createPermissionRule`, `removePermissionRule` e `recalculateSchedule`. Cada comando mantém suas validações e permissões; a lista inteira é atômica. Comandos desconhecidos retornam 422.

Modelos guardam estrutura e configuração reutilizável. A aplicação gera IDs novos, deriva empresa/setor de cada responsável e não copia anexos, decisões ou histórico da execução de origem. Durações nulas são preservadas e novas aprovações começam pendentes.

`POST /api/workspaces/{w}/sync` é a adaptação para o frontend PRD5: recebe `expectedRevision`, `desiredState`, `fieldHints`, `actions`, comentário e data efetiva. O servidor compara com a projeção autorizada, executa somente alterações permitidas e recalcula o resultado. `fieldHints` identifica os campos editados explicitamente, por item; recálculos do navegador não viram alterações manuais nos dependentes. Aprovações usam ações explícitas. Históricos, decisões, credenciais persistidas, metadados de anexos e campos calculados enviados pelo cliente não substituem o estado oficial.

Cadastros e configurações da interface são persistidos por esse contrato. A criação de uma conta inclui `password` transitória no registro de usuário; ela é validada, transformada em hash e removida da projeção e dos registros de domínio. Alterar perfis e contas administrativas exige permissão GPO no estado anterior à requisição.

## Preferências, GPO e auditoria

| Método e caminho | Finalidade |
| --- | --- |
| `GET /api/workspaces/{w}/preferences` | Preferências da própria pessoa neste workspace. |
| `PUT /api/workspaces/{w}/preferences` | `{ "preferences": { ... } }`; mescla apenas chaves admitidas. |
| `POST /api/workspaces/{w}/authorization/evaluate` | `{ "operation": "edit_item", "itemId": "..." }`; decisão, regra e motivo. |
| `GET /api/workspaces/{w}/permission-rules` | Consulta administrativa com `q`, sujeito, operação, escopo, efeito, `offset` e `limit`. |
| `GET /api/workspaces/{w}/audit-events` | Histórico paginado com filtros. |
| `POST /api/workspaces/{w}/users/{userId}/password` | `{ "password": "..." }`; redefinição administrativa e revogação de sessões. |

A auditoria aceita `userId`, `organizationId`, `sectorId`, `eventType`, `itemId`, `since`, `until`, `offset` e `limit`. O limite padrão é 50, máximo 200. A resposta contém `events`, `total`, `offset`, `limit` e `nextOffset`. Os registros têm ator, data efetiva, data de gravação, correlação e antes/depois. Visibilidade de itens e referências sensíveis é filtrada também no histórico.

Existem aliases `/api/audit-events?workspaceId=...` e `/api/users/me/workspace-preferences`, com `workspaceId` na query do GET ou no corpo do PUT. Um usuário não pode escrever as preferências de outra pessoa. O reset de uma conta vinculada a outros workspaces exige administração do servidor; a troca pela própria pessoa continua disponível mediante senha atual.

## Anexos privados

1. Envie `POST /api/workspaces/{w}/items/{itemId}/attachments` com `{ "name": "evidencia.pdf", "dataBase64": "..." }`.
2. Consulte os metadados na projeção; o servidor calcula tamanho, MIME e SHA-256.
3. Solicite `POST /api/workspaces/{w}/attachments/{id}/download-url` com sessão e CSRF.
4. Faça GET da `url` retornada com a mesma sessão. O link expira em cinco minutos e o servidor verifica novamente a permissão.
5. Use `DELETE /api/workspaces/{w}/attachments/{id}` para exclusão lógica. Links anteriores passam a ser recusados.

Formatos admitidos: PDF, PNG, JPG/JPEG, GIF, WebP, TXT, CSV, DOCX, XLSX e PPTX. Há verificação de assinatura básica, tamanho, nome e quota. A verificação básica não substitui inspeção antimalware; o executável opcional de scan pode ser exigido por configuração. HTML, SVG e executáveis não são formatos aceitos. Downloads usam `Content-Disposition: attachment`.

Limites iniciais: 10 MiB por arquivo e 1 GiB por workspace, configuráveis. A quota considera arquivos excluídos logicamente, pois são preservados no armazenamento e nos backups. Uploads recebem conteúdo em JSON/base64 e têm limite de corpo compatível com a configuração. A autorização é refeita depois do scanner e antes da gravação.

## Respostas de erro

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "O workspace foi alterado por outro usuário. Recarregue antes de reaplicar suas alterações.",
    "details": { "currentRevision": 13 },
    "correlationId": "identificador-gerado-pelo-servidor"
  }
}
```

| HTTP | Significado usual |
| --- | --- |
| `400` | Corpo JSON malformado. |
| `401` | Sessão ausente, expirada ou revogada. |
| `403` | Permissão, CSRF, origem, aprovador ou administração de conta insuficiente. |
| `404` | Recurso inexistente ou workspace fora do acesso da pessoa. |
| `409` | Revisão/versão concorrente, identidade duplicada ou rodada já encerrada. |
| `413` | Corpo, arquivo, quota ou lote de senhas acima do limite. |
| `422` | Regra de negócio ou integridade inválida; transação cancelada. |
| `428` | Revisão ou versão exigida e não informada. |
| `429` | Limitação de tentativas de login. |
| `503` | Scanner obrigatório ainda não configurado. |

Os códigos são mais específicos que o status HTTP. Use `correlationId`/`X-Request-Id` para consultar logs e auditoria. Erros internos não expõem caminhos, SQL, senhas nem stack traces ao cliente.
