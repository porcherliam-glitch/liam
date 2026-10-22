// Versioned schema migrations. Never edit a released migration; append a new one.
// The runner creates a database backup before applying migrations to an existing database.
import type { Db } from './database';

export interface Migration {
  version: number;
  name: string;
  up(db: Db): void;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE settings (
          section TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          path TEXT NOT NULL,
          path_key TEXT NOT NULL UNIQUE,          -- normalized path (lower-case on Windows)
          kind TEXT NOT NULL,
          technologies TEXT NOT NULL DEFAULT '[]',
          status TEXT NOT NULL DEFAULT 'active',
          template_id TEXT,
          config TEXT NOT NULL,
          work_state TEXT NOT NULL DEFAULT 'stopped',   -- running | paused | stopped
          git_available INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          parent_id TEXT,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          kind TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          priority INTEGER NOT NULL DEFAULT 1,
          depends_on TEXT NOT NULL DEFAULT '[]',
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          blocker TEXT,
          blocker_code TEXT,
          result TEXT,
          acceptance TEXT,
          verification TEXT NOT NULL DEFAULT '{"status":"not_run","checks":[]}',
          files TEXT NOT NULL DEFAULT '[]',
          planned_files TEXT NOT NULL DEFAULT '[]',
          start_requested INTEGER NOT NULL DEFAULT 0,
          model TEXT,
          source TEXT NOT NULL DEFAULT 'user',
          failure_signatures TEXT NOT NULL DEFAULT '[]', -- recent failure signatures (repeat detection)
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          started_at INTEGER,
          finished_at INTEGER
        );
        CREATE INDEX idx_tasks_project_status ON tasks(project_id, status);
        CREATE INDEX idx_tasks_status_priority ON tasks(status, priority DESC, created_at);

        CREATE TABLE agent_runs (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,
          role TEXT NOT NULL,
          status TEXT NOT NULL,
          provider_id TEXT,
          model_id TEXT,
          step_count INTEGER NOT NULL DEFAULT 0,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          last_action TEXT,
          blocker TEXT,
          files TEXT NOT NULL DEFAULT '[]',
          pending_approval_id TEXT,
          error TEXT,
          error_code TEXT,
          active_ms INTEGER NOT NULL DEFAULT 0,
          state TEXT,                              -- JSON conversation snapshot for pause/resume/recovery
          started_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          ended_at INTEGER
        );
        CREATE INDEX idx_runs_task ON agent_runs(task_id);
        CREATE INDEX idx_runs_status ON agent_runs(status);

