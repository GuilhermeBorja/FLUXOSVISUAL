import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, ADMIN, createItem, addWorkspaceUser } from './backend-support.mjs';

test('backend security: manage_users não cria administrador nem promove o próprio perfil', async t => {
  const f = await fixture(t); const { client, user } = await addWorkspaceUser(f, { operations: ['view_item', 'manage_users'] });
  const before = await client.projection();
  const desired = structuredClone(before.state);
  desired.users.push({ id: 'u_escalation', name: 'Tentativa de promoção', email: 'escalation@example.test', organizationId: 'org_a', sectorId: 'org_a_geral', state: 'PE', profileId: 'profile_admin', password: 'Unapproved administrator password!' });
  const createAdmin = await client.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: before.revision, desiredState: desired } });
  assert.equal(createAdmin.status, 403, JSON.stringify(createAdmin.data));
  assert.equal(f.app.storage.db.prepare('SELECT COUNT(*) AS n FROM auth_users WHERE id=?').get('u_escalation').n, 0);
  const selfPromotion = structuredClone(before.state); selfPromotion.users.find(u => u.id === user.id).profileId = 'profile_admin';
  const promoted = await client.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: before.revision, desiredState: selfPromotion } });
  assert.equal(promoted.status, 403, JSON.stringify(promoted.data));
  assert.equal((await f.admin.projection()).revision, before.revision);
});

test('backend security: gestor de usuários não assume conta de administrador por redefinição de senha', async t => {
  const logs = [];
  const logger = Object.fromEntries(['info', 'warn', 'error'].map(level => [level, value => logs.push(value)]));
  const f = await fixture(t, { appOptions: { logger } }); const { client, user } = await addWorkspaceUser(f, { operations: ['view_item', 'manage_users'] });
  const originalHash = f.app.storage.db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get(ADMIN.id).password_hash;
  const before = await client.projection(); const desired = structuredClone(before.state);
  desired.users.find(u => u.id === ADMIN.id).password = 'Unapproved password reset 2026!';
  const sync = await client.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: before.revision, desiredState: desired } });
  assert.equal(sync.status, 403, JSON.stringify(sync.data));
  const deniedBeforeHash = f.app.storage.db.prepare('SELECT * FROM authorization_events WHERE correlation_id=?').all(sync.headers.get('x-request-id'));
  assert.ok(deniedBeforeHash.some(event => event.actor_id === user.id && event.operation === 'manage_gpo' && event.allowed === 0), 'negativa antes da derivação de senha deixa trilha de autorização');
  const endpoint = await client.request(`/api/workspaces/w_a/users/${ADMIN.id}/password`, { method: 'POST', body: { password: 'Unapproved password reset 2026!' } });
  assert.equal(endpoint.status, 403, JSON.stringify(endpoint.data));
  const deniedAtEndpoint = f.app.storage.db.prepare('SELECT * FROM authorization_events WHERE correlation_id=?').all(endpoint.headers.get('x-request-id'));
  assert.ok(deniedAtEndpoint.some(event => event.actor_id === user.id && event.operation === 'manage_gpo' && event.allowed === 0));
  assert.equal(f.app.storage.db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get(ADMIN.id).password_hash, originalHash);
  assert.equal((await f.admin.request('/api/auth/session')).status, 200);
  const replacement = 'Authorized audited replacement 2026!';
  const authorized = await f.admin.request(`/api/workspaces/w_a/users/${user.id}/password`, { method: 'POST', body: { password: replacement } });
  assert.equal(authorized.status, 200, JSON.stringify(authorized.data));
  await f.admin.sync(state => { state.users.find(value => value.id === user.id).password = 'Second authorized replacement 2026!'; });
  const resets = f.app.storage.db.prepare("SELECT * FROM audit_events WHERE event_type='user_password_reset' AND aggregate_id=?").all(user.id);
  assert.equal(resets.length, 2);
  for (const event of resets) {
    assert.equal(event.actor_id, ADMIN.id); assert.ok(event.correlation_id);
    assert.deepEqual(JSON.parse(event.payload_json), { targetId: user.id });
    assert.equal(event.before_json, 'null'); assert.equal(event.after_json, 'null');
  }
  const recorded = JSON.stringify({ resets, deniedBeforeHash, deniedAtEndpoint, logs });
  for (const secret of [originalHash, desired.users.find(value => value.id === ADMIN.id).password, replacement, 'Second authorized replacement 2026!']) assert.equal(recorded.includes(secret), false, 'auditoria/logs não contêm senha ou hash');
});

