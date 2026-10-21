# PRD5 — Contrato de dados e preparação do backend

Estado: **contrato de implantação** para o frontend PRD5. Este arquivo não implementa um backend. A aplicação publicada permanece um protótipo local até a implantação de persistência e autorização no servidor.

## Decisões adotadas no protótipo e propostas para ratificação

1. Durações são contabilizadas em **dias corridos**, com mínimo de 1 dia para cada folha que participar de TI automática. Duração opcional sem TI é \`null\` (não atribuir 0 nem 1 por padrão).
2. **Caminho crítico** é derivado de cálculo de rede válido e completo; bloqueio e risco são indicadores independentes. Nenhuma atividade pode ser considerada crítica por previsão incompleta.
3. A primeira implementação da aprovação mantém decisão de um aprovador por rodada, preservando histórico imutável. Aprovação paralela/sequencial demanda extensão explícita do modelo.
4. Edição em lote é **atômica** no protótipo e deverá manter transação no backend, retornando validações por item antes do commit.
5. Colunas iniciais: atividade/responsável, status, avanço, início e término projetados, edição e seleção. O usuário pode mostrar/ocultar/reordenar as demais; em viewports compactos, colunas secundárias são temporariamente reduzidas.
6. Limites atuais de anexos no protótipo: 256 KiB por arquivo e 1 MiB no total no navegador. Antes do backend, definir quota por empresa, varredura de malware e política de retenção.

## Modelo canônico

- **Workspace**: id, organization_id, title, archived_at.
- **Organization**: id, name, state, active.
- **Sector**: id, organization_id, name, active.
- **User**: id, name, email, organization_id, sector_id, active, profile_id.
- **PermissionProfile**: id, organization_id, name, active, version.
- **PermissionRule**: id, subject_type, subject_id, operation, scope_type, scope_id, effect.
- **Item**: id, workspace_id, parent_item_id, order_index, title, type, status, owner_id, duration_days nullable, weight, progress_percent, version, archived_at.
- **ItemSchedule**: item_id, planned_start, planned_end nullable, baseline_start/end, target_start/end, recalculated_at.
- **Relation**: id, source_item_id, target_item_id, type = TI, lag_days, active. *Relação Contém não é persistida*: é a projeção de Item.parent_item_id.
- **Blocker**: id, source_item_id, affected_item_id, reason, active, created_by/at, resolved_by/at.
- **ApprovalRequest**: id, item_id, round, status, due_at.
- **ApprovalDecision**: id, request_id, approver_id, decision, comment, decided_at.
- **Attachment**: id, item_id, storage_key, name, mime, size, sha256, created_by, created_at, deleted_at.
- **AuditEvent**: id, aggregate_type/id, event_type, before_json, after_json, actor_id, organization_id, sector_id, effective_at, recorded_at, correlation_id.
- **GraphLayoutPreference**: user_id, workspace_id, grouping, positions_json, zoom.
- **Template**: id, organization_id, name, version; TemplateNode guarda EAP, tipo, duração, responsável opcional e relações TI.

## Invariantes de banco e regras transacionais

- FK Item.parent_item_id referencia Item.id ou NULL. CHECK parent_item_id != id.
- Um item tem no máximo um pai. Ciclos são rejeitados por verificação recursiva antes de MOVE e CREATE.
- UNIQUE(organization_id, lower(email)) para usuários no escopo definido; UNIQUE para relação ativa source_item_id/target_item_id/type.
- Relations só contêm TI. FKs validam dois itens distintos, ambos folhas ativas, dentro do workspace autorizado.
- UNIQUE(affected_item_id, source_item_id, active=true) nos bloqueios para evitar fontes duplicadas.
- UNIQUE(item_id, round) nos pedidos de aprovação; decisões são **append-only**. Nenhuma atualização apaga decisão anterior.
- Auditoria é append-only, com before/after, ator, instante efetivo, instante de gravação e correlation_id.
- Item.version incrementado a cada escrita; exigência de If-Match/version no PATCH para concorrência otimista.
- Todas as mutações de criação de árvore, MOVE, BATCH, bloqueio e aprovação ocorrem em **transações** com validação integral antes do commit.
- O backend avalia GPO em toda leitura e escrita: escopo mais específico prevalece; em empate, Negar prevalece; sem regra, negar. Registrar regra vencedora e sujeito.
- Arquivamento lógico de itens/usuários/anexos preserva histórico e permite restauração de subárvore coerente.

## Comandos API sugeridos

| Método / recurso | Comando | Resultado |
| --- | --- | --- |
| POST /workspaces/{id}/item-trees | CreateItemTree | Itens, ordem, hierarquia, TI; commit único |
| PATCH /items/{id} | UpdateItem | Item, nova versão, eventos |
| POST /items/{id}/move | MoveItem | Parent_id + ordem, resumos e eventos |
| POST /workspaces/{id}/items/batch | BatchUpdateItems | Pré-valida todos e retorna resultado detalhado |
| POST /relations | CreateRelation | TI validada com cycle-check |
| DELETE /relations/{id} | DeleteRelation | Exclusão lógica e reprocessamento da rede |
| POST /items/{id}/blockers | SetBlocker | Fonte, motivo, descendentes afetados |
| DELETE /blockers/{id} | ResolveBlocker | Remove apenas a fonte resolvida |
| POST /approvals | CreateApprovalRequest | Nova rodada |
| POST /approval-requests/{id}/decisions | DecideApproval | Decisão imutável e evento |
| GET /workspaces/{id}/projection | QueryWorkspace | Gantt/grafo/contadores/filtros em projeção única |
| GET /audit-events | QueryAuditEvents | Usuário, empresa, setor, período, tipo, item |
| POST /authorization/evaluate | EvaluatePermission | Permitido/negado e regra aplicada |
| PUT /users/me/workspace-preferences | SaveUserPreferences | Gantt/zoom/agrupamento/layout |

## Migração de dados atuais

1. Congelar snapshot local antes de migrar; manter cópia recuperável.
2. Normalizar IDs e detectar órfãos, ciclos, duplicidades TI e nomes repetidos (não assumir que títulos são chaves).
3. Preservar \`parentId\` como \`parent_item_id\`. Descartar relações \`contains\` legadas (inclusive ancestralidade indireta). Gerar arestas Contém só na consulta.
4. Preservar duração não definida como NULL. Não converter null em zero.
5. Recalcular resumos e projeção em transação, registrar diferenças e casos rejeitados para revisão.
6. Auditar os resultados comparando Gantt e grafo antes de disponibilizar contas reais.

## Gates antes de liberar um backend de produção

- Cenários obrigatórios de aceite da PRD5 com browser em 1366×768 e 1920×1080, sem overflow Gantt ou sobreposição.
- Testes de integração de GPO com regra Negar mais específica, concorrência de versão e rollback de batch.
- Ausência de ciclos, duplicatas e órfãos após migração; reconciliação registrada.
- P95 de movimentação/edição <=1s (sem upload), P75 inicial 500 itens/1000 relações <=2,5s em rede corporativa.
- Teste de segregação multiempresa e armazenamento privado de anexos; autorização server-side.
- Backups, restauração, logs estruturados e correlação de comandos/eventos.

**Nota:** a criação de código backend, armazenamento remoto e sincronização entre dispositivos são fases posteriores ao fechamento do protótipo PRD5 e não são disponibilizadas pela hospedagem estática GitHub Pages.
