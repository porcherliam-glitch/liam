// Fatal error reports for Electron main (read when the daemon exits before answering /health).
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { DaemonCrashReportSchema, type DaemonCrashReport } from '@shared/schemas';
import { atomicWriteFile } from './fs-atomic';
import { redactString } from './redact';

export function writeCrashReport(path: string, report: DaemonCrashReport): void {
  try {
    atomicWriteFile(path, JSON.stringify({ ...report, details: report.details ? redactString(report.details).slice(0, 20000) : null }, null, 2));
  } catch {
    /* best effort – nothing else we can do while crashing */
  }
}

export function readCrashReport(path: string): DaemonCrashReport | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = DaemonCrashReportSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearCrashReport(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    /* not present */
  }
}
