// Orchestrator – German idle reasons for work.status (SPEC §4.5.11, §6.5 "Idle").
// Key decisions:
// - Pure function over counts, so the precedence is testable: deliberate states first (work paused/stopped), then what
//   prevents ready tasks from starting (project state, resources, all slots busy), then what the user must do
//   (approvals, answers, models), then waiting states (dependencies, paused, interrupted).
// - Never suggests creating work; suggestions are computed separately from memory next_step entries.
import type { WorkCycleState } from '@shared/schemas';
import { countTasks } from './texts';

export interface IdleInput {
  globalState: WorkCycleState;
  /** null = global aggregate over all projects. */
  projectState: WorkCycleState | null;
  /** Active runs in the scope. */
  activeRuns: number;
  /** queued + paused + waiting_approval + blocked + interrupted (+ running). */
  open: number;
  /** Ready queued tasks the scheduler may start (project running or startRequested). */
  eligibleReady: number;
  /** Ready queued tasks that do not start because of the project work state. */
  ineligibleReady: number;
  /** Queued tasks whose dependencies are not done yet. */
  notReadyQueued: number;
  waiting: number;
  blockedByCode: Record<string, number>;
  paused: number;
  interrupted: number;
  /** No free agent slot right now; reason = governor explanation (resources) or null (configured limit). */
  noFreeSlot: boolean;
  resourceReason: string | null;
}

const MODEL_CODES = ['NO_MODEL', 'MODEL_UNAVAILABLE', 'OLLAMA_UNREACHABLE', 'VRAM_INSUFFICIENT'];
const PAID_CODES = ['BUDGET_EXCEEDED', 'PAID_NOT_APPROVED', 'PRICE_UNKNOWN'];

function sumCodes(byCode: Record<string, number>, codes: string[]): number {
  return codes.reduce((n, c) => n + (byCode[c] ?? 0), 0);
}

export function resourceText(reason: string): string {
  const r = reason.trim();
  return /^ressourcenlimit/i.test(r) ? r : `Ressourcenlimit: ${r}`;
}

export function idleReason(c: IdleInput): string | null {
  if (c.activeRuns > 0) return null;
  if (c.globalState === 'paused') return 'Arbeit pausiert';
  if (c.globalState === 'stopped') return 'Arbeit gestoppt';
  if (c.open === 0) return 'Keine offenen Aufgaben';

  if (c.ineligibleReady > 0 && c.eligibleReady === 0) {
    if (c.projectState === 'paused') return 'Arbeit an diesem Projekt pausiert';
    if (c.projectState === 'stopped') return 'Autonome Arbeit ist für dieses Projekt ausgeschaltet';
    if (c.projectState === null) return 'Autonome Arbeit ist für die Projekte mit offenen Aufgaben ausgeschaltet oder pausiert';
  }
  if (c.eligibleReady > 0 && c.noFreeSlot) {
    return c.resourceReason ? resourceText(c.resourceReason) : 'Alle Agentenplätze sind belegt';
  }
  if (c.waiting > 0) return countTasks(c.waiting, 'wartet auf Freigabe', 'warten auf Freigabe');
  const needsInput = c.blockedByCode.NEEDS_INPUT ?? 0;
  if (needsInput > 0) return countTasks(needsInput, 'wartet auf eine Antwort', 'warten auf eine Antwort');
  if (sumCodes(c.blockedByCode, MODEL_CODES) > 0) return "Kein Modell verfügbar – bitte in 'Modelle' eines auswählen";
  if (sumCodes(c.blockedByCode, PAID_CODES) > 0) return "Kostenpflichtiges Modell nicht nutzbar – bitte 'Kosten' und 'Modelle' prüfen";
  if ((c.blockedByCode.RESOURCE_LIMIT ?? 0) > 0) return 'Ressourcenlimit erreicht – Aufgaben warten auf freie Ressourcen';
  if ((c.blockedByCode.DISK_FULL ?? 0) > 0) return 'Zu wenig freier Speicherplatz';
  if ((c.blockedByCode.TOOL_MISSING ?? 0) > 0) return "Ein benötigtes Werkzeug fehlt – bitte unter 'Werkzeuge' installieren";
  const blocked = Object.values(c.blockedByCode).reduce((a, b) => a + b, 0);
  if (blocked > 0) return countTasks(blocked, 'ist blockiert', 'sind blockiert');
  if (c.notReadyQueued > 0) return countTasks(c.notReadyQueued, 'wartet auf Vorgängeraufgaben', 'warten auf Vorgängeraufgaben');
  if (c.paused > 0) return countTasks(c.paused, 'ist pausiert', 'sind pausiert');
  if (c.interrupted > 0) return countTasks(c.interrupted, 'wurde unterbrochen – bitte fortsetzen', 'wurden unterbrochen – bitte fortsetzen');
  return 'Keine ausführbaren Aufgaben';
}
