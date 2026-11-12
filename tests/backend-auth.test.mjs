import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from '../server/storage.mjs';
import { createAuth, hashPassword, verifyPassword } from '../server/auth.mjs';

const password = 'Private test password 2026!';
async function setup(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'fluxos-auth-'));
  const storage = createStorage({ dataDir });
  t.after(async () => { storage.close(); await rm(dataDir, { recursive: true, force: true }); });
  const at = new Date().toISOString();
  storage.db.prepare('INSERT INTO auth_users(id,name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('user', 'Pessoa', 'person@example.test', await hashPassword(password), at, at);
  const auth = createAuth({ storage, ...options });
  const request = token => ({ headers: { cookie: `fv_session=${token}`, host: 'localhost:3000' }, socket: {} });
  return { dataDir, storage, auth, request };
}

test('backend auth: senhas têm salts independentes e nunca aparecem no usuário público', async t => {
  const { storage, auth } = await setup(t);
  const first = storage.db.prepare('SELECT password_hash FROM auth_users').get().password_hash;
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('incorrect password', first), false);
  assert.equal(await verifyPassword(password, 'invalid hash'), false);
  const login = await auth.login({ email: 'PERSON@example.test', password, ip: '127.0.0.1' });
  assert.deepEqual(Object.keys(login.user).sort(), ['disabled', 'email', 'id', 'name']);
  assert.ok(!JSON.stringify(login.user).includes(password));
  assert.notEqual(storage.db.prepare('SELECT token_hash FROM sessions').get().token_hash, login.token);
});

test('backend auth: sessões expiram por tempo total e inatividade sem espera artificial', async t => {
  const { storage, auth, request } = await setup(t, { sessionTtlMs: 60_000, idleTtlMs: 10_000 });
  let login = await auth.login({ email: 'person@example.test', password, ip: '127.0.0.1' });
  assert.equal(auth.authenticate(request(login.token)).user.id, 'user');
  storage.db.prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1);
  assert.throws(() => auth.authenticate(request(login.token)), error => error.status === 401);
  login = await auth.login({ email: 'person@example.test', password, ip: '127.0.0.1' });
  storage.db.prepare('UPDATE sessions SET last_seen_at=?').run(Date.now() - 20_000);
  assert.throws(() => auth.authenticate(request(login.token)), error => error.status === 401);
  assert.equal(storage.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
});

test('backend auth: reset de senha revoga todas as sessões e impede credencial anterior', async t => {
  const { auth, request } = await setup(t);
  const first = await auth.login({ email: 'person@example.test', password, ip: '127.0.0.1' });
  const second = await auth.login({ email: 'person@example.test', password, ip: '127.0.0.2' });
  const newPassword = 'Replacement private password 2026!';
  await auth.setPassword('user', newPassword);
  for (const session of [first, second]) assert.throws(() => auth.authenticate(request(session.token)), error => error.status === 401);
  await assert.rejects(auth.login({ email: 'person@example.test', password, ip: '127.0.0.1' }), error => error.status === 401);
  assert.equal((await auth.login({ email: 'person@example.test', password: newPassword, ip: '127.0.0.1' })).user.id, 'user');
});

test('backend auth: conta inativada durante cálculo de senha não recebe sessão', async t => {
  const { storage, auth } = await setup(t);
  const pending = auth.login({ email: 'person@example.test', password, ip: '127.0.0.1' });
  storage.db.prepare('UPDATE auth_users SET disabled=1 WHERE id=?').run('user');
  await assert.rejects(pending, error => error.status === 401);
  assert.equal(storage.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
});

test('backend auth: CSRF, origem e cookies ambíguos são rejeitados', async t => {
  const { auth, request } = await setup(t, { publicOrigin: 'https://fluxos.example.test', secureCookies: true });
  const login = await auth.login({ email: 'person@example.test', password, ip: '127.0.0.1' });
  const req = request(login.token); const session = auth.authenticate(req);
  assert.throws(() => auth.requireCsrf(req, session), error => error.status === 403);
  req.headers['x-csrf-token'] = login.csrfToken; req.headers.origin = 'https://fluxos.example.test';
  assert.doesNotThrow(() => auth.requireCsrf(req, session));
  req.headers.origin = 'https://attacker.example.test';
  assert.throws(() => auth.requireCsrf(req, session), error => error.status === 403);
  req.headers.cookie += '; fv_session=ambiguous';
  assert.throws(() => auth.authenticate(req), error => error.status === 401);
  assert.match(auth.cookie(login.token), /; Secure/);
});

test('backend auth: limite de tentativas e trilha de acesso sobrevivem ao reinício', async t => {
  const { dataDir, storage, auth, request } = await setup(t, { rateLimit: { maxAttempts: 2, maxIpAttempts: 5, windowMs: 60_000 } });
  const login = await auth.login({ email: 'person@example.test', password, ip: '127.0.0.1' });
  for (let i = 0; i < 2; i++) await assert.rejects(auth.login({ email: 'unknown@example.test', password, ip: '127.0.0.2' }), error => error.status === 401);
  await assert.rejects(auth.login({ email: 'unknown@example.test', password, ip: '127.0.0.2' }), error => error.status === 429);
  assert.throws(() => storage.db.exec('DELETE FROM auth_events'), /append-only/);
  assert.throws(() => storage.db.exec("UPDATE auth_events SET event_type='changed'"), /append-only/);
  storage.close();
  const reopened = createStorage({ dataDir }); t.after(() => reopened.close());
  const restoredAuth = createAuth({ storage: reopened, rateLimit: { maxAttempts: 2, maxIpAttempts: 5, windowMs: 60_000 } });
  assert.equal(restoredAuth.authenticate(request(login.token)).user.id, 'user');
  await assert.rejects(restoredAuth.login({ email: 'unknown@example.test', password, ip: '127.0.0.2' }), error => error.status === 429);
  assert.ok(reopened.db.prepare('SELECT COUNT(*) AS n FROM auth_events').get().n >= 3);
});
