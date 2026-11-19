import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ApiClient, ADMIN, TEST_PASSWORD, createItem, itemInput, addWorkspaceUser } from './backend-support.mjs';

test('backend: login real, cookie protegido, senha derivada e revogação no logout', async t => {
  const { app, admin, baseUrl } = await fixture(t);
  const anonymous = new ApiClient(baseUrl);
  assert.equal((await anonymous.request('/api/auth/session')).status, 401);
  const wrong = await anonymous.request('/api/auth/login', { method: 'POST', body: { email: ADMIN.email, password: 'incorrect-password' } });
  assert.equal(wrong.status, 401);
  assert.doesNotMatch(JSON.stringify(wrong.data), /password_hash|scrypt|SELECT/i);
  const login = await anonymous.login();
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=(Lax|Strict)/i);
  const stored = app.storage.db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get(ADMIN.id).password_hash;
  assert.notEqual(stored, TEST_PASSWORD);
  assert.doesNotMatch(stored, new RegExp(TEST_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const session = await admin.request('/api/auth/session');
  assert.equal(session.status, 200);
  assert.equal(session.data.user.id, ADMIN.id);
  const previousCookie = admin.cookie;
  assert.equal((await admin.request('/api/auth/logout', { method: 'POST', body: {} })).status, 200);
  admin.cookie = previousCookie;
  assert.equal((await admin.request('/api/auth/session')).status, 401, 'logout invalidates a replayed session cookie');
});

test('backend: CSRF e origem bloqueiam comandos sem gravar', async t => {
  const { admin } = await fixture(t);
  const before = await admin.projection();
  const payload = { expectedRevision: before.revision, commands: [{ type: 'createItem', args: [itemInput('Não gravar')] }] };
  assert.equal((await admin.request('/api/workspaces/w_a/commands', { method: 'POST', csrf: false, body: payload })).status, 403);
  assert.equal((await admin.request('/api/workspaces/w_a/commands', { method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: payload })).status, 403);
  const after = await admin.projection();
  assert.equal(after.revision, before.revision);
  assert.equal(after.state.items.length, before.state.items.length);
});

test('backend: criação composta é atômica e duração não definida permanece null', async t => {
  const { admin } = await fixture(t);
  const before = await admin.projection();
  const invalid = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: before.revision, commands: [
    { type: 'createItem', args: [itemInput('Primeiro válido')] },
    { type: 'createItem', args: [itemInput('Segundo inválido', { plannedDurationDays: -1 })] },
  ] } });
  assert.ok([400, 422].includes(invalid.status), JSON.stringify(invalid.data));
  const after = await admin.projection();
  assert.equal(after.revision, before.revision);
  assert.deepEqual(after.state.items, before.state.items);
  assert.deepEqual(after.state.events, before.state.events, 'rollback also discards operational events');
  const unknown = await createItem(admin, 'Duração a definir', { plannedDurationDays: null });
  assert.equal(unknown.plannedDurationDays, null);
  assert.equal(unknown.dueAt, '');
  const known = await createItem(admin, 'Duração conhecida');
  await admin.command('updateItem', [known.id, { ...known, plannedDurationDays: null, dueAt: '' }]);
  assert.equal((await admin.projection()).state.items.find(i => i.id === known.id).plannedDurationDays, null, 'editing can clear an existing duration');
});

test('backend: concorrência rejeita revisão antiga e preserva a primeira edição', async t => {
  const { admin, baseUrl } = await fixture(t);
  const item = await createItem(admin, 'Versão inicial');
  const second = new ApiClient(baseUrl); await second.login();
  const stale = await second.projection();
  await admin.command('updateItem', [item.id, { ...item, title: 'Alteração confirmada' }]);
  const failed = await second.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: stale.revision, commands: [{ type: 'updateItem', args: [item.id, { ...item, title: 'Edição obsoleta' }] }] } });
  assert.equal(failed.status, 409);
  const current = (await second.projection()).state.items.find(i => i.id === item.id);
  assert.equal(current.title, 'Alteração confirmada');
  assert.ok(Number(current.version) > Number(item.version), 'item version increases on mutation');
});

