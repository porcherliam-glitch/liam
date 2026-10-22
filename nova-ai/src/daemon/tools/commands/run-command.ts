// Agent tool run_command (coder, tester): runs ONE command line in the project folder (SPEC §4.3, §6.3).
// Order (binding): CommandPolicy.evaluate → block → error | approve → approvals.check (pending → approval_required,
// denied → acknowledgeDenial + German error, approved once → consume() BEFORE execution) → journal.scanState →
// processes.run (kind 'command', cwd = project root, the task's abort signal, timeout from the call or
// settings.resources.commandTimeoutSec) → journal.recordCommandChanges (always with the SAME scanState map, also after
// failures/timeouts) → exit code + output tail (≤ 8000 characters).
// Key decisions:
// - The policy is evaluated on every execution, so when a waiting approval resumes (the runner re-executes the stored
//   call) the stored command is re-evaluated against the current rules (SPEC §6.3).
// - Exit code 0 → status ok; non-zero → error COMMAND_FAILED, timeout → COMMAND_TIMEOUT, abort → CANCELLED – always
//   with the output, so the model can react. Output is redacted by ProcessManager and again by the ToolRegistry;
//   ANSI escape sequences are removed to save tokens.
// - The journal is honest: when the pre-command scan failed, the result says that changes are not recorded; command
//   changes without a "before" snapshot are reported as not revertible.
// Honest limit (SPEC §6.0.1): approvals cover recognised commands only; code inside the project runs with the
// user's rights.
import { z } from 'zod';
import type { ApprovalKind, ChangeRecord } from '@shared/schemas';
import type { AgentTool, CommandDecision, CommandResult, FileStateMap, Services } from '../../contracts';
import { errorMessage } from '../../core/errors';
import { redactString } from '../../core/redact';
import { stripAnsi } from '../../processes/output-tail';
import { abortedResult, approvalGate, formatDuration, oneLine, tailChars, toolError } from './common';

export const MAX_COMMAND_OUTPUT_CHARS = 8000;

const RunCommandSchema = z.object({
  command: z
    .string()
    .min(1)
    .max(8000)
    .describe(
      'One command line, executed in the project folder (cmd.exe on Windows, /bin/sh elsewhere). Prefer one simple command; chained or redirected lines (&&, |, >, ;) always need the user\'s approval.',
    ),
  timeoutSec: z.number().int().min(5).max(7200).optional().describe('Timeout in seconds (default: the NOVA setting, usually 600). The process tree is killed when it is exceeded.'),
});
export type RunCommandParams = z.output<typeof RunCommandSchema>;

export const APPROVAL_TITLES: Record<ApprovalKind, string> = {
  command: 'Befehl ausführen',
  admin: 'Befehl mit Administratorrechten',
  delete: 'Befehl löscht oder verwirft Daten',
  outside_project: 'Befehl schreibt außerhalb des Projektordners',
  system_change: 'Befehl ändert das System',
  security_config: 'Befehl ändert Sicherheitseinstellungen',
  publish: 'Befehl veröffentlicht oder überträgt Daten',
  sensitive_data: 'Befehl überträgt Projektdaten',
  paid_model: 'Befehl verursacht Kosten',
  install: 'Befehl installiert Software',
  network: 'Befehl mit Netzwerkzugriff',
};

const OP_LABELS: Record<ChangeRecord['op'], string> = { create: 'neu', modify: 'geändert', delete: 'gelöscht' };

function describeChanges(changes: ChangeRecord[]): string[] {
  if (changes.length === 0) return [];
  const byPath = new Map<string, ChangeRecord>();
  for (const c of changes) byPath.set(c.path, c);
  const list = [...byPath.values()];
  const shown = list.slice(0, 20).map((c) => `${c.path} (${OP_LABELS[c.op]})`);
  const more = list.length > 20 ? ` und ${list.length - 20} weitere` : '';
  const lines = [`Geänderte Dateien (${list.length}): ${shown.join(', ')}${more}`];
  const notRevertible = list.filter((c) => !c.revertible).length;
  if (notRevertible > 0) {
    lines.push(
      notRevertible === 1
        ? 'Hinweis: 1 Änderung durch den Befehl lässt sich nicht automatisch rückgängig machen (kein gesicherter vorheriger Inhalt).'
        : `Hinweis: ${notRevertible} Änderungen durch den Befehl lassen sich nicht automatisch rückgängig machen (kein gesicherter vorheriger Inhalt).`,
    );
  }
  return lines;
}

// cmd.exe's "unknown command" message (English, current and older German Windows). Exit code 9009 only reaches us when
// the unknown program is the last command of the line; inside npm scripts, `call`, `&&` chains or batch files the
// exit code is usually 1, so the message itself is recognised too.
const WINDOWS_NOT_FOUND =
  /is not recognized as an internal or external command|wird nicht als interner oder externer Befehl|ist entweder falsch geschrieben oder\s+konnte nicht gefunden werden/i;

/** German hint when the command (or a program it called) does not exist; null otherwise. */
export function notFoundHint(exitCode: number | null, output: string, platform: NodeJS.Platform): string | null {
  const missing = platform === 'win32' ? exitCode === 9009 || (exitCode !== 0 && WINDOWS_NOT_FOUND.test(output)) : exitCode === 127;
  if (!missing) return null;
  return 'Hinweis: Das Programm wurde nicht gefunden. Ist es installiert und über den PATH erreichbar? Gegebenenfalls einen anderen Befehl verwenden oder den Blocker melden.';
}

