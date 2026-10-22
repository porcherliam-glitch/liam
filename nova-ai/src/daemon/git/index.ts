// Barrel of the git module (git, checkpoints, backups, export/import). Used by src/daemon/app.ts.
// Wiring (no factory calls another service; nothing to start or stop):
//   s.git = createGitService(s)                 – git via execTool; git path from s.integrations.resolvePath('git')
//   s.checkpoints = createCheckpointService(s)  – uses s.projects, s.journal, s.git, s.tasks, s.checks, s.pathGuard
//   s.backups = createBackupService(s)          – uses s.projects, s.tasks, s.providers, s.journal, s.work,
//                                                 s.governor, s.notifications, s.watcher, s.resources
//   registerGitRpc(router, s)                   – git.*, checkpoints.*, backup.*, data.*
//   (s.backups as BackupServiceImpl).setRestartHandler(fn) – app.ts already calls it; fn restarts the daemon after a
//   database restore was scheduled (restore-pending.json { backupPath, backupId, safetyBackupPath, requestedAt }).
// Optional extras beyond the contracts: CheckpointServiceImpl.prune(cutoff) for the maintenance timer.
export { createGitService, MAX_DIFF_FILES, MAX_DIFF_CONTENT_BYTES, MAX_STATUS_FILES, unifiedForNewFile } from './git-service';
export type { GitServiceOptions } from './git-service';
export { GIT_REF_RE } from './runner';
export { createCheckpointService } from '../checkpoints/checkpoint-service';
export type { CheckpointServiceImpl } from '../checkpoints/checkpoint-service';
export { countSecretLines } from '../checkpoints/secret-scan';
export { createBackupService } from '../backup/backup-service';
export type { BackupServiceImpl, BackupServiceOptions } from '../backup/backup-service';
export { EXPORT_FORMAT, EXPORT_VERSION, ExportEnvelopeSchema, ProviderExportSchema, MAX_IMPORT_BYTES } from '../backup/export-import';
export { SNAPSHOT_MAX_BYTES } from '../backup/snapshot';
export { registerGitRpc } from './rpc';