test('backend: hierarquia canônica rejeita ciclos, órfãos e novas folhas com TI em pais', async t => {
  const { admin } = await fixture(t);
  const root = await createItem(admin, 'Raiz', { type: 'project', plannedDurationDays: null });
  const child = await createItem(admin, 'Filho', { parentId: root.id });
  const other = await createItem(admin, 'Outra raiz', { type: 'project', plannedDurationDays: null });
  await admin.command('moveItemHierarchy', [child.id, other.id]);
  let projection = await admin.projection();
  assert.equal(projection.state.items.find(i => i.id === child.id).parentId, other.id);
  assert.equal(projection.state.relations.filter(r => r.relationType === 'contains').length, 0);
  const beforeCycle = projection.revision;
  const cycle = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: beforeCycle, commands: [{ type: 'moveItemHierarchy', args: [other.id, child.id] }] } });
  assert.ok([400, 422].includes(cycle.status), JSON.stringify(cycle.data));
  assert.equal((await admin.projection()).revision, beforeCycle);
  const orphan = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: beforeCycle, commands: [{ type: 'createItem', args: [itemInput('Órfão', { parentId: 'missing-parent' })] }] } });
  assert.ok([400, 404, 422].includes(orphan.status));
  const a = await createItem(admin, 'Folha A'); const b = await createItem(admin, 'Folha B');
  await admin.command('createRelation', [a.id, b.id, 'TI', 0]);
  projection = await admin.projection();
  const badParent = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: projection.revision, commands: [{ type: 'createItem', args: [itemInput('Filho proibido', { parentId: a.id })] }] } });
  assert.ok([400, 422].includes(badParent.status), 'a TI endpoint must remain a leaf');
  assert.equal((await admin.projection()).revision, projection.revision);
});

test('backend: TI recalcula calendário inclusivo, preserva baseline e rejeita duplicata/ciclo', async t => {
  const { admin } = await fixture(t);
  const a = await createItem(admin, 'TI A'); const b = await createItem(admin, 'TI B', { plannedDurationDays: 3 });
  await admin.command('createRelation', [a.id, b.id, 'TI', 0]);
  const projection = await admin.projection(); const successor = projection.state.items.find(i => i.id === b.id);
  assert.equal(successor.plannedStartAt, '2026-11-04');
  assert.equal(successor.dueAt, '2026-11-06');
  assert.equal(successor.baselineStartAt, '2026-11-02');
  for (const args of [[a.id, b.id, 'TI', 0], [b.id, a.id, 'TI', 0]]) {
    const rejected = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: projection.revision, commands: [{ type: 'createRelation', args }] } });
    assert.ok([400, 409, 422].includes(rejected.status), JSON.stringify(rejected.data));
  }
  const after = await admin.projection(); assert.equal(after.state.relations.length, 1); assert.equal(after.revision, projection.revision);
  assert.ok(after.state.events.some(e => e.itemId === b.id && e.eventType === 'start_changed'));
});

test('backend: workspace estrangeiro permanece inacessível mesmo para administrador global', async t => {
  const { admin, baseUrl } = await fixture(t, { secondWorkspace: true });
  const other = new ApiClient(baseUrl); await other.login('other@example.test');
  const secret = await createItem(other, 'Confidencial outra empresa', { ownerId: 'u_other', organizationId: 'org_b', sectorId: 'org_b_geral', state: 'SP' }, 'w_b');
  const read = await admin.request('/api/workspaces/w_b/projection');
  assert.ok([403, 404].includes(read.status));
  assert.doesNotMatch(JSON.stringify(read.data), /Confidencial outra empresa/);
  const local = await createItem(admin, 'Item local');
  const before = await admin.projection();
  const link = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: before.revision, commands: [{ type: 'createRelation', args: [local.id, secret.id, 'TI', 0] }] } });
  assert.ok([400, 403, 404, 422].includes(link.status));
  const forged = await admin.request('/api/workspaces/w_b/commands', { method: 'POST', body: { expectedRevision: 1, commands: [{ type: 'updateItem', args: [secret.id, { ...secret, title: 'Invadido' }] }] } });
  assert.ok([403, 404].includes(forged.status));
  assert.equal((await other.projection('w_b')).state.items.find(i => i.id === secret.id).title, secret.title);
});

