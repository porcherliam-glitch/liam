// Declarative field definitions for the settings page. Every field of src/shared/settings.ts that belongs to a
// settings section has a German label and a short help text here (models → Modelle page, budgets → Kosten page).
// Field paths are "section.key"; one UI section may combine fields of several settings sections.
import type { LucideIcon } from 'lucide-react';
import { Bell, Bot, Brain, Database, Gauge, Globe, Power, RefreshCw, Settings2, ShieldCheck, Stethoscope } from 'lucide-react';
import type { Settings, SettingsSection } from '@shared/settings';
import { isHttpUrl, numberToInput, parseNumber, type NumberRule } from './shared/forms';

export type FieldPath = `${SettingsSection}.${string}`;

interface BaseField {
  path: FieldPath;
  label: string;
  help: string;
  /** Disabled (greyed) while this switch field is off. */
  dependsOn?: FieldPath;
}
export interface SwitchField extends BaseField {
  kind: 'switch';
}
export interface NumberField extends BaseField {
  kind: 'number';
  rule: NumberRule;
  unit?: string;
  decimal?: boolean;
}
export interface TextField extends BaseField {
  kind: 'text';
  placeholder?: string;
  mono?: boolean;
  validate?: (value: string) => string | undefined;
}
export interface FolderField extends BaseField {
  kind: 'folder';
  placeholder: string;
}
export interface ListField extends BaseField {
  kind: 'list';
  /** Accessible name of one entry ("Befehl", "Adresse"). */
  itemLabel: string;
  placeholder: string;
  mono?: boolean;
  /** Blocking problem of an entry. */
  validateItem?: (value: string) => string | undefined;
  /** Non-blocking hint for an entry. */
  warnItem?: (value: string) => string | undefined;
}
export interface SelectField extends BaseField {
  kind: 'select';
  options: Array<{ value: string; label: string }>;
}
export type FieldDef = SwitchField | NumberField | TextField | FolderField | ListField | SelectField;

/** Draft value of a field: switches boolean, lists string[], everything else the text typed by the user. */
export type DraftValue = boolean | string | string[];

export type SectionId = 'general' | 'agents' | 'resources' | 'permissions' | 'network' | 'notifications' | 'backup' | 'background' | 'updates' | 'diagnostics' | 'memory';

export interface SectionDef {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  description: string;
  fields: FieldDef[];
}

