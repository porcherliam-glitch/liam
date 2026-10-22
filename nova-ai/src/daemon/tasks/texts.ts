// Orchestrator – German user-facing texts (blocker explanations, user actions, notification bodies, idle reasons).
// Key decisions:
// - Notification bodies are generic: they never contain task titles, command lines, paths or file content (toasts
//   appear on the lock screen, SPEC §6.0.4). They name the project only.
// - Every resumable blocker code has a concrete user action that matches the UI navigation ("Modelle", "Kosten",
//   "Freigaben", "Werkzeuge").
import type { CheckKind } from '@shared/schemas';

export const CHECK_LABELS: Record<CheckKind, string> = {
  test: 'Tests',
  build: 'Build',
  lint: 'Lint',
  typecheck: 'Typprüfung',
  e2e: 'E2E-Tests',
  security: 'Sicherheitsprüfung',
  runtime: 'Laufzeitprüfung',
  package: 'Paket',
};

export const REVIEW_CHECK = 'Review';
/** Pseudo check of a coder task that changed no file (never counts as evidence). */
export const CHANGES_CHECK = 'Änderungen';
export const INTEGRATION_BUILD = 'Integration: Build';
export const INTEGRATION_TESTS = 'Integration: Tests';
export const INTERRUPTED_AFTER_RESTART = 'Nach Neustart unterbrochen – bitte prüfen';

/** "1 Aufgabe wartet" / "3 Aufgaben warten". */
export function countTasks(n: number, verbSingular: string, verbPlural: string): string {
  return n === 1 ? `1 Aufgabe ${verbSingular}` : `${n} Aufgaben ${verbPlural}`;
}