test('backend: GPO Negar específico vence Permitir global e identidade não vem do payload', async t => {
  const f = await fixture(t); const { admin } = f;
  const item = await createItem(admin, 'Item protegido');
  const { user, client } = await addWorkspaceUser(f, { operations: ['view_item', 'edit_item', 'change_duration'] });
  await admin.sync(state => state.permissionRules.push({ id: 'deny_item', subjectType: 'user', subjectId: user.id, operation: 'edit_item', scopeType: 'item', scopeId: item.id, effect: 'deny' }));
  const before = await client.projection();
  const denied = await client.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: before.revision, currentUserId: ADMIN.id, commands: [{ type: 'updateItem', args: [item.id, { ...item, title: 'Tentativa negada', createdBy: ADMIN.id }] }] } });
  assert.equal(denied.status, 403, JSON.stringify(denied.data));
  const desiredState = structuredClone(before.state); desiredState.currentUserId = ADMIN.id; desiredState.items.find(i => i.id === item.id).title = 'Falsificação no sync';
  const spoofed = await client.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: before.revision, desiredState } });
  assert.equal(spoofed.status, 403, JSON.stringify(spoofed.data));
  assert.equal((await admin.projection()).state.items.find(i => i.id === item.id).title, 'Item protegido');
});

test('backend: empate GPO Negar de perfil vence Permitir de usuário e sem regra nega', async t => {
  const f = await fixture(t); const { admin } = f;
  const item = await createItem(admin, 'Empate de regras');
  await admin.sync(state => state.permissionProfiles.push({ id: 'profile_deny', name: 'Perfil restrito', organizationId: 'org_a', inactive: false, version: 1 }));
  const { user, client } = await addWorkspaceUser(f, { operations: ['view_item', 'edit_item'], profileId: 'profile_deny' });
  await admin.sync(state => state.permissionRules.push({ id: 'deny_profile', subjectType: 'profile', subjectId: 'profile_deny', operation: 'edit_item', scopeType: 'global', scopeId: '', effect: 'deny' }));
  let p = await client.projection();
  const denied = await client.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: p.revision, commands: [{ type: 'updateItem', args: [item.id, { ...item, title: 'Não autorizado' }] }] } });
  assert.equal(denied.status, 403);
  await admin.sync(state => { state.permissionRules = state.permissionRules.filter(rule => rule.id !== 'deny_profile'); });
  const approval = await createItem(admin, 'Aprovar escopo', { type: 'approval', ownerId: user.id });
  await admin.command('submitApprovalForReview', [approval.id, 'Solicitação']);
  p = await client.projection();
  const noFallback = await client.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: p.revision, commands: [{ type: 'decideApproval', args: [approval.id, 'approved', ''] }] } });
  assert.equal(noFallback.status, 403, 'responsibility never replaces an explicit decide_approval grant');
});

test('backend: remover TI exige delete_relation e arquivo respeita permissões da subárvore', async t => {
  const f = await fixture(t); const { admin } = f;
  const root = await createItem(admin, 'Pai restrito', { type: 'project', plannedDurationDays: null });
  const child = await createItem(admin, 'Filho restrito', { parentId: root.id });
  const successor = await createItem(admin, 'Sucessora');
  await admin.command('createRelation', [child.id, successor.id, 'TI', 0]);
  const { user, client } = await addWorkspaceUser(f, { operations: ['view_item', 'edit_item'] });
  let p = await client.projection();
  const rel = p.state.relations[0];
  const remove = await client.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: p.revision, commands: [{ type: 'removeRelation', args: [rel.id] }] } });
  assert.equal(remove.status, 403);
  await admin.sync(state => state.permissionRules.push({ id: 'deny_child', subjectType: 'user', subjectId: user.id, operation: 'edit_item', scopeType: 'item', scopeId: child.id, effect: 'deny' }));
  p = await client.projection();
  const archive = await client.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: p.revision, commands: [{ type: 'archiveItem', args: [root.id] }] } });
  assert.equal(archive.status, 403);
  assert.ok(!(await admin.projection()).state.items.find(i => i.id === root.id).archivedAt);
});