test('backend security: administração de um workspace não altera identidade compartilhada com outro', async t => {
  const f = await fixture(t, { secondWorkspace: true });
  const { user, client } = await addWorkspaceUser(f);
  f.app.storage.db.prepare('INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES(?,?,?,1)').run('w_b', user.id, 'member');
  const original = f.app.storage.db.prepare('SELECT password_hash,email,name FROM auth_users WHERE id=?').get(user.id);
  let before = await f.admin.projection(); const desired = structuredClone(before.state);
  desired.users.find(u => u.id === user.id).password = 'Forbidden shared account reset!';
  const sync = await f.admin.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: before.revision, desiredState: desired } });
  assert.equal(sync.status, 403, JSON.stringify(sync.data));
  const endpoint = await f.admin.request(`/api/workspaces/w_a/users/${user.id}/password`, { method: 'POST', body: { password: 'Forbidden shared account reset!' } });
  assert.equal(endpoint.status, 403);
  before = await f.admin.projection(); const rename = structuredClone(before.state);
  rename.users.find(u => u.id === user.id).email = 'replacement@example.test';
  const changedIdentity = await f.admin.request('/api/workspaces/w_a/sync', { method: 'POST', body: { expectedRevision: before.revision, desiredState: rename } });
  assert.equal(changedIdentity.status, 403, JSON.stringify(changedIdentity.data));
  assert.deepEqual(f.app.storage.db.prepare('SELECT password_hash,email,name FROM auth_users WHERE id=?').get(user.id), original);
  assert.equal((await client.request('/api/auth/session')).status, 200);
});

test('backend security: item negado não vaza em projeção, comentários automáticos ou histórico', async t => {
  const f = await fixture(t); const source = await createItem(f.admin, 'INFORMAÇÃO CONFIDENCIAL DA ORIGEM');
  const target = await createItem(f.admin, 'Item visível ao leitor');
  await f.admin.command('createRelation', [source.id, target.id, 'TI', 0]);
  await f.admin.command('setBlocker', [source.id, 'Motivo reservado da origem']);
  const { user, client } = await addWorkspaceUser(f, { operations: ['view_item'] });
  await f.admin.sync(state => state.permissionRules.push({ id: 'hide_source', subjectType: 'user', subjectId: user.id, operation: 'view_item', scopeType: 'item', scopeId: source.id, effect: 'deny' }));
  const projected = await client.projection();
  assert.deepEqual(projected.state.items.map(i => i.id), [target.id]);
  assert.equal(projected.state.relations.length, 0);
  assert.doesNotMatch(JSON.stringify(projected), /INFORMAÇÃO CONFIDENCIAL DA ORIGEM|Motivo reservado da origem/);
  for (const item of projected.projection.items) assert.ok(!(item.inheritedBlockedFrom || []).includes(source.id));
  const history = await client.request(`/api/workspaces/w_a/audit-events?itemId=${target.id}&limit=200`);
  assert.equal(history.status, 200);
  assert.doesNotMatch(JSON.stringify(history.data), /INFORMAÇÃO CONFIDENCIAL DA ORIGEM|Motivo reservado da origem/);
  assert.doesNotMatch(JSON.stringify(history.data.events.map(e => [e.before, e.after, e.fromValue, e.toValue, e.comment])), new RegExp(source.id));
});
