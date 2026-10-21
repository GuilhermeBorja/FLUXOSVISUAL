import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Always creates its own Compose project/volume. It never reuses or removes the
// operator's normal deployment, and never sends the generated password to stdout.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.FLUXOS_SMOKE_PORT || '3000';
assert.match(port, /^\d+$/);
const baseUrl = `http://localhost:${port}`;
const environment = { ...process.env, COMPOSE_FILE: resolve(projectRoot, 'compose.yaml'), COMPOSE_PROJECT_NAME: `fluxos-acceptance-${process.pid}`, PUBLIC_ORIGIN: baseUrl, PORT: port };
const password = randomBytes(30).toString('base64url');
const email = 'container-acceptance@example.test';
let cookie = '', csrfToken = '';

function compose(args, input) {
  const result = spawnSync('docker', ['compose', ...args], { cwd: projectRoot, env: environment, input, encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `docker compose ${args.slice(0, 2).join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout;
}

async function request(path, method = 'GET', body) {
  const url = new URL(path, baseUrl);
  let response, bytes;
  try {
    response = await fetch(url, {
      method, redirect: 'manual',
      // spawnSync pauses the event loop while Docker restarts. A fresh socket
      // avoids reusing a pooled connection closed by the previous container.
      headers: { Connection: 'close', ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const code = error?.cause?.code || error?.code || error?.name || 'NETWORK_ERROR';
    // URLs for downloads include signatures. Log only the pathname and code;
    // never print the query, request body, cookie or original error object.
    throw new Error(`${method} ${url.pathname}: falha no transporte (${code}).`);
  }
  const setCookie = response.headers.getSetCookie();
  if (setCookie.length) cookie = setCookie.map(value => value.split(';')[0]).join('; ');
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); } catch { data = bytes; }
  assert.ok(response.ok, `${method} ${url.pathname}: HTTP ${response.status}`);
  return { data, bytes, headers: response.headers };
}

async function login() {
  cookie = ''; csrfToken = '';
  const { data } = await request('/api/auth/login', 'POST', { email, password });
  assert.ok(data.user?.id && data.csrfToken && data.workspaceId);
  csrfToken = data.csrfToken;
  return data;
}

let primaryError;
try {
  console.log('Docker Compose: build');
  compose(['build']);
  console.log('Docker Compose: setup');
  compose(['run', '--rm', '-T', 'fluxosvisual', 'node', 'scripts/setup.mjs', '--email', email, '--password-stdin', '--name', 'Administrador CI', '--organization', 'Empresa CI', '--workspace', 'Persistência CI', '--state', 'PE'], `${password}\n`);
  console.log('Docker Compose: start e healthcheck');
  compose(['up', '-d', '--wait', '--wait-timeout', '120']);
  assert.ok((await request('/api/health')).data);
  console.log('Docker Compose: persistência inicial');
  const auth = await login();
  const path = `/api/workspaces/${auth.workspaceId}`;
  const { data: initial } = await request(`${path}/projection`);
  const { data: created } = await request(`${path}/commands`, 'POST', {
    expectedRevision: initial.revision,
    commands: [{ type: 'createItem', args: [{ title: 'Persistido antes do reinício', type: 'task', status: 'backlog', ownerId: auth.user.id, plannedStartAt: '2026-11-02', plannedDurationDays: 2, weight: 1, progressPercent: 0 }] }],
  });
  const item = created.state.items.find(value => value.title === 'Persistido antes do reinício');
  assert.ok(item?.id);
  const fileBytes = Buffer.from('Evidência privada que sobrevive ao reinício.\n', 'utf8');
  const { data: uploaded } = await request(`${path}/items/${item.id}/attachments`, 'POST', { name: 'persistencia.txt', mime: 'text/plain', dataBase64: fileBytes.toString('base64') });
  const attachment = uploaded.state.attachments.find(value => value.itemId === item.id);
  assert.equal(attachment.sha256, createHash('sha256').update(fileBytes).digest('hex'));

  console.log('Docker Compose: restart');
  compose(['restart', 'fluxosvisual']);
  compose(['up', '-d', '--wait', '--wait-timeout', '120']);
  console.log('Docker Compose: dados restaurados e download');
  const afterLogin = await login();
  assert.equal(afterLogin.workspaceId, auth.workspaceId); assert.equal(afterLogin.user.id, auth.user.id);
  const { data: persisted } = await request(`${path}/projection`);
  assert.equal(persisted.state.items.find(value => value.id === item.id)?.title, item.title);
  assert.equal(persisted.state.attachments.find(value => value.id === attachment.id)?.sha256, attachment.sha256);
  assert.ok(persisted.revision >= created.revision);
  const { data: signed } = await request(`${path}/attachments/${attachment.id}/download-url`, 'POST', {});
  const download = await request(signed.url);
  assert.deepEqual(download.bytes, fileBytes);
  console.log('Docker Compose: build, setup privado, health, login, item/anexo, reinício e persistência passaram.');
} catch (error) {
  primaryError = error;
  throw error;
} finally {
  try { compose(['down', '--volumes', '--remove-orphans']); }
  catch (cleanupError) {
    if (!primaryError) throw cleanupError;
    console.error('Docker Compose: a limpeza do projeto de teste falhou; o erro original foi preservado.');
  }
}