        CREATE TABLE agent_steps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
          task_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          ts INTEGER NOT NULL,
          kind TEXT NOT NULL,
          summary TEXT NOT NULL,
          data TEXT
        );
        CREATE INDEX idx_steps_run ON agent_steps(run_id, id);

        CREATE TABLE task_notes (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          project_id TEXT NOT NULL,
          author TEXT NOT NULL,                    -- user | agent | system
          kind TEXT NOT NULL,                      -- note | question | answer
          text TEXT NOT NULL,
          options TEXT NOT NULL DEFAULT '[]',
          assumption TEXT,
          created_at INTEGER NOT NULL,
          consumed_run_id TEXT
        );
        CREATE INDEX idx_task_notes_task ON task_notes(task_id, created_at);

        CREATE TABLE approvals (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          task_id TEXT,
          run_id TEXT,
          kind TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          title TEXT NOT NULL,
          action TEXT NOT NULL,
          consequences TEXT NOT NULL,
          details TEXT NOT NULL DEFAULT '{}',
          status TEXT NOT NULL,
          scope TEXT,
          created_at INTEGER NOT NULL,
          decided_at INTEGER,
          consumed_at INTEGER,                     -- 'once' approvals: when the approved action ran
          acknowledged_at INTEGER                  -- denials: when the agent was told about the denial
        );
        CREATE INDEX idx_approvals_status ON approvals(status);
        CREATE INDEX idx_approvals_fp ON approvals(fingerprint);

        CREATE TABLE approval_rules (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          kind TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE UNIQUE INDEX idx_rules_unique ON approval_rules(IFNULL(project_id, ''), kind, fingerprint);

        CREATE TABLE providers (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          name TEXT NOT NULL,
          base_url TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          paid INTEGER NOT NULL DEFAULT 0,
          approved INTEGER NOT NULL DEFAULT 0,
          options TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE model_profiles (
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          info TEXT NOT NULL,                      -- ModelInfo JSON (cached)
          pricing TEXT,                            -- ModelPricing JSON set by the user
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (provider_id, model_id)
        );

        CREATE TABLE usage_records (
          id TEXT PRIMARY KEY,
          ts INTEGER NOT NULL,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          project_id TEXT,
          task_id TEXT,
          run_id TEXT,
          input_tokens INTEGER NOT NULL DEFAULT 0,
          output_tokens INTEGER NOT NULL DEFAULT 0,
          duration_ms INTEGER NOT NULL DEFAULT 0,
          cost_usd REAL NOT NULL DEFAULT 0,
          cost_estimated INTEGER NOT NULL DEFAULT 0,
          paid INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_usage_ts ON usage_records(ts);
        CREATE INDEX idx_usage_project ON usage_records(project_id, ts);

        CREATE TABLE secrets (
          id TEXT PRIMARY KEY,                     -- e.g. "provider:<id>"
          scheme TEXT NOT NULL,                    -- "dpapi" | "keychain" | "libsecret" | "aes-local"
          ciphertext TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE memory_entries (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          kind TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          source TEXT NOT NULL DEFAULT 'user',
          shareable INTEGER NOT NULL DEFAULT 0,
          task_id TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_memory_project ON memory_entries(project_id, kind);

        CREATE VIRTUAL TABLE memory_fts USING fts5(
          title, content, tags,
          content='memory_entries', content_rowid='rowid',
          tokenize='unicode61 remove_diacritics 2'
        );
        CREATE TRIGGER memory_ai AFTER INSERT ON memory_entries BEGIN
          INSERT INTO memory_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
        END;
        CREATE TRIGGER memory_ad AFTER DELETE ON memory_entries BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, title, content, tags) VALUES ('delete', old.rowid, old.title, old.content, old.tags);
        END;
        CREATE TRIGGER memory_au AFTER UPDATE ON memory_entries BEGIN
          INSERT INTO memory_fts(memory_fts, rowid, title, content, tags) VALUES ('delete', old.rowid, old.title, old.content, old.tags);
          INSERT INTO memory_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
        END;

        CREATE TABLE checkpoints (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          task_id TEXT,
          kind TEXT NOT NULL,
          label TEXT NOT NULL,
          git_head TEXT,
          git_commit TEXT,
          change_cursor INTEGER NOT NULL DEFAULT 0,
          verification TEXT,
          created_at INTEGER NOT NULL,
          restored_at INTEGER
        );
        CREATE INDEX idx_checkpoints_project ON checkpoints(project_id, created_at);

        CREATE TABLE changes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          task_id TEXT,
          run_id TEXT,
          path TEXT NOT NULL,                      -- project-relative, forward slashes
          op TEXT NOT NULL,                        -- create | modify | delete
          before_hash TEXT,                        -- sha256, blob in snapshots/<hash>
          after_hash TEXT,
          actor TEXT NOT NULL DEFAULT 'nova',
          source TEXT NOT NULL DEFAULT 'tool',     -- tool | command | user | restore
          revertible INTEGER NOT NULL DEFAULT 1,
          state TEXT NOT NULL DEFAULT 'committed', -- pending (write in progress) | committed
          path_key TEXT NOT NULL DEFAULT '',       -- canonical comparison key (lower-case on Windows)
          ts INTEGER NOT NULL,
          reverted INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX idx_changes_pending ON changes(state);
        CREATE INDEX idx_changes_project ON changes(project_id, id);
        CREATE INDEX idx_changes_task ON changes(task_id);

        CREATE TABLE file_locks (
          lock_key TEXT PRIMARY KEY,               -- projectId + ':' + normalized path
          project_id TEXT NOT NULL,
          path TEXT NOT NULL,
          task_id TEXT NOT NULL,
          acquired_at INTEGER NOT NULL
        );
        CREATE INDEX idx_locks_task ON file_locks(task_id);

        CREATE TABLE processes (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          task_id TEXT,
          kind TEXT NOT NULL,
          command TEXT NOT NULL,
          cwd TEXT NOT NULL,
          pid INTEGER,
          status TEXT NOT NULL,
          exit_code INTEGER,
          url TEXT,
          instance_id TEXT NOT NULL,              -- daemon instance that spawned it (orphan detection)
          started_at INTEGER NOT NULL,
          ended_at INTEGER
        );
        CREATE INDEX idx_processes_status ON processes(status);

        CREATE TABLE check_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          task_id TEXT,
          kind TEXT NOT NULL,
          command TEXT NOT NULL,
          status TEXT NOT NULL,
          passed INTEGER,
          failed INTEGER,
          skipped INTEGER,
          duration_ms INTEGER,
          output_tail TEXT NOT NULL DEFAULT '',
          failures TEXT NOT NULL DEFAULT '[]',
          failure_signature TEXT,
          message TEXT,
          process_id TEXT,
          artifacts TEXT NOT NULL DEFAULT '[]',
          started_at INTEGER NOT NULL,
          finished_at INTEGER
        );
        CREATE INDEX idx_checks_project ON check_runs(project_id, kind, started_at);

        CREATE TABLE errors (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          what_happened TEXT NOT NULL,
          project_id TEXT,
          task_id TEXT,
          attempted TEXT NOT NULL DEFAULT '[]',
          project_safe INTEGER NOT NULL DEFAULT 1,
          auto_fixable INTEGER NOT NULL DEFAULT 0,
          user_action TEXT,
          details TEXT,
          related TEXT,
          dedupe_key TEXT,
          created_at INTEGER NOT NULL,
          resolved_at INTEGER
        );
        CREATE INDEX idx_errors_open ON errors(resolved_at, created_at);

        CREATE TABLE integrations (
          id TEXT PRIMARY KEY,
          manual_path TEXT,
          last_status TEXT,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE notifications (
          id TEXT PRIMARY KEY,
          level TEXT NOT NULL,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          project_id TEXT,
          task_id TEXT,
          ts INTEGER NOT NULL,
          read_at INTEGER
        );
        CREATE INDEX idx_notifications_ts ON notifications(ts);

        CREATE TABLE backups (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,
          path TEXT NOT NULL,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          reason TEXT NOT NULL,
          project_id TEXT,
          created_at INTEGER NOT NULL
        );
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export function getSchemaVersion(db: Db): number {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  const row = db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'");
  return row ? Number(row.value) : 0;
}

export interface MigrationResult {
  from: number;
  to: number;
  applied: string[];
}

/**
 * Applies pending migrations, each in its own transaction.
 * `beforeMigrate` is called once (with the current version) when an existing database needs migration,
 * so the caller can create a backup first.
 */
export function migrate(db: Db, beforeMigrate?: (fromVersion: number) => void): MigrationResult {
  const from = getSchemaVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from);
  if (pending.length > 0 && from > 0 && beforeMigrate) beforeMigrate(from);
  const applied: string[] = [];
  for (const m of pending) {
    db.transaction(() => {
      m.up(db);
      db.run("INSERT INTO meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [String(m.version)]);
    });
    applied.push(`${m.version}: ${m.name}`);
  }
  return { from, to: getSchemaVersion(db), applied };
}