export function createRunCommandTool(s: Services): AgentTool<RunCommandParams> {
  return {
    name: 'run_command',
    description:
      'Run one command line in the project folder and return its exit code and output (last 8000 characters). Use it for builds, tests, linters, package scripts and inspections. Risky or unknown commands need the user\'s approval; blocked commands are never executed. Files changed by the command are recorded.',
    schema: RunCommandSchema,
    readOnly: false,
    describe: (p) => `Führt aus: ${oneLine(redactString(p.command), 120)}`,
    async execute(p, ctx) {
      const aborted = abortedResult(ctx);
      if (aborted) return aborted;
      const command = p.command.trim();
      if (!command) return { status: 'error', code: 'VALIDATION', content: 'Bitte einen Befehl angeben.' };
      const project = ctx.project;

      let decision: CommandDecision;
      try {
        decision = s.policy.evaluate({ projectId: project.id, projectRoot: project.path, command, config: project.config, taskId: ctx.task.id });
      } catch (e) {
        return toolError(e);
      }
      if (decision.action === 'block') {
        return {
          status: 'error',
          code: 'COMMAND_BLOCKED',
          content: `Befehl blockiert: ${decision.reason} NOVA führt diesen Befehl nicht aus – bitte einen anderen Weg wählen oder den Blocker im Abschlussbericht nennen.`,
        };
      }
      if (decision.action === 'approve') {
        let gate;
        try {
          gate = approvalGate(s, ctx, {
            kind: decision.kind,
            subject: decision.subject,
            title: `${APPROVAL_TITLES[decision.kind] ?? APPROVAL_TITLES.command}: ${oneLine(command, 100)}`,
            action: `Ein Agent möchte im Projekt „${project.name}“ diesen Befehl im Projektordner ausführen:\n${command}\n\nGrund für die Rückfrage: ${decision.reason}`,
            consequences: decision.consequences,
            details: { tool: 'run_command', command, reason: decision.reason, cwd: project.path },
          });
        } catch (e) {
          return toolError(e);
        }
        if (!gate.proceed) return gate.result;
      }

      const timeoutSec = p.timeoutSec ?? s.core.settings.get().resources.commandTimeoutSec;
      let before: FileStateMap | null = null;
      try {
        before = await s.journal.scanState(project.path);
      } catch (e) {
        ctx.log.warn('Projektzustand vor dem Befehl konnte nicht erfasst werden', { error: errorMessage(e) });
      }

      let result: CommandResult | null = null;
      let runError: unknown = null;
      try {
        result = await s.processes.run({
          command,
          cwd: project.path,
          projectId: project.id,
          taskId: ctx.task.id,
          kind: 'command',
          timeoutMs: timeoutSec * 1000,
          signal: ctx.signal,
        });
      } catch (e) {
        runError = e;
      }

      const notes: string[] = [];
      let changes: ChangeRecord[] = [];
      if (before) {
        try {
          changes = await s.journal.recordCommandChanges({ projectId: project.id, projectRoot: project.path, taskId: ctx.task.id, runId: ctx.runId, before });
        } catch (e) {
          ctx.log.warn('Dateiänderungen des Befehls konnten nicht protokolliert werden', { error: errorMessage(e) });
          notes.push('Hinweis: Die Dateiänderungen dieses Befehls konnten nicht protokolliert werden und lassen sich nicht über NOVA rückgängig machen.');
        }
      } else {
        notes.push('Hinweis: Der Projektzustand konnte vor dem Befehl nicht erfasst werden – Dateiänderungen durch diesen Befehl sind nicht protokolliert.');
      }

      if (runError || !result) {
        const err = toolError(runError);
        const content = [`$ ${command}`, err.content, ...describeChanges(changes), ...notes].join('\n');
        return err.status === 'error' ? { status: 'error', code: err.code, content } : err;
      }

      const filesChanged = [...new Set(changes.map((c) => c.path))];
      const header = [`$ ${command}`, `Exit-Code: ${result.exitCode ?? (result.signal ? `– (Signal ${result.signal})` : 'unbekannt')} · Dauer: ${formatDuration(result.durationMs)}`];
      if (result.timedOut) header.push(`Zeitlimit von ${timeoutSec} s überschritten – der Befehl und seine Unterprozesse wurden beendet.`);
      else if (result.cancelled) header.push('Abgebrochen – der Befehl und seine Unterprozesse wurden beendet.');
      const output = stripAnsi(result.output).replace(/\r\n/g, '\n').trimEnd();
      const hint = result.timedOut || result.cancelled ? null : notFoundHint(result.exitCode, output, s.core.platform);
      if (hint) header.push(hint);
      const body = output ? `Ausgabe:\n${tailChars(output, MAX_COMMAND_OUTPUT_CHARS)}` : 'Ausgabe: (keine)';
      const content = [...header, ...describeChanges(changes), ...notes, body].join('\n');
      const data = { exitCode: result.exitCode, timedOut: result.timedOut, cancelled: result.cancelled, durationMs: result.durationMs, processId: result.processId, filesChanged };

      if (result.cancelled) return { status: 'error', code: 'CANCELLED', content };
      if (result.timedOut) return { status: 'error', code: 'COMMAND_TIMEOUT', content };
      if (result.exitCode !== 0) return { status: 'error', code: 'COMMAND_FAILED', content };
      return { status: 'ok', content, data, filesChanged };
    },
  };
}
