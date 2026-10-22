// CheckpointService (SPEC §4.6, §6.6): restore points of a project = git HEAD + change-journal cursor + a
// "known good" verification marker; previews and restores of NOVA's changes; commits after successful tasks.
// Key decisions:
// - A restore only ever reverts NOVA's journaled changes (ChangeJournal.revert): files the user changed afterwards
//   are reported as conflicts and stay untouched (MASTERPROMPT §12). It is refused (CONFLICT) while tasks of the
//   project run, always creates a pre_restore checkpoint first (the journal records the revert itself as NOVA
//   changes, so restoring that checkpoint undoes the restore) and is serialized per project.
// - Verification marker: post_task = the task's verification (patched by WorkCycle before afterTask); every other
//   kind = "latest checks newer than the last journaled change" (passed / failed / not_run).
// - Commits (afterTask, restore with commit=true) leave out files modified by someone else since NOVA's last write
//   (modifiedSinceNova), files whose latest NOVA change was only detected after an agent command (origin uncertain:
//   the user may have saved them in another program meanwhile – warning, never committed under NOVA's name),
//   sensitive files (.env, keys …) and files that look like they contain a credential
//   (SECRET_IN_CODE warning error, file skipped). afterTask commits only when project.config.autoCommit and the
//   verification allows it (passed, or not failed when settings.agents.commitOnlyWhenVerified is off). A failing
//   commit (e.g. a rejecting git hook) never fails the task: a GIT_ERROR warning is reported and the post_task
//   checkpoint is created with gitCommit null.
// - Emits checkpoint.updated on create and when a checkpoint was restored.
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckKind, Checkpoint, CheckpointKind, Project, RestoreResult, Task } from '@shared/schemas';
import type { CheckpointService, Services } from '../contracts';
import { conflict, errorMessage, notFound, validation } from '../core/errors';
import { newId } from '../core/ids';
import { redactString } from '../core/redact';
import { KeyedMutex } from '../git/runner';
import { countSecretLines, looksBinary } from './secret-scan';

interface CheckpointRow {
  id: string;
  project_id: string;
  task_id: string | null;
  kind: string;
  label: string;
  git_head: string | null;
  git_commit: string | null;
  change_cursor: number;
  verification: string | null;
  created_at: number;
  restored_at: number | null;
}

type Marker = Checkpoint['verification'];

const MARKERS = new Set(['passed', 'failed', 'unavailable', 'not_run']);
/** Files larger than this are not scanned for secrets (and still committed). */
const MAX_SCAN_BYTES = 5 * 1024 * 1024;
/** prune() keeps at least this many newest checkpoints per project. */
const KEEP_PER_PROJECT = 50;
const STATE_CHECK_KINDS: CheckKind[] = ['build', 'test', 'typecheck', 'lint'];

const toCheckpoint = (r: CheckpointRow): Checkpoint => ({
  id: r.id,
  projectId: r.project_id,
  taskId: r.task_id,
  kind: r.kind as CheckpointKind,
  label: r.label,
  gitHead: r.git_head,
  gitCommit: r.git_commit,
  changeCursor: Number(r.change_cursor),
  verification: r.verification && MARKERS.has(r.verification) ? (r.verification as Marker) : null,
  createdAt: Number(r.created_at),
  restoredAt: r.restored_at === null ? null : Number(r.restored_at),
});

function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface CheckpointServiceImpl extends CheckpointService {
  /** Deletes checkpoints created before the cutoff, keeping the newest 50 per project and the latest verified one. */
  prune(olderThanMs: number): number;
  /** Project of a restore target (used by the RPC layer for the operation). Throws like preview/restore. */
  projectIdFor(input: { checkpointId?: string; taskId?: string }): string;
}

interface Target {
  projectId: string;
  afterId?: number;
  taskId?: string;
  label: string;
  checkpoint: Checkpoint | null;
}