/** Shell metacharacters that prevent automatic approval (settings.ts PermissionSettingsSchema). */
const SHELL_META = /[&|<>^%!();$`]/;
const HOST_PATTERN = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

export const NETWORK_LIMITS_TEXT =
  'Ist „Netzwerkzugriff für Agenten“ aus, fragt NOVA vor Befehlen mit bekanntem Netzwerkzugriff nach (z. B. npm install, curl, git clone). Programme und Tests, die selbst Verbindungen aufbauen, kann NOVA technisch nicht blockieren.';

export const SECTIONS: SectionDef[] = [
  {
    id: 'general',
    label: 'Allgemein',
    icon: Settings2,
    description: 'Grundeinstellungen von NOVA.',
    fields: [
      {
        path: 'general.projectsDir',
        kind: 'folder',
        label: 'Ordner für neue Projekte',
        help: 'Hier legt NOVA neue Projekte an. Leer = „NOVA Projekte“ im Benutzerordner (nicht „Dokumente“, weil dieser Ordner oft mit OneDrive synchronisiert wird).',
        placeholder: '%USERPROFILE%\\NOVA Projekte',
      },
    ],
  },
  {
    id: 'agents',
    label: 'Agenten',
    icon: Bot,
    description: 'Wie lange und wie oft Agenten an einer Aufgabe arbeiten, bevor sie Hilfe brauchen.',
    fields: [
      { path: 'agents.maxStepsPerRun', kind: 'number', label: 'Schritte pro Durchlauf (höchstens)', help: 'Nach so vielen Modell- und Werkzeugschritten stoppt ein Agent und meldet, dass er nicht weiterkommt (5 bis 500).', rule: { min: 5, max: 500, int: true } },
      { path: 'agents.maxAttempts', kind: 'number', label: 'Reparaturversuche pro Aufgabe', help: 'Wie oft NOVA eine Aufgabe nach fehlgeschlagenen Tests oder Prüfungen erneut versucht, wenn die Aufgabe nichts anderes festlegt (1 bis 10).', rule: { min: 1, max: 10, int: true } },
      { path: 'agents.maxIdenticalFailures', kind: 'number', label: 'Gleiche Fehler in Folge', help: 'Tritt derselbe Fehler so oft hintereinander auf, wechselt NOVA die Strategie oder hält die Aufgabe an (1 bis 5).', rule: { min: 1, max: 5, int: true } },
      { path: 'agents.modelTimeoutSec', kind: 'number', label: 'Zeitlimit für eine Modellantwort', unit: 'Sek.', help: 'Antwortet ein Modell nicht in dieser Zeit, wird der Aufruf abgebrochen und wiederholt (10 bis 3.600 Sekunden).', rule: { min: 10, max: 3600, int: true } },
      { path: 'agents.autoCommit', kind: 'switch', label: 'Änderungen automatisch in Git speichern', help: 'Voreinstellung für neue Projekte. In jedem Projekt lässt sich das einzeln ändern.' },
      { path: 'agents.commitOnlyWhenVerified', kind: 'switch', label: 'Nur geprüfte Änderungen speichern', help: 'NOVA legt einen Git-Commit nur an, wenn die passenden Tests und Prüfungen bestanden sind.' },
      { path: 'agents.autoCreatePlannedTasks', kind: 'switch', label: 'Geplante Aufgaben automatisch anlegen', help: 'Der Planer legt nach dem Planen die Folgeaufgaben selbst an. Aus = Vorschläge werden nur notiert.' },
    ],
  },
  {
    id: 'resources',
    label: 'Parallelität & Ressourcen',
    icon: Gauge,
    description: 'Wie viel NOVA gleichzeitig tut und wie viel Rechenleistung frei bleiben soll.',
    fields: [
      { path: 'agents.maxParallelAgents', kind: 'number', label: 'Agenten gleichzeitig (höchstens)', help: 'Obergrenze für parallel arbeitende Agenten. Bei knappen Ressourcen startet NOVA automatisch weniger (1 bis 8).', rule: { min: 1, max: 8, int: true } },
      { path: 'resources.adaptive', kind: 'switch', label: 'An die Auslastung anpassen', help: 'NOVA startet keine neuen Agenten, solange Prozessor, Arbeitsspeicher oder Grafikspeicher knapp sind.' },
      { path: 'resources.maxCpuPercent', kind: 'number', label: 'Prozessorlast (höchstens)', unit: '%', help: 'Darüber startet NOVA keine neuen Agenten (10 bis 100 %).', rule: { min: 10, max: 100 }, dependsOn: 'resources.adaptive' },
      { path: 'resources.minFreeRamMb', kind: 'number', label: 'Freier Arbeitsspeicher (mindestens)', unit: 'MB', help: 'Darunter startet NOVA keine neuen Agenten (ab 256 MB).', rule: { min: 256, max: 1_048_576, int: true }, dependsOn: 'resources.adaptive' },
      { path: 'resources.maxVramPercent', kind: 'number', label: 'Grafikspeicher-Belegung (höchstens)', unit: '%', help: 'Darüber lädt NOVA kein weiteres lokales Modell, sondern wartet oder nimmt ein Ersatzmodell (10 bis 100 %).', rule: { min: 10, max: 100 }, dependsOn: 'resources.adaptive' },
      { path: 'resources.maxProcesses', kind: 'number', label: 'Gleichzeitige Befehle (höchstens)', help: 'Befehle, Tests und Builds, die gleichzeitig laufen dürfen. Entwicklungsserver und Vorschauen zählen nicht mit (1 bis 32).', rule: { min: 1, max: 32, int: true } },
      { path: 'resources.commandTimeoutSec', kind: 'number', label: 'Zeitlimit für Agentenbefehle', unit: 'Sek.', help: 'Befehle, die länger laufen, werden beendet (5 bis 7.200 Sekunden).', rule: { min: 5, max: 7200, int: true } },
      { path: 'resources.sampleIntervalSec', kind: 'number', label: 'Messintervall', unit: 'Sek.', help: 'Wie oft NOVA Prozessor, Speicher und Grafikkarte misst (1 bis 60 Sekunden).', rule: { min: 1, max: 60, int: true } },
      { path: 'resources.minFreeDiskMb', kind: 'number', label: 'Freier Speicherplatz (mindestens)', unit: 'MB', help: 'Darunter schreibt NOVA keine Dateien mehr und startet keine Agenten, damit nichts beschädigt wird (ab 100 MB).', rule: { min: 100, max: 10_485_760, int: true } },
    ],
  },
  {
    id: 'permissions',
    label: 'Berechtigungen',
    icon: ShieldCheck,
    description: 'Was Agenten ohne Rückfrage dürfen.',
    fields: [
      {
        path: 'permissions.commandAllowlist',
        kind: 'list',
        label: 'Erlaubte Befehle (ohne Rückfrage, in allen Projekten)',
        help: 'Befehle, die mit einem dieser Einträge beginnen, laufen ohne Nachfrage. Allgemeine Programme wie „node“ oder „python“ fehlen absichtlich.',
        itemLabel: 'Befehl',
        placeholder: 'z. B. npm run test',
        mono: true,
        validateItem: (v) => (v.trim().length === 0 ? 'Bitte einen Befehl eingeben.' : v.length > 500 ? 'Der Befehl ist zu lang.' : undefined),
        warnItem: (v) => (SHELL_META.test(v) ? 'Enthält Sonderzeichen (& | < > ^ % ! ( ) ; $ `) – solche Befehle fragen trotzdem immer nach.' : undefined),
      },
      { path: 'permissions.approveUnknownCommands', kind: 'switch', label: 'Vor unbekannten Befehlen fragen', help: 'Befehle, die nicht erlaubt sind, brauchen eine Freigabe. Befehle mit Sonderzeichen fragen auch dann nach, wenn das aus ist.' },
      { path: 'permissions.approveDeletes', kind: 'switch', label: 'Vor dem Löschen von Dateien fragen', help: 'Agenten brauchen eine Freigabe, bevor sie Dateien löschen.' },
    ],
  },
  {
    id: 'network',
    label: 'Netzwerk',
    icon: Globe,
    description: 'Welche Verbindungen NOVA und die Agenten aufbauen dürfen.',
    fields: [
      { path: 'network.allowAgentNetwork', kind: 'switch', label: 'Netzwerkzugriff für Agenten', help: 'An = Befehle wie npm install laufen ohne Rückfrage. Aus = NOVA fragt vor bekannten Netzwerkbefehlen nach.' },
      {
        path: 'network.allowedHosts',
        kind: 'list',
        label: 'Erlaubte Adressen',
        help: 'Ziele, die NOVA selbst (Update-Prüfung, Projekt-Import) und Agentenbefehle ohne Rückfrage kontaktieren dürfen. „*.example.com“ erlaubt alle Unteradressen.',
        itemLabel: 'Adresse',
        placeholder: 'z. B. registry.npmjs.org',
        mono: true,
        validateItem: (v) => (HOST_PATTERN.test(v.trim()) ? undefined : 'Bitte nur einen Rechnernamen eingeben, z. B. github.com oder *.example.com (ohne https://).'),
      },
      { path: 'network.approveCloudProjectData', kind: 'switch', label: 'Vor dem Senden an Cloud-Modelle fragen', help: 'Projektinhalte gehen erst an Cloud-Anbieter, nachdem das für das jeweilige Projekt einmal freigegeben wurde.' },
    ],
  },
  {
    id: 'notifications',
    label: 'Benachrichtigungen',
    icon: Bell,
    description: 'Wann NOVA eine Windows-Benachrichtigung zeigt – auch wenn das Fenster geschlossen ist.',
    fields: [
      { path: 'notifications.enabled', kind: 'switch', label: 'Benachrichtigungen anzeigen', help: 'Aus = keine Windows-Benachrichtigungen. Der Verlauf in NOVA bleibt erhalten.' },
      { path: 'notifications.onTaskDone', kind: 'switch', label: 'Aufgabe erledigt', help: 'Wenn eine Aufgabe fertig und geprüft ist.', dependsOn: 'notifications.enabled' },
      { path: 'notifications.onError', kind: 'switch', label: 'Fehler', help: 'Bei Fehlern, die NOVA nicht selbst beheben kann.', dependsOn: 'notifications.enabled' },
      { path: 'notifications.onApproval', kind: 'switch', label: 'Freigabe nötig', help: 'Wenn ein Agent auf eine Freigabe wartet.', dependsOn: 'notifications.enabled' },
      { path: 'notifications.onBlocker', kind: 'switch', label: 'Aufgabe blockiert', help: 'Wenn eine Aufgabe nicht weiterkommt, zum Beispiel wegen einer Frage oder eines fehlenden Werkzeugs.', dependsOn: 'notifications.enabled' },
    ],
  },
  {
    id: 'backup',
    label: 'Speicher & Backups',
    icon: Database,
    description: 'Automatische Sicherungen, Wiederherstellungspunkte und Aufbewahrung.',
    fields: [
      { path: 'backup.dailyDatabaseBackup', kind: 'switch', label: 'Täglich sichern', help: 'Einmal am Tag eine Sicherung der NOVA-Datenbank (Projekte, Aufgaben, Einstellungen, Gedächtnis).' },
      { path: 'backup.checkpointBeforeTasks', kind: 'switch', label: 'Wiederherstellungspunkt vor jeder Aufgabe', help: 'Nötig, um die Änderungen einer Aufgabe später rückgängig zu machen.' },
      { path: 'backup.retentionCount', kind: 'number', label: 'Sicherungen behalten (höchstens)', help: 'Gilt für Datenbank-Sicherungen und für Projektkopien je Projekt (1 bis 200).', rule: { min: 1, max: 200, int: true } },
      { path: 'backup.retentionDays', kind: 'number', label: 'Sicherungen löschen nach', unit: 'Tagen', help: '0 = nie wegen des Alters löschen (bis 3.650 Tage).', rule: { min: 0, max: 3650, int: true } },
      { path: 'backup.snapshotRetentionDays', kind: 'number', label: 'Ältere Dateiversionen behalten', unit: 'Tage', help: 'Gespeicherte Dateistände, die zu keinem Wiederherstellungspunkt mehr gehören, werden danach gelöscht. 0 = für immer behalten.', rule: { min: 0, max: 3650, int: true } },
    ],
  },
  {
    id: 'background',
    label: 'Hintergrund & Autostart',
    icon: Power,
    description: 'Ob NOVA weiterarbeitet, wenn das Fenster geschlossen ist.',
    fields: [
      { path: 'background.keepRunningWhenUiClosed', kind: 'switch', label: 'Im Hintergrund weiterarbeiten', help: 'Der Hintergrunddienst arbeitet weiter, wenn das Fenster geschlossen wird. Aus = beim Beenden stoppt auch die Arbeit.' },
      { path: 'background.closeToTray', kind: 'switch', label: 'Beim Schließen in den Infobereich', help: 'Das X schließt nur das Fenster; NOVA bleibt unten rechts in der Taskleiste erreichbar.' },
      { path: 'background.resumeAfterRestart', kind: 'switch', label: 'Nach einem Neustart weitermachen', help: 'Unterbrochene Aufgaben, die sicher fortgesetzt werden können, laufen nach einem Neustart oder Absturz automatisch weiter.' },
    ],
  },
  {
    id: 'updates',
    label: 'Updates',
    icon: RefreshCw,
    description: 'Hinweise auf neue Versionen.',
    fields: [
      { path: 'updates.checkForUpdates', kind: 'switch', label: 'Täglich nach Updates suchen', help: 'NOVA zeigt einen Hinweis, wenn es eine neue Version gibt. Installiert wird nichts.' },
      {
        path: 'updates.feedUrl',
        kind: 'text',
        label: 'Update-Quelle',
        help: 'Adresse einer Update-Beschreibung (JSON). Leer = keine Update-Quelle eingerichtet.',
        placeholder: 'https://…',
        mono: true,
        validate: (v) => (v.trim() === '' || isHttpUrl(v) ? undefined : 'Bitte eine Adresse beginnend mit https:// eingeben oder das Feld leer lassen.'),
      },
    ],
  },
  {
    id: 'diagnostics',
    label: 'Diagnose',
    icon: Stethoscope,
    description: 'Protokolle und Verlauf – alles bleibt auf diesem PC.',
    fields: [
      {
        path: 'diagnostics.logLevel',
        kind: 'select',
        label: 'Ausführlichkeit der Protokolle',
        help: '„Info“ reicht fast immer. „Alles“ hilft bei der Fehlersuche, erzeugt aber viel mehr Einträge.',
        options: [
          { value: 'debug', label: 'Alles (Fehlersuche)' },
          { value: 'info', label: 'Info (empfohlen)' },
          { value: 'warn', label: 'Nur Warnungen und Fehler' },
          { value: 'error', label: 'Nur Fehler' },
        ],
      },
      { path: 'diagnostics.maxLogFileMb', kind: 'number', label: 'Größe einer Protokolldatei', unit: 'MB', decimal: true, help: 'Danach beginnt NOVA eine neue Datei (1 bis 100 MB).', rule: { min: 1, max: 100 } },
      { path: 'diagnostics.maxLogFiles', kind: 'number', label: 'Protokolldateien behalten', help: 'Ältere Dateien werden gelöscht (1 bis 50).', rule: { min: 1, max: 50, int: true } },
      { path: 'diagnostics.historyRetentionDays', kind: 'number', label: 'Verlauf behalten', unit: 'Tage', help: 'Agentenschritte, beendete Prozesse, alte Prüfungen, erledigte Fehler und Freigaben sowie gelesene Meldungen werden danach gelöscht. 0 = für immer behalten.', rule: { min: 0, max: 3650, int: true } },
      { path: 'diagnostics.includeSystemInfo', kind: 'switch', label: 'Systeminfos ins Diagnose-Paket', help: 'Windows-Version, Prozessor, Speicher und gefundene Werkzeuge. Das Paket wird nie automatisch verschickt.' },
    ],
  },
  {
    id: 'memory',
    label: 'Gedächtnis',
    icon: Brain,
    description: 'Was sich NOVA über Projekte merkt und projektübergreifend wiederverwendet.',
    fields: [
      { path: 'memory.enabled', kind: 'switch', label: 'Gedächtnis verwenden', help: 'Agenten bekommen passende Einträge aus dem Projektgedächtnis mit. Aus = vorhandene Einträge bleiben gespeichert, werden aber nicht verwendet.' },
      { path: 'memory.agentsMayWrite', kind: 'switch', label: 'Agenten dürfen Einträge anlegen', help: 'Agenten notieren Entscheidungen, Fehler und Erkenntnisse selbst.', dependsOn: 'memory.enabled' },
      { path: 'memory.useGlobalKnowledge', kind: 'switch', label: 'Wissensdatenbank verwenden', help: 'Teilbare Erkenntnisse aus der projektübergreifenden Wissensdatenbank helfen auch in anderen Projekten.', dependsOn: 'memory.enabled' },
      { path: 'memory.autoShareAgentInsights', kind: 'switch', label: 'Erkenntnisse von Agenten automatisch teilen', help: 'Aus = von Agenten notierte Erkenntnisse bleiben im Projekt, bis sie von Hand geteilt werden (empfohlen).', dependsOn: 'memory.enabled' },
      { path: 'memory.maxContextEntries', kind: 'number', label: 'Einträge pro Agentenauftrag (höchstens)', help: 'So viele Gedächtniseinträge bekommt ein Agent höchstens mit. Mehr = mehr Kontext, aber längere Anfragen (0 bis 50).', rule: { min: 0, max: 50, int: true }, dependsOn: 'memory.enabled' },
    ],
  },
];

