import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, mkdirSync, copyFileSync, chmodSync, renameSync, rmdirSync, rmSync, constants } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileHash, checkDatabase, checkAttachmentManifest } from './backup.mjs';

export async function restoreBackup({ source, dataDir = process.env.DATA_DIR } = {}) {
  if (!source || !dataDir) throw new Error('Informe o backup e um DATA_DIR novo ou vazio.');
  const backupDir = resolve(source);
  const target = resolve(dataDir);
  if (existsSync(target) && (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink() || readdirSync(target).length)) {
    throw new Error('Restauração recusada: o destino precisa ser novo ou vazio. A instalação existente não será sobrescrita.');
  }
  const manifestPath = join(backupDir, 'manifest.json');
  if (!existsSync(manifestPath) || lstatSync(manifestPath).size > 32 * 1024 * 1024) throw new Error('Manifesto do backup ausente ou inválido.');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'fluxosvisual-backup' || manifest.version !== 1 || !Array.isArray(manifest.files) || manifest.files.length > 100000) throw new Error('Formato de backup não reconhecido.');
  const paths = new Set();
  for (const entry of manifest.files) {
    if (typeof entry.path !== 'string' || entry.path.includes('\\') || entry.path.includes('\0') || entry.path.split('/').some(part => !part || part === '.' || part === '..') || !(entry.path === 'fluxos.sqlite' || entry.path.startsWith('attachments/'))) throw new Error('O manifesto contém um caminho não permitido.');
    if (paths.has(entry.path)) throw new Error('O manifesto contém arquivos duplicados.');
    paths.add(entry.path);
    const parts = entry.path.split('/');
    let cursor = backupDir;
    for (const part of parts) {
      cursor = join(cursor, part);
      if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) throw new Error(`Arquivo ausente ou inválido no backup: ${entry.path}`);
    }
    const info = lstatSync(cursor);
    if (!info.isFile() || info.size !== entry.size || !/^[0-9a-f]{64}$/.test(entry.sha256 || '') || await fileHash(cursor) !== entry.sha256) throw new Error(`O backup foi alterado ou está incompleto: ${entry.path}`);
  }
  if (!paths.has('fluxos.sqlite')) throw new Error('O backup não contém o banco de dados.');
  checkDatabase(join(backupDir, 'fluxos.sqlite'));
  checkAttachmentManifest(join(backupDir, 'fluxos.sqlite'), manifest.files);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const staging = `${target}.restoring-${randomBytes(8).toString('hex')}`;
  mkdirSync(staging, { mode: 0o700 });
  try {
    for (const entry of manifest.files) {
      const output = join(staging, ...entry.path.split('/'));
      mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
      copyFileSync(join(backupDir, ...entry.path.split('/')), output, constants.COPYFILE_EXCL);
      chmodSync(output, 0o600);
    }
    mkdirSync(join(staging, 'attachments'), { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(join(staging, 'fluxos.sqlite'));
    try {
      db.exec('BEGIN IMMEDIATE; DELETE FROM sessions; DELETE FROM login_attempts;');
      db.prepare('INSERT INTO auth_events(event_type,recorded_at,metadata_json) VALUES (?,?,?)').run('backup_restored', new Date().toISOString(), JSON.stringify({ backupCreatedAt: manifest.createdAt }));
      db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');
    } finally { db.close(); }
    if (existsSync(target)) {
      if (readdirSync(target).length) throw new Error('O destino deixou de estar vazio. Restauração cancelada.');
      rmdirSync(target);
    }
    renameSync(staging, target);
  } catch (error) { rmSync(staging, { recursive: true, force: true }); throw error; }
  return { dataDir: target, restoredFrom: backupDir, files: manifest.files.length, sessionsRevoked: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) console.log('Uso: node scripts/restore.mjs DIRETORIO_BACKUP DATA_DIR_NOVO\nO destino precisa ser novo/vazio. O comando valida hashes e SQLite e revoga sessões antigas.');
    else {
      if (args.length !== 2) throw new Error('Informe DIRETORIO_BACKUP e DATA_DIR_NOVO.');
      console.log(JSON.stringify(await restoreBackup({ source: args[0], dataDir: args[1] }), null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