export function shorten(text: string, max: number): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…` : t;
}

/** Short, generic reason for notifications (no task-specific content). */
export function blockerShortReason(code: string | null): string {
  switch (code) {
    case 'NO_MODEL':
      return 'Es ist kein passendes Modell verfügbar.';
    case 'MODEL_UNAVAILABLE':
      return 'Das gewählte Modell ist nicht verfügbar.';
    case 'OLLAMA_UNREACHABLE':
      return 'Ollama ist nicht erreichbar.';
    case 'VRAM_INSUFFICIENT':
      return 'Der Grafikspeicher reicht für das Modell nicht aus.';
    case 'BUDGET_EXCEEDED':
      return 'Das Kostenbudget ist erreicht.';
    case 'PAID_NOT_APPROVED':
      return 'Der kostenpflichtige Anbieter ist nicht freigegeben.';
    case 'PRICE_UNKNOWN':
      return 'Für das Modell ist kein Preis hinterlegt.';
    case 'RESOURCE_LIMIT':
      return 'Ein Ressourcenlimit ist erreicht.';
    case 'DISK_FULL':
      return 'Es ist zu wenig freier Speicherplatz vorhanden.';
    case 'TOOL_MISSING':
      return 'Ein benötigtes Werkzeug fehlt.';
    case 'NEEDS_INPUT':
      return 'Der Agent hat eine Rückfrage.';
    case 'DEPENDENCY_FAILED':
      return 'Eine Vorgängeraufgabe ist fehlgeschlagen.';
    case 'APPROVAL_REQUIRED':
      return 'Eine Freigabe ist nötig.';
    case 'AGENT_BLOCKED':
      return 'Der Agent kommt ohne Hilfe nicht weiter.';
    case 'AGENT_STEP_LIMIT':
      return 'Die maximale Anzahl an Arbeitsschritten wurde erreicht.';
    case 'REPEATED_FAILURE':
      return 'Derselbe Fehler ist wiederholt aufgetreten.';
    case 'APPROVAL_DENIED':
      return 'Eine nötige Freigabe wurde abgelehnt.';
    case 'COMMAND_BLOCKED':
      return 'Ein nötiger Befehl ist durch die Sicherheitsregeln gesperrt.';
    case 'FILE_IN_USE':
      return 'Das Projekt ist in einem anderen Programm geöffnet.';
    case 'NOT_FOUND':
      return 'Der Projektordner wurde nicht gefunden.';
    default:
      return 'Die Aufgabe kann im Moment nicht fortgesetzt werden.';
  }
}

/** What the user can do about a blocker (error report userAction). */
export function blockerUserAction(code: string | null): string {
  switch (code) {
    case 'NO_MODEL':
      return "Bitte unter „Modelle“ ein Modell auswählen oder Ollama starten. Die Aufgabe läuft danach automatisch weiter.";
    case 'MODEL_UNAVAILABLE':
      return "Bitte das Modell unter „Modelle“ herunterladen oder ein anderes auswählen. Die Aufgabe läuft danach automatisch weiter.";
    case 'OLLAMA_UNREACHABLE':
      return 'Bitte Ollama starten. Die Aufgabe läuft danach automatisch weiter.';
    case 'VRAM_INSUFFICIENT':
      return "Bitte unter „Modelle“ ein kleineres Modell auswählen oder andere Programme mit hoher Grafiklast schließen.";
    case 'BUDGET_EXCEEDED':
      return "Bitte das Budget unter „Kosten“ prüfen und kostenpflichtige Arbeit bei Bedarf wieder freigeben oder ein lokales Modell verwenden.";
    case 'PAID_NOT_APPROVED':
      return "Bitte den kostenpflichtigen Anbieter unter „Modelle“ ausdrücklich freigeben oder ein lokales Modell verwenden.";
    case 'PRICE_UNKNOWN':
      return "Bitte den Preis des Modells unter „Modelle“ eintragen oder ein anderes Modell verwenden.";
    case 'RESOURCE_LIMIT':
      return 'Bitte andere Programme schließen oder die Ressourcenlimits in den Einstellungen anpassen. Die Aufgabe läuft danach automatisch weiter.';
    case 'DISK_FULL':
      return 'Bitte Speicherplatz freigeben. Die Aufgabe läuft danach automatisch weiter.';
    case 'TOOL_MISSING':
      return "Bitte das fehlende Werkzeug unter „Werkzeuge“ installieren oder den Pfad eintragen.";
    case 'APPROVAL_REQUIRED':
      return "Bitte die offene Freigabe unter „Freigaben“ prüfen.";
    case 'NEEDS_INPUT':
      return 'Bitte die Rückfrage des Agenten in der Aufgabe beantworten.';
    case 'DEPENDENCY_FAILED':
      return 'Bitte zuerst die fehlgeschlagene Vorgängeraufgabe reparieren oder wiederholen.';
    case 'AGENT_BLOCKED':
      return 'Bitte die Erklärung des Agenten lesen, die Aufgabe anpassen oder einen Hinweis geben und die Aufgabe erneut starten.';
    case 'AGENT_STEP_LIMIT':
      return 'Mit „Starten“ arbeitet der Agent mit neuen Schritten am bisherigen Stand weiter, mit „Wiederholen“ beginnt er von vorn. Ist die Aufgabe sehr groß, hilft es, sie in kleinere Aufgaben aufzuteilen.';
    default:
      return 'Bitte die Details prüfen und die Aufgabe erneut starten.';
  }
}

export function blockerTitle(code: string | null): string {
  switch (code) {
    case 'REPEATED_FAILURE':
      return 'Wiederholter Fehler – Aufgabe angehalten';
    case 'AGENT_BLOCKED':
      return 'Agent kommt nicht weiter';
    case 'AGENT_STEP_LIMIT':
      return 'Schrittlimit erreicht';
    case 'NO_MODEL':
    case 'MODEL_UNAVAILABLE':
    case 'OLLAMA_UNREACHABLE':
    case 'VRAM_INSUFFICIENT':
      return 'Kein nutzbares Modell';
    case 'BUDGET_EXCEEDED':
    case 'PAID_NOT_APPROVED':
    case 'PRICE_UNKNOWN':
      return 'Kostenpflichtiges Modell nicht nutzbar';
    case 'TOOL_MISSING':
      return 'Werkzeug fehlt';
    case 'APPROVAL_DENIED':
    case 'COMMAND_BLOCKED':
    case 'FILE_IN_USE':
    case 'NOT_FOUND':
      return 'Prüfung konnte nicht laufen';
    default:
      return 'Aufgabe blockiert';
  }
}

export function verificationLabel(status: string): string {
  switch (status) {
    case 'passed':
      return 'geprüft, alle Prüfungen bestanden';
    case 'failed':
      return 'Prüfung fehlgeschlagen';
    case 'unavailable':
      return 'nicht automatisch geprüft (keine echte Prüfung hat das Ergebnis bestätigt)';
    default:
      return 'noch nicht geprüft';
  }
}

export function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return new Date(ts).toISOString();
  }
}
