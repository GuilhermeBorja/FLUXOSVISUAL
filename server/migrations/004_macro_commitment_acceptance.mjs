const MIGRATION_ID = "004_macro_commitment_acceptance";

export function runMacroCommitmentAcceptanceMigration(storage) {
  const { db } = storage;
  storage.transaction(() => {
    if (db.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(MIGRATION_ID))
      return;
    db.exec(`
      CREATE TABLE commitment_acceptances_v4(
        commitment_id TEXT NOT NULL REFERENCES commitments(id),
        actor_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN('requester','owner','approver')),
        accepted_at TEXT NOT NULL,
        PRIMARY KEY(commitment_id,actor_id)
      ) STRICT;
      INSERT INTO commitment_acceptances_v4(commitment_id,actor_id,role,accepted_at)
        SELECT commitment_id,actor_id,role,accepted_at FROM commitment_acceptances;
      DROP TABLE commitment_acceptances;
      ALTER TABLE commitment_acceptances_v4 RENAME TO commitment_acceptances;
    `);
    db.prepare("INSERT INTO schema_migrations(id,applied_at) VALUES(?,?)")
      .run(MIGRATION_ID, new Date().toISOString());
  });
}
