// Creates the CoreContext (database, settings, logging, errors, events) for a data directory.
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { CoreContext } from '../contracts';
import { Db } from '../db/database';
import { migrate, type MigrationResult } from '../db/migrations';
import { EventBus } from './bus';
import { LogStore, createLogger } from './logger';
import { SettingsService } from './settings';
import { ErrorService } from './error-service';
import { dataPaths } from './paths';
import { systemClock, type Clock } from './time';

export const NOVA_VERSION: string = typeof __NOVA_VERSION__ !== 'undefined' ? __NOVA_VERSION__ : '0.0.0-dev';

export interface CreateCoreOptions {
  dataDir: string;
  /** ':memory:' for tests that do not need a file. */
  dbFile?: string;
  logToFiles?: boolean;
  echoLogs?: boolean;
  clock?: Clock;
  /** Called before migrating an existing database (backup hook). */
  beforeMigrate?: (db: Db, fromVersion: number) => void;
}

export function createCore(opts: CreateCoreOptions): { core: CoreContext; migration: MigrationResult } {
  const paths = dataPaths(opts.dataDir);
  for (const dir of [paths.root, paths.logs, paths.backups, paths.snapshots, paths.exports, paths.diagnostics, paths.runState]) {
    mkdirSync(dir, { recursive: true });
  }
  const db = new Db(opts.dbFile ?? paths.db);
  const migration = migrate(db, (from) => opts.beforeMigrate?.(db, from));
  const bus = new EventBus();
  const logs = new LogStore({ dir: opts.logToFiles === false ? null : paths.logs, level: 'info', maxFileBytes: 5 * 1024 * 1024, maxFiles: 5, echo: opts.echoLogs });
  const settings = new SettingsService(db, bus);
  const diag = settings.section('diagnostics');
  logs.configure({ level: diag.logLevel, maxFileBytes: diag.maxLogFileMb * 1024 * 1024, maxFiles: diag.maxLogFiles });
  settings.onChange((s, changed) => {
    if (changed.includes('diagnostics')) {
      logs.configure({ level: s.diagnostics.logLevel, maxFileBytes: s.diagnostics.maxLogFileMb * 1024 * 1024, maxFiles: s.diagnostics.maxLogFiles });
    }
  });
  const core: CoreContext = {
    db,
    bus,
    logs,
    log: createLogger(logs, 'daemon'),
    settings,
    errors: new ErrorService(db, bus),
    paths,
    clock: opts.clock ?? systemClock,
    instanceId: 'inst_' + randomBytes(6).toString('hex'),
    version: NOVA_VERSION,
    platform: process.platform,
  };
  return { core, migration };
}