export function createCheckpointService(s: Services): CheckpointServiceImpl {
  const db = s.core.db;
  const log = s.core.log.child('checkpoints');
  const restoreMutex = new KeyedMutex();
  const ci = s.core.platform === 'win32';
  const key = (p: string) => (ci ? p.toLowerCase() : p).replace(/\\/g, '/');

  function getRow(id: string): CheckpointRow | undefined {
    return db.get<CheckpointRow>('SELECT * FROM checkpoints WHERE id = ?', [id]);
  }

  async function safeHead(root: string): Promise<string | null> {
    try {
      return await s.git.head(root);
    } catch (e) {
      log.debug('Git-HEAD nicht ermittelbar', { error: errorMessage(e) });
      return null;
    }
  }

  /** "Latest checks newer than the last change": passed / failed / not_run. */
  function stateMarker(projectId: string, cursor: number): Marker {
    let lastChangeTs: number | null = null;
    try {
      lastChangeTs = cursor > 0 ? (s.journal.get(cursor)?.ts ?? null) : null;
    } catch (e) {
      log.debug('Letzte Änderung nicht ermittelbar', { error: errorMessage(e) });
    }
    const relevant = [];
    for (const kind of STATE_CHECK_KINDS) {
      try {
        const run = s.checks.latest(projectId, kind);
        if (run && run.finishedAt !== null && (lastChangeTs === null || run.startedAt >= lastChangeTs)) relevant.push(run);
      } catch (e) {
        log.debug('Prüfläufe nicht verfügbar', { error: errorMessage(e) });
        return 'not_run';
      }
    }
    if (relevant.some((r) => r.status === 'failed' || r.status === 'error')) return 'failed';
    if (relevant.some((r) => r.status === 'passed')) return 'passed';
    return 'not_run';
  }

  async function insert(input: { projectId: string; kind: CheckpointKind; label: string; taskId: string | null; verification?: Marker; gitCommit: string | null }): Promise<Checkpoint> {
    const project = s.projects.require(input.projectId);
    const gitHead = await safeHead(project.path);
    const cursor = s.journal.maxId(project.id);
    const verification = input.verification !== undefined ? input.verification : stateMarker(project.id, cursor);
    const label = shorten(redactString(input.label), 200) || 'Wiederherstellungspunkt';
    const cp: Checkpoint = {
      id: newId('chk'),
      projectId: project.id,
      taskId: input.taskId,
      kind: input.kind,
      label,
      gitHead,
      gitCommit: input.gitCommit,
      changeCursor: cursor,
      verification,
      createdAt: s.core.clock.now(),
      restoredAt: null,
    };
    db.run(
      `INSERT INTO checkpoints(id, project_id, task_id, kind, label, git_head, git_commit, change_cursor, verification, created_at, restored_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [cp.id, cp.projectId, cp.taskId, cp.kind, cp.label, cp.gitHead, cp.gitCommit, cp.changeCursor, cp.verification, cp.createdAt],
    );
    s.core.bus.emit('checkpoint.updated', cp);
    log.info('Wiederherstellungspunkt erstellt', { id: cp.id, projectId: cp.projectId, kind: cp.kind, changeCursor: cp.changeCursor });
    return cp;
  }

  function resolveTarget(input: { checkpointId?: string; taskId?: string }): Target {
    if (Boolean(input.checkpointId) === Boolean(input.taskId)) throw validation('Bitte genau einen Wiederherstellungspunkt oder eine Aufgabe angeben.');
    if (input.checkpointId) {
      const row = getRow(input.checkpointId);
      if (!row) throw notFound('Wiederherstellungspunkt', input.checkpointId);
      const cp = toCheckpoint(row);
      return { projectId: cp.projectId, afterId: cp.changeCursor, label: cp.label, checkpoint: cp };
    }
    const task = s.tasks.get(input.taskId!);
    if (!task) throw notFound('Aufgabe', input.taskId!);
    return { projectId: task.projectId, taskId: task.id, label: `Aufgabe „${shorten(task.title, 120)}“`, checkpoint: null };
  }

  function ensureNoRunningTasks(projectId: string): void {
    const running = s.tasks.list({ projectId, status: ['running'] });
    if (running.length > 0) {
      throw conflict(
        `Während in diesem Projekt Aufgaben laufen, kann nichts wiederhergestellt werden (${running.length} ${running.length === 1 ? 'Aufgabe läuft' : 'Aufgaben laufen'}). Bitte die Arbeit zuerst pausieren oder stoppen.`,
        { running: running.map((t) => t.id) },
      );
    }
  }

  function isSensitive(rel: string): boolean {
    try {
      return s.pathGuard.isSensitive(rel);
    } catch {
      return /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]+)?|id_rsa[^/]*|id_ed25519[^/]*|\.npmrc|\.pypirc|\.git-credentials|[^/]+\.(pem|key|pfx|p12))$/i.test(rel);
    }
  }

  /** Splits candidate paths into committable ones and ones that look like they contain credentials. */
  function filterSecrets(root: string, paths: string[]): { ok: string[]; secret: string[] } {
    const ok: string[] = [];
    const secret: string[] = [];
    for (const rel of paths) {
      if (isSensitive(rel)) {
        secret.push(rel);
        continue;
      }
      const abs = join(root, ...rel.split('/'));
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        ok.push(rel); // deleted: the commit stages the deletion
        continue;
      }
      if (!st.isFile() || st.size > MAX_SCAN_BYTES) {
        ok.push(rel);
        continue;
      }
      let buf: Buffer;
      try {
        buf = readFileSync(abs);
      } catch (e) {
        log.debug('Datei für Geheimnis-Prüfung nicht lesbar – wird nicht committet', { path: rel, error: errorMessage(e) });
        secret.push(rel);
        continue;
      }
      if (!looksBinary(buf) && countSecretLines(rel, buf.toString('utf8')) > 0) secret.push(rel);
      else ok.push(rel);
    }
    return { ok, secret };
  }

  function reportSecrets(project: Project, taskId: string | null, files: string[], context: string): void {
    const shown = files.slice(0, 10).join(', ') + (files.length > 10 ? ` und ${files.length - 10} weitere` : '');
    s.core.errors.report({
      code: 'SECRET_IN_CODE',
      severity: 'warning',
      title: 'Datei mit möglichem Geheimnis nicht committet',
      whatHappened: `${files.length === 1 ? 'Eine Datei wurde' : `${files.length} Dateien wurden`} nicht committet (${context}), weil sie etwas enthalten, das wie ein Zugangsschlüssel oder Passwort aussieht, oder weil es sich um eine vertrauliche Datei handelt: ${shown}.`,
      projectId: project.id,
      taskId,
      attempted: [`Automatischer Git-Commit (${context})`],
      projectSafe: true,
      autoFixable: false,
      userAction:
        'Bitte die Dateien prüfen. Schlüssel und Passwörter gehören in eine nicht versionierte Datei (z. B. .env) oder in den Schlüsselspeicher. Danach können die Dateien von Hand committet werden.',
      related: { checkRunId: null, runId: null, approvalId: null, file: files[0] ?? null, line: null },
      dedupeKey: `secret-in-code:${taskId ?? project.id}`,
    });
  }

  /** Keys of paths whose newest committed, not reverted NOVA change was recorded after an agent command. */
  function commandDetectedKeys(projectId: string): Set<string> {
    const out = new Set<string>();
    const seen = new Set<string>();
    const rows = db.all<{ path_key: string; source: string }>(
      "SELECT path_key, source FROM changes WHERE project_id = ? AND state = 'committed' AND actor = 'nova' AND reverted = 0 ORDER BY id DESC LIMIT 50000",
      [projectId],
    );
    for (const r of rows) {
      const k = key(r.path_key);
      if (seen.has(k)) continue;
      seen.add(k);
      if (r.source === 'command') out.add(k);
    }
    return out;
  }

  function reportCommandFiles(project: Project, taskId: string | null, files: string[], context: string): void {
    const shown = files.slice(0, 10).join(', ') + (files.length > 10 ? ` und ${files.length - 10} weitere` : '');
    s.core.errors.report({
      code: 'GIT_ERROR',
      severity: 'warning',
      title: 'Von Befehlen geänderte Dateien nicht committet',
      whatHappened: `${files.length === 1 ? 'Eine Datei wurde' : `${files.length} Dateien wurden`} nicht automatisch committet (${context}): ${shown}. Sie wurden geändert, während ein Befehl von NOVA lief – ob die Änderung vom Befehl oder von Ihnen in einem anderen Programm stammt, lässt sich nicht sicher erkennen.`,
      projectId: project.id,
      taskId,
      attempted: [`Automatischer Git-Commit (${context})`],
      projectSafe: true,
      autoFixable: false,
      userAction: 'Die Dateien sind unverändert gespeichert. Bitte prüfen und bei Bedarf selbst committen.',
      related: { checkRunId: null, runId: null, approvalId: null, file: files[0] ?? null, line: null },
      dedupeKey: `command-files-not-committed:${project.id}`,
    });
  }

  /** Commits the given project-relative paths (filtered); never throws – problems become warnings. */
  async function commitFiltered(project: Project, taskId: string | null, paths: string[], message: string, context: string): Promise<string | null> {
    let repo = false;
    try {
      repo = await s.git.isRepo(project.path);
    } catch (e) {
      log.debug('Git-Prüfung fehlgeschlagen – kein Commit', { error: errorMessage(e) });
    }
    if (!repo || paths.length === 0) return null;
    let modified = new Set<string>();
    try {
      const changed = await s.journal.changedFiles(project.id, project.path);
      modified = new Set(changed.filter((c) => c.modifiedSinceNova).map((c) => key(c.path)));
    } catch (e) {
      log.warn('Geänderte Dateien nicht ermittelbar – kein Commit', { error: errorMessage(e) });
      return null;
    }
    const unique = [...new Map(paths.map((p) => [key(p), p.replace(/\\/g, '/')])).values()];
    const notModified = unique.filter((p) => !modified.has(key(p)));
    if (notModified.length < unique.length) log.info('Vom Benutzer geänderte Dateien werden nicht committet', { count: unique.length - notModified.length });
    let byCommand = new Set<string>();
    try {
      byCommand = commandDetectedKeys(project.id);
    } catch (e) {
      log.warn('Herkunft der Änderungen nicht ermittelbar – kein Commit', { error: errorMessage(e) });
      return null;
    }
    const certain = notModified.filter((p) => !byCommand.has(key(p)));
    if (certain.length < notModified.length) reportCommandFiles(project, taskId, notModified.filter((p) => byCommand.has(key(p))), context);
    const { ok, secret } = filterSecrets(project.path, certain);
    if (secret.length > 0) reportSecrets(project, taskId, secret, context);
    if (ok.length === 0) return null;
    try {
      return await s.git.commitPaths(project.path, ok, message);
    } catch (e) {
      log.warn('Git-Commit fehlgeschlagen', { projectId: project.id, error: errorMessage(e) });
      s.core.errors.report({
        code: 'GIT_ERROR',
        severity: 'warning',
        title: 'Git-Commit fehlgeschlagen',
        whatHappened: `NOVA konnte die Änderungen nicht committen (${context}): ${errorMessage(e)}`,
        projectId: project.id,
        taskId,
        attempted: [`Git-Commit (${context})`],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Die Dateien sind unverändert gespeichert. Bitte die Git-Meldung prüfen (z. B. einen Git-Hook) und bei Bedarf von Hand committen.',
        dedupeKey: `checkpoint-commit:${taskId ?? project.id}`,
      });
      return null;
    }
  }

  const service: CheckpointServiceImpl = {
    list(projectId) {
      return db
        .all<CheckpointRow>('SELECT * FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 500', [projectId])
        .map(toCheckpoint);
    },

    async create(input) {
      return insert({
        projectId: input.projectId,
        kind: input.kind,
        label: input.label,
        taskId: input.taskId ?? null,
        verification: input.verification,
        gitCommit: null,
      });
    },

    projectIdFor(input) {
      return resolveTarget(input).projectId;
    },

    async preview(input) {
      const target = resolveTarget(input);
      const project = s.projects.require(target.projectId);
      const r = await s.journal.revert({ projectId: project.id, projectRoot: project.path, afterId: target.afterId, taskId: target.taskId, dryRun: true });
      return { restored: r.restored, conflicts: r.conflicts, skipped: r.skipped, commit: null, checkpointId: null };
    },

    async restore(input) {
      const target = resolveTarget(input);
      const project = s.projects.require(target.projectId);
      ensureNoRunningTasks(project.id);
      return restoreMutex.run(project.id, async (): Promise<RestoreResult> => {
        ensureNoRunningTasks(project.id);
        const pre = await insert({ projectId: project.id, kind: 'pre_restore', label: `Vor Wiederherstellung: ${target.label}`, taskId: null, gitCommit: null });
        const r = await s.journal.revert({ projectId: project.id, projectRoot: project.path, afterId: target.afterId, taskId: target.taskId });
        let commit: string | null = null;
        if (input.commit && r.restored.length > 0) {
          commit = await commitFiltered(project, target.taskId ?? null, r.restored, `NOVA: Wiederherstellung ${target.label}`, 'Wiederherstellung');
        }
        if (target.checkpoint) {
          const restoredAt = s.core.clock.now();
          db.run('UPDATE checkpoints SET restored_at = ? WHERE id = ?', [restoredAt, target.checkpoint.id]);
          s.core.bus.emit('checkpoint.updated', { ...target.checkpoint, restoredAt });
        }
        if (r.conflicts.length > 0) {
          const shown = r.conflicts.slice(0, 10).map((c) => c.path).join(', ');
          s.core.errors.report({
            code: 'RESTORE_CONFLICT',
            severity: 'warning',
            title: 'Einige Dateien wurden nicht wiederhergestellt',
            whatHappened: `${r.conflicts.length === 1 ? 'Eine Datei wurde' : `${r.conflicts.length} Dateien wurden`} nach der Änderung durch NOVA verändert und deshalb nicht zurückgesetzt: ${shown}.`,
            projectId: project.id,
            taskId: target.taskId ?? null,
            attempted: [`Wiederherstellung (${target.label})`],
            projectSafe: true,
            autoFixable: false,
            userAction: 'Diese Dateien bei Bedarf von Hand prüfen. NOVA überschreibt keine fremden Änderungen.',
            dedupeKey: `restore-conflict:${project.id}`,
          });
        }
        log.info('Wiederherstellung durchgeführt', { projectId: project.id, restored: r.restored.length, conflicts: r.conflicts.length, skipped: r.skipped.length, commit });
        return { restored: r.restored, conflicts: r.conflicts, skipped: r.skipped, commit, checkpointId: pre.id };
      });
    },

    async afterTask(task: Task) {
      const project = s.projects.get(task.projectId);
      if (!project) return null;
      const marker = (MARKERS.has(task.verification?.status) ? task.verification.status : 'not_run') as NonNullable<Marker>;
      const agents = s.core.settings.section('agents');
      const allowed = project.config.autoCommit && (marker === 'passed' || (!agents.commitOnlyWhenVerified && marker !== 'failed'));
      let gitCommit: string | null = null;
      if (allowed && task.files.length > 0) {
        gitCommit = await commitFiltered(project, task.id, task.files, `NOVA: ${shorten(redactString(task.title), 200)}`, `Aufgabe „${shorten(task.title, 80)}“`);
      } else if (!allowed) {
        log.debug('Kein automatischer Commit', { taskId: task.id, autoCommit: project.config.autoCommit, verification: marker });
      }
      return insert({ projectId: project.id, kind: 'post_task', label: `Nach Aufgabe: ${task.title}`, taskId: task.id, verification: marker, gitCommit });
    },

    latestVerified(projectId) {
      const row = db.get<CheckpointRow>("SELECT * FROM checkpoints WHERE project_id = ? AND verification = 'passed' ORDER BY created_at DESC, rowid DESC LIMIT 1", [projectId]);
      return row ? toCheckpoint(row) : null;
    },

    prune(olderThanMs) {
      const rows = db.all<{ id: string; project_id: string; verification: string | null; created_at: number }>(
        'SELECT id, project_id, verification, created_at FROM checkpoints ORDER BY project_id, created_at DESC, rowid DESC',
      );
      const seen = new Map<string, number>();
      const verifiedKept = new Set<string>();
      const doomed: string[] = [];
      for (const r of rows) {
        const n = (seen.get(r.project_id) ?? 0) + 1;
        seen.set(r.project_id, n);
        const firstVerified = r.verification === 'passed' && !verifiedKept.has(r.project_id);
        if (firstVerified) verifiedKept.add(r.project_id);
        if (n <= KEEP_PER_PROJECT || firstVerified || Number(r.created_at) >= olderThanMs) continue;
        doomed.push(r.id);
      }
      if (doomed.length === 0) return 0;
      db.transaction(() => {
        for (const id of doomed) db.run('DELETE FROM checkpoints WHERE id = ?', [id]);
      });
      log.info('Alte Wiederherstellungspunkte gelöscht', { count: doomed.length });
      return doomed.length;
    },
  };
  return service;
}
