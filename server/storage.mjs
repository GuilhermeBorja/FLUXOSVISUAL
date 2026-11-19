import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  chmodSync,
  existsSync,
  lstatSync,
  openSync,
  closeSync,
} from "node:fs";
import { resolve, join, basename } from "node:path";

const IDENTITY_SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS workspace_memberships (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member','viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  PRIMARY KEY(workspace_id,user_id)
) STRICT;
CREATE INDEX IF NOT EXISTS membership_user ON workspace_memberships(user_id,active);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY CHECK(length(token_hash) = 64),
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS session_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires_at);
CREATE TRIGGER IF NOT EXISTS auth_disable_revokes_sessions AFTER UPDATE OF disabled ON auth_users
WHEN NEW.disabled=1
BEGIN DELETE FROM sessions WHERE user_id=NEW.id; END;
CREATE TRIGGER IF NOT EXISTS auth_password_revokes_sessions AFTER UPDATE OF password_hash ON auth_users
WHEN NEW.password_hash!=OLD.password_hash
BEGIN DELETE FROM sessions WHERE user_id=NEW.id; END;

CREATE TABLE IF NOT EXISTS login_attempts (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK(count >= 0)
) STRICT;

CREATE TABLE IF NOT EXISTS auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event_type TEXT NOT NULL,
  ip_hash TEXT,
  recorded_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
) STRICT;
CREATE TRIGGER IF NOT EXISTS auth_events_immutable_update BEFORE UPDATE ON auth_events
BEGIN SELECT RAISE(ABORT,'auth_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS auth_events_immutable_delete BEFORE DELETE ON auth_events
BEGIN SELECT RAISE(ABORT,'auth_events is append-only'); END;
`;

/** Synchronous SQLite transactions avoid sharing half-written workspace states. */
export function createStorage({
  dataDir = process.env.DATA_DIR || "./data",
  filename = "fluxos.sqlite",
} = {}) {
  const directory = resolve(dataDir);
  if (
    filename !== ":memory:" &&
    (filename !== basename(filename) || !filename)
  ) {
    throw new Error("O nome do banco deve ser um arquivo dentro de DATA_DIR.");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  mkdirSync(join(directory, "attachments"), { recursive: true, mode: 0o700 });
  const path = filename === ":memory:" ? filename : join(directory, filename);
  if (path !== ":memory:") {
    if (!existsSync(path)) {
      try {
        closeSync(openSync(path, "wx", 0o600));
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
      throw new Error(
        "O banco deve ser um arquivo regular dentro de DATA_DIR.",
      );
    chmodSync(path, 0o600);
  }
  const db = new DatabaseSync(path, {
    timeout: 5000,
    enableForeignKeyConstraints: true,
  });
  try {
    db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA trusted_schema=OFF;",
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(IDENTITY_SCHEMA);
      db.prepare(
        "INSERT OR IGNORE INTO schema_migrations(id,applied_at) VALUES (?,?)",
      ).run("001_identity", new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (path !== ":memory:")
      for (const file of [path, `${path}-wal`, `${path}-shm`]) {
        if (existsSync(file)) chmodSync(file, 0o600);
      }
  } catch (error) {
    db.close();
    throw error;
  }

  let transactionDepth = 0;
  let sequence = 0;
  let closed = false;
  const storage = {
    db,
    dataDir: directory,
    path,
    transaction(callback) {
      if (callback?.constructor?.name === "AsyncFunction")
        throw new TypeError("A transação exige uma função síncrona.");
      const outer = transactionDepth === 0;
      const savepoint = `storage_${++sequence}`;
      db.exec(outer ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
      transactionDepth++;
      try {
        const result = callback(db);
        if (result && typeof result.then === "function")
          throw new TypeError(
            "Não use operações assíncronas dentro de uma transação SQLite.",
          );
        db.exec(outer ? "COMMIT" : `RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (error) {
        db.exec(
          outer
            ? "ROLLBACK"
            : `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`,
        );
        throw error;
      } finally {
        transactionDepth--;
      }
    },
    close() {
      if (closed) return;
      db.close();
      closed = true;
    },
  };
  return storage;
}