test('backend: aprovação conserva decisões imutáveis e reabertura inicia nova rodada', async t => {
  const { admin } = await fixture(t);
  const item = await createItem(admin, 'Aceite executivo', { type: 'approval' });
  await admin.command('submitApprovalForReview', [item.id, 'Pronto para análise']);
  await admin.command('decideApproval', [item.id, 'approved', 'Escopo validado']);
  const decided = await admin.projection();
  const oldDecisions = structuredClone(decided.state.approvalDecisions);
  assert.equal(decided.state.items.find(i => i.id === item.id).status, 'done');
  assert.ok(oldDecisions.some(d => d.outcome === 'approved'));
  await admin.command('reopenApproval', [item.id, 'Nova evidência exige revisão', 10]);
  const reopened = await admin.projection();
  assert.equal(reopened.state.items.find(i => i.id === item.id).approvalRound, 2);
  assert.equal(reopened.state.items.find(i => i.id === item.id).status, 'backlog');
  for (const decision of oldDecisions) assert.deepEqual(reopened.state.approvalDecisions.find(d => d.id === decision.id), decision);
  const tamper = structuredClone(reopened.state); tamper.approvalDecisions = []; tamper.events = [];
  const result = await admin.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: reopened.revision, desiredState: tamper } });
  assert.ok([200, 400, 403, 422].includes(result.status));
  const final = await admin.projection();
  for (const decision of oldDecisions) assert.deepEqual(final.state.approvalDecisions.find(d => d.id === decision.id), decision, 'client cannot overwrite decision history');
  assert.ok(final.state.events.length >= reopened.state.events.length, 'audit history remains append-only');
});

test('backend: arquivo/restauração mantém hierarquia, ordem e eventos', async t => {
  const { admin } = await fixture(t);
  const parent = await createItem(admin, 'Pacote arquivado', { type: 'project', plannedDurationDays: null });
  const child = await createItem(admin, 'Subitem arquivado', { parentId: parent.id, sortOrder: 200 });
  await admin.command('archiveItem', [parent.id]);
  let state = (await admin.projection()).state;
  assert.ok(state.items.find(i => i.id === parent.id).archivedAt);
  assert.ok(state.items.find(i => i.id === child.id).archivedAt);
  await admin.command('restoreItem', [parent.id]);
  state = (await admin.projection()).state;
  const restored = state.items.find(i => i.id === child.id);
  assert.ok(!restored.archivedAt); assert.equal(restored.parentId, parent.id); assert.equal(restored.sortOrder, child.sortOrder);
  assert.ok(state.events.some(e => e.itemId === parent.id && e.eventType === 'archived'));
  assert.ok(state.events.some(e => e.itemId === parent.id && e.eventType === 'restored'));
});

test('backend: usuário inativado perde a sessão já aberta', async t => {
  const f = await fixture(t);
  const { user, client } = await addWorkspaceUser(f);
  assert.equal((await client.request('/api/auth/session')).status, 200);
  await f.admin.sync(state => { state.users.find(u => u.id === user.id).disabled = true; });
  assert.equal((await client.request('/api/auth/session')).status, 401);
  assert.equal((await client.request('/api/workspaces/w_a/projection')).status, 401);
});

test('backend: autenticação possui limite de tentativas', async t => {
  const { baseUrl } = await fixture(t);
  const attacker = new ApiClient(baseUrl);
  let limited = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await attacker.request('/api/auth/login', { method: 'POST', body: { email: 'unknown@example.test', password: 'incorrect-password' } });
    if (result.status === 429) { limited = true; assert.ok(result.headers.get('retry-after')); break; }
    assert.equal(result.status, 401);
  }
  assert.ok(limited, 'repeated login attempts are rate limited');
});

