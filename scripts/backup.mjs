import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, lstatSync, readdirSync, copyFileSync, writeFileSync, chmodSync, constants, existsSync } from 'node:fs';
import { resolve, join, relative, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function fileHash(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function checkDatabase(path) {
  const db = new DatabaseSync(path, { readOnly: true, timeout: 5000 });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== 'ok') throw new Error('Falha na integridade do banco de dados.');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('O banco contém referências inválidas.');
    for (const table of ['auth_users', 'workspaces', 'workspace_memberships', 'sessions']) {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) throw new Error(`Tabela obrigatória ausente no backup: ${table}`);
    }
  } finally { db.close(); }
}

/** A valid database alone is not a complete backup: every immutable blob must exist. */
export function checkAttachmentManifest(databasePath, files) {
  const db = new DatabaseSync(databasePath, { readOnly: true, timeout: 5000 });
  try {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='attachments'").get()) return;
    const entries = new Map(files.map(file => [file.path, file]));
    for (const attachment of db.prepare('SELECT storage_key,size,sha256 FROM attachments').all()) {
      const key = attachment.storage_key;
      if (typeof key !== 'string' || key.includes('\\') || key.includes('\0') || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('O banco contém uma chave de anexo inválida.');
      const entry = entries.get(`attachments/${key}`);
      if (!entry || entry.size !== attachment.size || entry.sha256 !== attachment.sha256) throw new Error(`O backup não contém um anexo íntegro referenciado pelo banco: ${key}`);
    }
  } finally { db.close(); }
}

export async function createBackup({ dataDir = process.env.DATA_DIR || './data', destination } = {}) {
  const sourceDir = resolve(dataDir);
  const sourceDb = join(sourceDir, 'fluxos.sqlite');
  if (!existsSync(sourceDb) || !lstatSync(sourceDb).isFile() || lstatSync(sourceDb).isSymbolicLink()) throw new Error('Banco não encontrado. Execute o setup antes do backup.');
  const stamp = new Date().toISOString();
  const target = resolve(destination || join(sourceDir, 'backups', stamp.replaceAll(':', '-')));
  if (existsSync(target)) throw new Error('O destino do backup já existe. Escolha um diretório novo.');
  if (target === sourceDir || target.startsWith(`${join(sourceDir, 'attachments')}${sep}`)) throw new Error('O backup não pode ficar dentro do diretório de anexos.');
  mkdirSync(target, { recursive: true, mode: 0o700 });
  const databaseCopy = join(target, 'fluxos.sqlite');
  const db = new DatabaseSync(sourceDb, { readOnly: true, timeout: 5000 });
  try { await sqliteBackup(db, databaseCopy); }
  finally { db.close(); }
  chmodSync(databaseCopy, 0o600);
  checkDatabase(databaseCopy);

  const copied = ['fluxos.sqlite'];
  const attachmentRoot = join(sourceDir, 'attachments');
  function walk(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name.endsWith('.tmp')) continue;
      const source = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Links simbólicos não são permitidos no armazenamento de anexos.');
      if (entry.isDirectory()) { walk(source); continue; }
      if (!entry.isFile()) throw new Error('O armazenamento contém um arquivo não regular.');
      const path = relative(sourceDir, source).split(sep).join('/');
      const output = join(target, ...path.split('/'));
      mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
      try { copyFileSync(source, output, constants.COPYFILE_EXCL); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      chmodSync(output, 0o600);
      copied.push(path);
    }
  }
  walk(attachmentRoot);
  const files = [];
  for (const path of copied.sort()) {
    const full = join(target, ...path.split('/'));
    files.push({ path, size: lstatSync(full).size, sha256: await fileHash(full) });
  }
  checkAttachmentManifest(databaseCopy, files);
  const manifest = { format: 'fluxosvisual-backup', version: 1, createdAt: stamp, nodeVersion: process.versions.node, files };
  writeFileSync(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  return { destination: target, createdAt: stamp, files: files.length, totalBytes: files.reduce((sum, entry) => sum + entry.size, 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) console.log('Uso: node scripts/backup.mjs [DIRETORIO_NOVO]\nDATA_DIR seleciona a instalação. O backup online inclui SQLite, anexos e manifesto SHA-256.');
    else {
      if (args.length > 1 || args[0]?.startsWith('--')) throw new Error('Informe apenas o diretório de destino ou --help.');
      console.log(JSON.stringify(await createBackup({ destination: args[0] }), null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