export const SECTION_IDS = SECTIONS.map((s) => s.id);

export function sectionById(id: string | null | undefined): SectionDef {
  return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}

/** Value of "section.key" in a settings object. */
export function readSetting(settings: Settings, path: FieldPath): unknown {
  const [section, key] = path.split('.') as [SettingsSection, string];
  return (settings[section] as Record<string, unknown>)[key];
}

/** Settings value → draft value of the field. */
export function toDraftValue(field: FieldDef, raw: unknown): DraftValue {
  switch (field.kind) {
    case 'switch':
      return raw === true;
    case 'list':
      return Array.isArray(raw) ? raw.map(String) : [];
    case 'number':
      return numberToInput(typeof raw === 'number' ? raw : null);
    default:
      return raw == null ? '' : String(raw);
  }
}

/** Draft value → settings value, or a German error. */
export function fromDraftValue(field: FieldDef, value: DraftValue): { value: unknown; error?: undefined } | { value?: undefined; error: string } {
  switch (field.kind) {
    case 'switch':
      return { value: value === true };
    case 'number': {
      const r = parseNumber(String(value), field.rule);
      return r.error !== undefined ? { error: r.error } : { value: r.value };
    }
    case 'list': {
      const items = (value as string[]).map((v) => v.trim()).filter(Boolean);
      for (const item of items) {
        const e = field.validateItem?.(item);
        if (e) return { error: `„${item}“: ${e}` };
      }
      return { value: [...new Set(items)] };
    }
    case 'text': {
      const e = field.validate?.(String(value));
      return e ? { error: e } : { value: String(value).trim() };
    }
    default:
      return { value: String(value).trim() };
  }
}
