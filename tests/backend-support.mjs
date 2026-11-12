import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';
import { bootstrapWorkspace } from '../server/service.mjs';
import { hashPassword } from '../server/auth.mjs';

export const TEST_PASSWORD = 'Local acceptance password 2026!';
export const ADMIN = { id: 'u_admin', name: 'Administrador de teste', email: 'admin@example.test', organizationId: 'org_a', sectorId: 'org_a_geral', state: 'PE' };

export class ApiClient {
  constructor(baseUrl) { this.baseUrl = baseUrl; this.cookie = ''; this.csrfToken = ''; }
  async request(path, { method = 'GET', body, csrf = true, headers = {}, raw = false } = {}) {
    const outgoing = { ...headers };
    if (this.cookie) outgoing.Cookie = this.cookie;
    if (csrf && this.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) outgoing['X-CSRF-Token'] = this.csrfToken;
    if (body !== undefined && !raw) outgoing['Content-Type'] = 'application/json';
    const response = await fetch(this.baseUrl + path, { method, headers: outgoing, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), redirect: 'manual' });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) this.cookie = cookies.map(value => value.split(';')[0]).join('; ');
    const bytes = Buffer.from(await response.arrayBuffer());
    let data;
    try { data = JSON.parse(bytes.toString('utf8')); } catch { data = bytes.toString('utf8'); }
    if (data?.csrfToken) this.csrfToken = data.csrfToken;
    return { status: response.status, data, bytes, headers: response.headers };
  }
  async login(email = ADMIN.email, password = TEST_PASSWORD) {
    const result = await this.request('/api/auth/login', { method: 'POST', body: { email, password } });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(result.data.csrfToken, 'login returns a CSRF token');
    return result;
  }
  async projection(workspaceId = 'w_a') {
    const result = await this.request(`/api/workspaces/${workspaceId}/projection`);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(Number.isInteger(result.data.revision), 'projection supplies an optimistic revision');
    return result.data;
  }
  async command(type, args, { workspaceId = 'w_a', revision, expected = 200 } = {}) {
    revision ??= (await this.projection(workspaceId)).revision;
    const result = await this.request(`/api/workspaces/${workspaceId}/commands`, { method: 'POST', body: { expectedRevision: revision, commands: [{ type, args }] } });
    assert.equal(result.status, expected, `${type}: ${JSON.stringify(result.data)}`);
    return result.data;
  }
  async sync(mutator, { workspaceId = 'w_a', expected = 200, actions = [], comment = '' } = {}) {
    const projection = await this.projection(workspaceId);
    const desiredState = structuredClone(projection.state);
    mutator(desiredState);
    const result = await this.request(`/api/workspaces/${workspaceId}/sync`, { method: 'POST', body: { expectedRevision: projection.revision, desiredState, actions, comment } });
    assert.equal(result.status, expected, JSON.stringify(result.data));
    return result.data;
  }
}

export async function insertAccount(storage, user, password = TEST_PASSWORD) {
  const timestamp = new Date().toISOString();
  storage.db.prepare('INSERT INTO auth_users (id,name,email,password_hash,disabled,created_at,updated_at) VALUES (?,?,?,?,0,?,?)')
    .run(user.id, user.name, user.email, await hashPassword(password), timestamp, timestamp);
}

export async function fixture(t, { secondWorkspace = false, appOptions = {} } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'fluxos-backend-acceptance-'));
  const app = await createApp({ dataDir, host: '127.0.0.1', port: 0, secureCookies: false, logger: { info() {}, warn() {}, error() {} }, ...appOptions });
  t.after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });
  await insertAccount(app.storage, ADMIN);
  app.storage.db.prepare('INSERT INTO workspaces(id,name,organization_id,created_at) VALUES(?,?,?,?)').run('w_a', 'Workspace de teste', 'org_a', new Date().toISOString());
  app.storage.db.prepare('INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES(?,?,?,1)').run('w_a', ADMIN.id, 'admin');
  bootstrapWorkspace(app.storage, { workspaceId: 'w_a', organizationId: 'org_a', user: ADMIN });
  if (secondWorkspace) {
    const other = { id: 'u_other', name: 'Outra empresa', email: 'other@example.test', organizationId: 'org_b', sectorId: 'org_b_geral', state: 'SP' };
    await insertAccount(app.storage, other);
    app.storage.db.prepare('INSERT INTO workspaces(id,name,organization_id,created_at) VALUES(?,?,?,?)').run('w_b', 'Workspace isolado', 'org_b', new Date().toISOString());
    app.storage.db.prepare('INSERT INTO workspace_memberships(workspace_id,user_id,role,active) VALUES(?,?,?,1)').run('w_b', other.id, 'admin');
    bootstrapWorkspace(app.storage, { workspaceId: 'w_b', organizationId: 'org_b', user: other });
  }
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const admin = new ApiClient(baseUrl);
  await admin.login();
  return { app, admin, baseUrl, dataDir };
}

export function itemInput(title, overrides = {}) {
  return { title, type: 'task', status: 'backlog', ownerId: ADMIN.id, organizationId: ADMIN.organizationId, sectorId: ADMIN.sectorId, state: 'PE', plannedStartAt: '2026-11-02', plannedDurationDays: 2, weight: 1, progressPercent: 0, ...overrides };
}

export async function createItem(client, title, overrides = {}, workspaceId = 'w_a') {
  await client.command('createItem', [itemInput(title, overrides)], { workspaceId });
  const projected = await client.projection(workspaceId);
  const item = projected.state.items.find(entry => entry.title === title);
  assert.ok(item, `created item ${title} appears in the server projection`);
  return item;
}

export async function addWorkspaceUser({ app, admin, baseUrl }, { id = 'u_reader', name = 'Usuário restrito', email = 'reader@example.test', operations = ['view_item'], profileId = '' } = {}) {
  const user = { id, name, email, organizationId: 'org_a', sectorId: 'org_a_geral', state: 'PE', profileId };
  await admin.sync(state => {
    state.users.push({ ...user, password: TEST_PASSWORD });
    for (const operation of operations) state.permissionRules.push({ id: `gpo_${id}_${operation}`, subjectType: 'user', subjectId: id, operation, scopeType: 'global', scopeId: '', effect: 'allow' });
  });
  const client = new ApiClient(baseUrl);
  await client.login(email);
  return { user, client };
}