test('backend: duas fontes de bloqueio liberam dependente somente após ambas resolvidas', async t => {
  const { admin } = await fixture(t);
  const a = await createItem(admin, 'Fonte material'); const c = await createItem(admin, 'Fonte projeto'); const b = await createItem(admin, 'Frente dependente');
  await admin.command('createRelation', [a.id, b.id, 'TI', 0]);
  await admin.command('createRelation', [c.id, b.id, 'TI', 0]);
  const before = await admin.projection();
  const invalid = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: before.revision, commands: [{ type: 'setBlocker', args: [a.id, ''] }] } });
  assert.ok([400, 422].includes(invalid.status));
  assert.equal((await admin.projection()).revision, before.revision);
  await admin.command('setBlocker', [a.id, 'Material sem entrega confirmada']);
  await admin.command('setBlocker', [c.id, 'Projeto ainda não liberado']);
  let state = (await admin.projection()).state;
  const blocked = state.items.find(i => i.id === b.id);
  assert.equal(blocked.status, 'blocked'); assert.deepEqual([...blocked.inheritedBlockedFrom].sort(), [a.id, c.id].sort());
  const first = state.blockers.find(x => x.manual && x.active && x.sourceItemId === a.id);
  const second = state.blockers.find(x => x.manual && x.active && x.sourceItemId === c.id);
  assert.ok(first && second);
  await admin.command('resolveBlocker', [first.id, 'Material recebido e conferido']);
  state = (await admin.projection()).state;
  assert.equal(state.items.find(i => i.id === b.id).status, 'blocked');
  assert.deepEqual(state.items.find(i => i.id === b.id).inheritedBlockedFrom, [c.id]);
  await admin.command('resolveBlocker', [second.id, 'Projeto liberado']);
  state = (await admin.projection()).state;
  assert.equal(state.items.find(i => i.id === b.id).status, 'backlog');
  assert.deepEqual(state.items.find(i => i.id === b.id).inheritedBlockedFrom, []);
  assert.ok(state.blockers.filter(x => [first.id, second.id].includes(x.id)).every(x => !x.active && x.resolvedBy === ADMIN.id && x.resolvedAt));
});

test('backend: atividade em execução mantém estado e recebe alerta herdado', async t => {
  const { admin } = await fixture(t);
  const source = await createItem(admin, 'Fonte de alerta');
  const working = await createItem(admin, 'Trabalho iniciado', { status: 'in_progress', progressPercent: 25 });
  await admin.command('createRelation', [source.id, working.id, 'TI', 0]);
  await admin.command('setBlocker', [source.id, 'Fornecedor não mobilizado']);
  const item = (await admin.projection()).state.items.find(i => i.id === working.id);
  assert.equal(item.status, 'in_progress'); assert.equal(item.progressPercent, 25);
  assert.deepEqual(item.inheritedBlockedFrom, [source.id]);
});

test('backend: leitura sem regra não expõe item, histórico, anexo nem IDs relacionados', async t => {
  const f = await fixture(t);
  const item = await createItem(f.admin, 'Título que exige autorização');
  const { client } = await addWorkspaceUser(f, { operations: [] });
  const result = await client.request('/api/workspaces/w_a/projection');
  assert.ok([200, 403].includes(result.status));
  if (result.status === 200) {
    assert.deepEqual(result.data.state.items, []);
    assert.deepEqual(result.data.state.relations, []);
    assert.deepEqual(result.data.state.events, []);
    assert.doesNotMatch(JSON.stringify(result.data), new RegExp(item.id));
    assert.doesNotMatch(JSON.stringify(result.data), /Título que exige autorização/);
  }
});

test('backend: datas impossíveis, campo calculado forjado e mutação sem versão não são aceitos', async t => {
  const { admin } = await fixture(t);
  const before = await admin.projection();
  const invalid = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { expectedRevision: before.revision, commands: [{ type: 'createItem', args: [itemInput('Data impossível', { plannedStartAt: '2026-02-31' })] }] } });
  assert.ok([400, 422].includes(invalid.status));
  const noRevision = await admin.request('/api/workspaces/w_a/commands', { method: 'POST', body: { commands: [{ type: 'createItem', args: [itemInput('Sem revisão')] }] } });
  assert.equal(noRevision.status, 428);
  const item = await createItem(admin, 'Metadados do servidor');
  const p = await admin.projection(); const desired = structuredClone(p.state);
  Object.assign(desired.items.find(i => i.id === item.id), { createdBy: 'forged', createdAt: '1900-01-01T00:00:00Z', version: 99999, baselineStartAt: '1900-01-01', completedAt: '1900-01-01T00:00:00Z' });
  const response = await admin.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: p.revision, desiredState: desired } });
  assert.ok([200, 400, 403, 422].includes(response.status));
  const actual = (await admin.projection()).state.items.find(i => i.id === item.id);
  for (const field of ['createdBy', 'createdAt', 'baselineStartAt', 'completedAt']) assert.equal(actual[field], item[field]);
  assert.ok(actual.version < 99999);
});
