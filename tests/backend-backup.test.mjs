import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorage } from '../server/storage.mjs';
import { createAuth, hashPassword, verifyPassword } from '../server/auth.mjs';
import { createBackup } from '../scripts/backup.mjs';
import { restoreBackup } from '../scripts/restore.mjs';
import { setup } from '../scripts/setup.mjs';
import { createService } from '../server/service.mjs';

test('backend backup: cópia online restaura dados e anexos, revoga sessões e recusa sobrescrita', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fluxos-backup-'));
  const storage = createStorage({ dataDir: join(directory, 'source') });
  let restored;
  t.after(async () => { storage.close(); restored?.close(); await rm(directory, { recursive: true, force: true }); });
  const password = 'Backup acceptance secret 2026!'; const at = new Date().toISOString();
  storage.db.prepare('INSERT INTO auth_users(id,name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('test', 'Usuário restaurável', 'backup@example.test', await hashPassword(password), at, at);
  const auth = createAuth({ storage });
  await auth.login({ email: 'backup@example.test', password, ip: '127.0.0.1' });
  const evidence = Buffer.from('Evidência de restauração\n');
  await writeFile(join(storage.dataDir, 'attachments', 'evidence.bin'), evidence);
  const backup = await createBackup({ dataDir: storage.dataDir, destination: join(directory, 'backup') });
  assert.equal(backup.files, 2);
  const manifest = JSON.parse(await readFile(join(backup.destination, 'manifest.json'), 'utf8'));
  assert.equal(manifest.format, 'fluxosvisual-backup');
  assert.ok(manifest.files.every(entry => /^[a-f0-9]{64}$/.test(entry.sha256)));
  const destination = join(directory, 'restored');
  const result = await restoreBackup({ source: backup.destination, dataDir: destination });
  assert.equal(result.sessionsRevoked, true);
  restored = createStorage({ dataDir: destination });
  assert.equal(restored.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  const account = restored.db.prepare('SELECT * FROM auth_users WHERE id=?').get('test');
  assert.equal(account.name, 'Usuário restaurável');
  assert.equal(await verifyPassword(password, account.password_hash), true);
  assert.deepEqual(await readFile(join(destination, 'attachments', 'evidence.bin')), evidence);
  assert.ok(restored.db.prepare("SELECT 1 FROM auth_events WHERE event_type='backup_restored'").get());
  await assert.rejects(restoreBackup({ source: backup.destination, dataDir: destination }), /novo ou vazio|new or empty/i);
  assert.equal(restored.db.prepare('SELECT name FROM auth_users WHERE id=?').get('test').name, 'Usuário restaurável');
});

test('backend backup: arquivo alterado ou caminho inseguro nunca cria instalação parcial', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fluxos-backup-tamper-'));
  const storage = createStorage({ dataDir: join(directory, 'source') });
  t.after(async () => { storage.close(); await rm(directory, { recursive: true, force: true }); });
  const evidencePath = join(storage.dataDir, 'attachments', 'evidence.bin');
  await writeFile(evidencePath, Buffer.from('Original evidence'));
  const backup = await createBackup({ dataDir: storage.dataDir, destination: join(directory, 'backup') });
  const target = join(directory, 'rejected');
  await writeFile(join(backup.destination, 'attachments', 'evidence.bin'), Buffer.from('Modified evidence'));
  await assert.rejects(restoreBackup({ source: backup.destination, dataDir: target }), /alterado|incompleto/i);
  await assert.rejects(stat(target), { code: 'ENOENT' });
  const manifestFile = join(backup.destination, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  manifest.files[0].path = '../outside.sqlite';
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(restoreBackup({ source: backup.destination, dataDir: target }), /caminho não permitido/i);
  await assert.rejects(stat(target), { code: 'ENOENT' });
});

test('backend backup: manifesto cobre anexos referenciados, inclusive os excluídos logicamente', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'fluxos-backup-manifest-'));
  const dataDir = join(directory, 'source');
  const initialized = await setup({ email: 'manifest@example.test', password: 'Manifest acceptance password 2026!', 'data-dir': dataDir });
  const storage = createStorage({ dataDir });
  t.after(async () => { storage.close(); await rm(directory, { recursive: true, force: true }); });
  const service = createService(storage, { logger: { info() {} } });
  const state = await service.mutate(initialized.workspaceId, initialized.userId, { expectedRevision: 0, commands: [{ type: 'createItem', args: [{ title: 'Evidência arquivada', ownerId: initialized.userId, plannedDurationDays: 2 }] }] });
  const item = state.state.items[0], evidence = Buffer.from('Conteúdo com trilha de exclusão lógica');
  const hash = createHash('sha256').update(evidence).digest('hex'), at = new Date().toISOString();
  const evidencePath = join(dataDir, 'attachments', 'archived.bin');
  await writeFile(evidencePath, evidence);
  storage.db.prepare('INSERT INTO attachments(id,workspace_id,item_id,storage_key,name,mime,size,sha256,created_by,created_at,deleted_at,deleted_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('attachment_archived', initialized.workspaceId, item.id, 'archived.bin', 'Evidência.txt', 'text/plain', evidence.length, hash, initialized.userId, at, at, initialized.userId);
  const backup = await createBackup({ dataDir, destination: join(directory, 'complete') });
  const destination = join(directory, 'restored');
  await restoreBackup({ source: backup.destination, dataDir: destination });
  const restored = createStorage({ dataDir: destination });
  try {
    const record = restored.db.prepare('SELECT * FROM attachments WHERE id=?').get('attachment_archived');
    assert.equal(record.deleted_at, at); assert.equal(record.sha256, hash);
    assert.deepEqual(await readFile(join(destination, 'attachments', record.storage_key)), evidence);
  } finally { restored.close(); }

  const manifestPath = join(backup.destination, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files = manifest.files.filter(entry => entry.path !== 'attachments/archived.bin');
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(restoreBackup({ source: backup.destination, dataDir: join(directory, 'incomplete') }), /anexo íntegro referenciado/i);
  await assert.rejects(stat(join(directory, 'incomplete')), { code: 'ENOENT' });
  await rm(evidencePath);
  await assert.rejects(createBackup({ dataDir, destination: join(directory, 'missing') }), /anexo íntegro referenciado/i);
});
