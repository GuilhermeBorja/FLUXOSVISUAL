import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage } from '../server/storage.mjs';
import { hashPassword, verifyPassword } from '../server/auth.mjs';
import { prepareCredentialHashes } from '../server/credential-policy.mjs';

const PASSWORD = 'Private credential policy test';
async function fixture(t) {
  const dataDir = mkdtempSync(join(tmpdir(), 'fluxos-credential-policy-'));
  const storage = createStorage({ dataDir });
  t.after(() => { storage.close(); rmSync(dataDir, { recursive: true, force: true }); });
  const users = [
    { id: 'admin', profileId: 'profile_admin' },
    { id: 'manager', profileId: '' },
    { id: 'reader', profileId: '' },
    { id: 'employee', profileId: '' },
    { id: 'disabled_admin', profileId: 'profile_admin', disabled: true },
  ].map(user => ({ name: user.id, email: `${user.id}@example.test`, organizationId: 'org_a', sectorId: 'sector_a', state: 'PE', disabled: false, ...user }));
  const state = {
    users, items: [], organizations: [{ id: 'org_a', state: 'PE' }, { id: 'org_b', state: 'SP' }],
    sectors: [{ id: 'sector_a', organizationId: 'org_a' }, { id: 'sector_b', organizationId: 'org_b' }],
    permissionProfiles: [{ id: 'profile_admin', name: 'Administrador' }],
    permissionRules: [
      ...['manage_gpo', 'manage_users'].map(operation => ({ id: `admin_${operation}`, subjectType: 'profile', subjectId: 'profile_admin', operation, scopeType: 'global', scopeId: '', effect: 'allow' })),
      { id: 'manager_users', subjectType: 'user', subjectId: 'manager', operation: 'manage_users', scopeType: 'organization', scopeId: 'org_a', effect: 'allow' },
    ],
  };
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(PASSWORD);
  for (const user of users) storage.db.prepare('INSERT INTO auth_users(id,name,email,password_hash,disabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(user.id, user.name, user.email, passwordHash, Number(user.disabled), now, now);
  for (const [id, org] of [['w_a', 'org_a'], ['w_b', 'org_b']]) storage.db.prepare('INSERT INTO workspaces VALUES(?,?,?,?)').run(id, id, org, now);
  for (const user of users) storage.db.prepare('INSERT INTO workspace_memberships VALUES(?,?,?,1)').run('w_a', user.id, 'member');
  const desired = () => ({ users: structuredClone(users) });
  const prepare = (desiredState, userId = 'manager', extra = {}) => prepareCredentialHashes({ storage, workspaceId: 'w_a', userId, state, desiredState, expectedRevision: 4, currentRevision: 4, ...extra });
  return { storage, state, desired, prepare };
}

test('credential policy: rejeita revisão antiga, IDs duplicados e mais de 100 senhas antes do trabalho caro', async t => {
  const { desired, prepare } = await fixture(t);
  await assert.rejects(prepare(desired(), 'admin', { expectedRevision: 3 }), error => error.code === 'REVISION_CONFLICT');
  const duplicate = desired(); duplicate.users.push({ ...duplicate.users[0] });
  await assert.rejects(prepare(duplicate, 'admin'), error => error.code === 'DUPLICATE_ID');
  const large = { users: Array.from({ length: 101 }, (_, i) => ({ id: `new${i}`, password: PASSWORD })) };
  await assert.rejects(prepare(large, 'admin'), error => error.code === 'CREDENTIAL_BATCH_LIMIT');
});

test('credential policy: permissões propostas e promoção própria não servem como autorização', async t => {
  const { desired, prepare } = await fixture(t);
  const next = desired();
  next.users.find(user => user.id === 'manager').profileId = 'profile_admin';
  next.permissionRules = [{ id: 'injected', subjectType: 'user', subjectId: 'manager', operation: 'manage_gpo', scopeType: 'global', effect: 'allow' }];
  await assert.rejects(prepare(next), error => error.code === 'GPO_ADMIN_REQUIRED');
  const newAdmin = desired(); newAdmin.users.push({ ...newAdmin.users[0], id: 'new_admin', email: 'new_admin@example.test', password: PASSWORD });
  await assert.rejects(prepare(newAdmin), error => error.code === 'GPO_ADMIN_REQUIRED');
});

test('credential policy: gestor de usuários não toma contas administrativas ativas ou inativas', async t => {
  const { desired, prepare } = await fixture(t);
  for (const targetId of ['admin', 'disabled_admin']) {
    const next = desired(); Object.assign(next.users.find(user => user.id === targetId), { disabled: false, password: PASSWORD });
    await assert.rejects(prepare(next), error => error.code === 'GPO_ADMIN_REQUIRED');
  }
});

test('credential policy: autoriza contexto anterior e novo e recusa conta compartilhada', async t => {
  const { storage, desired, prepare } = await fixture(t);
  const move = desired(); Object.assign(move.users.find(user => user.id === 'employee'), { organizationId: 'org_b', sectorId: 'sector_b', state: 'SP', password: PASSWORD });
  await assert.rejects(prepare(move), error => error.code === 'FORBIDDEN');
  storage.db.prepare('INSERT INTO workspace_memberships VALUES(?,?,?,1)').run('w_b', 'employee', 'member');
  const reset = desired(); reset.users.find(user => user.id === 'employee').password = PASSWORD;
  await assert.rejects(prepare(reset, 'admin'), error => error.code === 'SHARED_ACCOUNT');
  const rename = desired(); rename.users.find(user => user.id === 'employee').name = 'Novo nome';
  await assert.rejects(prepare(rename, 'admin'), error => error.code === 'SHARED_ACCOUNT');
});

test('credential policy: só gera hashes para alterações autorizadas e não grava no banco', async t => {
  const { storage, desired, prepare } = await fixture(t);
  const before = storage.db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get('employee').password_hash;
  const next = desired(); next.users.find(user => user.id === 'employee').password = 'Replacement policy password';
  const hashes = await prepare(next);
  assert.equal(hashes.size, 1);
  assert.equal(await verifyPassword('Replacement policy password', hashes.get('employee')), true);
  assert.equal(storage.db.prepare('SELECT password_hash FROM auth_users WHERE id=?').get('employee').password_hash, before);
  assert.equal((await prepare(desired(), 'reader')).size, 0);
});

test('credential policy: não aceita senha curta/longa, conta global existente ou reset por leitura', async t => {
  const { storage, desired, prepare } = await fixture(t);
  for (const password of ['short', 'x'.repeat(129)]) {
    const next = desired(); next.users.find(user => user.id === 'employee').password = password;
    await assert.rejects(prepare(next, 'admin'), error => error.code === 'PASSWORD_POLICY');
  }
  const next = desired(); next.users.find(user => user.id === 'employee').password = PASSWORD;
  const decisions = [];
  await assert.rejects(prepare(next, 'reader', { onDecision: decision => decisions.push(decision) }), error => error.code === 'FORBIDDEN');
  assert.equal(decisions.at(-1).operation, 'manage_users');
  assert.equal(decisions.at(-1).allowed, false);
  const now = new Date().toISOString();
  storage.db.prepare('INSERT INTO auth_users(id,name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('external', 'Externo', 'external@example.test', await hashPassword(PASSWORD), now, now);
  const existing = desired(); existing.users.push({ ...existing.users.find(user => user.id === 'employee'), id: 'external', email: 'external@example.test', password: PASSWORD });
  await assert.rejects(prepare(existing, 'admin'), error => error.code === 'USER_EXISTS');
});
