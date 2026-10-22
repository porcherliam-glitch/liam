// German labels, tones and icons for every enum of the shared data model (UI-SPEC §3).
// Status is ALWAYS shown as color + icon + text – use <Badge>/<StatusBadge> with these entries.
// Maps are typed `Record<Enum, EnumMeta>`, so TypeScript reports a missing entry when an enum grows.
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Archive,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgeCheck,
  Ban,
  BookOpen,
  Box,
  Brain,
  Bug,
  ChevronsUp,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  CirclePause,
  CirclePlay,
  CircleSlash,
  CircleX,
  ClipboardList,
  Clock,
  Cloud,
  Code,
  Coins,
  Cog,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCode,
  FileMinus,
  FilePen,
  FilePlus,
  FlaskConical,
  Folder,
  FolderOpen,
  Gamepad2,
  GitBranch,
  Globe,
  Hammer,
  Hourglass,
  Info,
  KeyRound,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Lock,
  MessageSquare,
  Minus,
  Monitor,
  OctagonAlert,
  Package,
  Pause,
  Play,
  Plug,
  PowerOff,
  RefreshCw,
  Repeat,
  RotateCcw,
  Save,
  Scale,
  Server,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShieldX,
  Siren,
  Sparkles,
  Square,
  SquareTerminal,
  StickyNote,
  Target,
  Terminal,
  Trash2,
  TriangleAlert,
  Unplug,
  Upload,
  UserRound,
  WifiOff,
  Workflow,
  Wrench,
} from 'lucide-react';
import type {
  AgentRole,
  AgentRunStatus,
  AgentStepKind,
  ApprovalKind,
  ApprovalScope,
  ApprovalStatus,
  BackupInfo,
  ChangeOp,
  CheckKind,
  CheckpointKind,
  CheckStatus,
  DaemonStatus,
  ExportSection,
  GpuInfo,
  IntegrationId,
  IntegrationStatus,
  LogLevel,
  MemoryEntry,
  MemoryKind,
  ModelCapability,
  Notification,
  OllamaPull,
  PreviewKind,
  PreviewStatus,
  ProcessInfo,
  ProcessKind,
  ProjectKind,
  ProjectStatus,
  ProviderHealth,
  ProviderType,
  Task,
  TaskKind,
  TaskStatus,
  Verification,
  WorkCycleState,
} from '@shared/schemas';
import type { ErrorSeverity } from '@shared/errors';
import type { DaemonConnectionState, DaemonConnectionStateName } from '@shared/bridge';

/** Semantic color of a status. Map to classes with `toneClasses`. */
export type Tone = 'neutral' | 'violet' | 'blue' | 'success' | 'warning' | 'danger' | 'info';

export interface EnumMeta {
  /** German display text. */
  label: string;
  tone: Tone;
  icon: LucideIcon;
  /** Optional German explanation (tooltips, help texts). */
  description?: string;
  /** Icon should spin (in-progress states). */
  spin?: boolean;
}

/** Tailwind classes per tone. `soft` = tinted background for badges, `solid` = filled. */
export const toneClasses: Record<Tone, { text: string; soft: string; border: string; dot: string; solid: string; bar: string }> = {
  neutral: { text: 'text-muted', soft: 'bg-surface-2 text-muted', border: 'border-border', dot: 'bg-muted', solid: 'bg-surface-3 text-text', bar: 'bg-muted' },
  violet: { text: 'text-violet-fg', soft: 'bg-violet/15 text-violet-fg', border: 'border-violet/40', dot: 'bg-violet', solid: 'bg-violet text-white', bar: 'bg-violet' },
  blue: { text: 'text-blue-fg', soft: 'bg-blue/15 text-blue-fg', border: 'border-blue/40', dot: 'bg-blue', solid: 'bg-blue text-white', bar: 'bg-blue' },
  success: { text: 'text-success-fg', soft: 'bg-success/15 text-success-fg', border: 'border-success/40', dot: 'bg-success', solid: 'bg-success text-black', bar: 'bg-success' },
  warning: { text: 'text-warning-fg', soft: 'bg-warning/15 text-warning-fg', border: 'border-warning/40', dot: 'bg-warning', solid: 'bg-warning text-black', bar: 'bg-warning' },
  danger: { text: 'text-danger-fg', soft: 'bg-danger/15 text-danger-fg', border: 'border-danger/40', dot: 'bg-danger', solid: 'bg-danger text-white', bar: 'bg-danger' },
  info: { text: 'text-info-fg', soft: 'bg-info/15 text-info-fg', border: 'border-info/40', dot: 'bg-info', solid: 'bg-info text-black', bar: 'bg-info' },
};

/** Safe lookup: unknown values (e.g. a newer daemon) fall back to a neutral entry with the raw value. */
export function metaOf<K extends string | number>(map: Record<K, EnumMeta>, key: K | null | undefined): EnumMeta {
  if (key == null) return { label: '–', tone: 'neutral', icon: CircleHelp };
  return map[key] ?? { label: String(key), tone: 'neutral', icon: CircleHelp };
}

/** Label only (same fallback as metaOf). */
export function labelOf<K extends string | number>(map: Record<K, EnumMeta>, key: K | null | undefined): string {
  return metaOf(map, key).label;
}

// ---------------------------------------------------------------------------
// Tasks, agents, work
// ---------------------------------------------------------------------------

export const TASK_STATUS: Record<TaskStatus, EnumMeta> = {
  queued: { label: 'Wartet', tone: 'neutral', icon: Clock, description: 'Wartet darauf, bearbeitet zu werden.' },
  running: { label: 'Läuft', tone: 'blue', icon: LoaderCircle, spin: true, description: 'Ein Agent arbeitet gerade daran.' },
  paused: { label: 'Pausiert', tone: 'neutral', icon: CirclePause, description: 'Angehalten – der Stand bleibt erhalten.' },
  waiting_approval: { label: 'Wartet auf Freigabe', tone: 'warning', icon: ShieldQuestion, description: 'NOVA wartet auf eine Entscheidung.' },
  blocked: { label: 'Blockiert', tone: 'danger', icon: Ban, description: 'Kann gerade nicht weitermachen – siehe Grund.' },
  done: { label: 'Erledigt', tone: 'success', icon: CircleCheck, description: 'Fertig bearbeitet.' },
  failed: { label: 'Fehlgeschlagen', tone: 'danger', icon: CircleX, description: 'Konnte nicht erfolgreich abgeschlossen werden.' },
  cancelled: { label: 'Abgebrochen', tone: 'neutral', icon: CircleSlash, description: 'Wurde gestoppt.' },
  interrupted: { label: 'Unterbrochen', tone: 'warning', icon: Unplug, description: 'Der Hintergrunddienst wurde während der Arbeit beendet.' },
};

export const AGENT_RUN_STATUS: Record<AgentRunStatus, EnumMeta> = {
  running: { label: 'Arbeitet', tone: 'blue', icon: LoaderCircle, spin: true },
  paused: { label: 'Pausiert', tone: 'neutral', icon: CirclePause },
  waiting_approval: { label: 'Wartet auf Freigabe', tone: 'warning', icon: ShieldQuestion },
  blocked: { label: 'Blockiert', tone: 'danger', icon: Ban },
  done: { label: 'Fertig', tone: 'success', icon: CircleCheck },
  failed: { label: 'Fehlgeschlagen', tone: 'danger', icon: CircleX },
  cancelled: { label: 'Abgebrochen', tone: 'neutral', icon: CircleSlash },
  interrupted: { label: 'Unterbrochen', tone: 'warning', icon: Unplug },
};

export const AGENT_ROLE: Record<AgentRole, EnumMeta> = {
  planner: { label: 'Planer', tone: 'violet', icon: Workflow, description: 'Zerlegt Ziele in Aufgaben und plant die Reihenfolge.' },
  coder: { label: 'Programmierer', tone: 'blue', icon: Code, description: 'Schreibt und ändert den Code.' },
  tester: { label: 'Tester', tone: 'info', icon: FlaskConical, description: 'Führt Tests aus und behebt Fehler.' },
  reviewer: { label: 'Prüfer', tone: 'success', icon: Eye, description: 'Prüft Änderungen auf Qualität und Risiken.' },
};

export const TASK_KIND: Record<TaskKind, EnumMeta> = {
  plan: { label: 'Planung', tone: 'violet', icon: Workflow },
  code: { label: 'Programmierung', tone: 'blue', icon: Code },
  test: { label: 'Test', tone: 'info', icon: FlaskConical },
  fix: { label: 'Fehlerbehebung', tone: 'warning', icon: Wrench },
  review: { label: 'Code-Prüfung', tone: 'success', icon: Eye },
  build: { label: 'Build', tone: 'neutral', icon: Hammer },
  custom: { label: 'Sonstiges', tone: 'neutral', icon: ClipboardList },
};

export const TASK_SOURCE: Record<Task['source'], EnumMeta> = {
  user: { label: 'Manuell', tone: 'neutral', icon: UserRound },
  planner: { label: 'Vom Planer', tone: 'violet', icon: Workflow },
  system: { label: 'Vom System', tone: 'neutral', icon: Cog },
};

/** Task priority 0..3. */
export const PRIORITY: Record<0 | 1 | 2 | 3, EnumMeta> = {
  0: { label: 'Niedrig', tone: 'neutral', icon: ArrowDown },
  1: { label: 'Normal', tone: 'blue', icon: Minus },
  2: { label: 'Hoch', tone: 'warning', icon: ArrowUp },
  3: { label: 'Kritisch', tone: 'danger', icon: ChevronsUp },
};
export const PRIORITY_VALUES = [3, 2, 1, 0] as const;

export const WORK_STATE: Record<WorkCycleState, EnumMeta> = {
  running: { label: 'Arbeitet', tone: 'success', icon: Play, description: 'NOVA arbeitet selbstständig an den Aufgaben.' },
  paused: { label: 'Pausiert', tone: 'warning', icon: Pause, description: 'Die Arbeit ist angehalten und kann fortgesetzt werden.' },
  stopped: { label: 'Gestoppt', tone: 'neutral', icon: Square, description: 'Es werden keine neuen Aufgaben gestartet.' },
};

export const AGENT_STEP_KIND: Record<AgentStepKind, EnumMeta> = {
  status: { label: 'Status', tone: 'neutral', icon: Info },
  thought: { label: 'Überlegung', tone: 'violet', icon: Brain },
  model_call: { label: 'Modellaufruf', tone: 'violet', icon: Sparkles },
  tool_call: { label: 'Werkzeug', tone: 'blue', icon: Wrench },
  tool_result: { label: 'Ergebnis', tone: 'neutral', icon: ArrowRight },
  message: { label: 'Nachricht', tone: 'info', icon: MessageSquare },
  error: { label: 'Fehler', tone: 'danger', icon: CircleAlert },
  approval: { label: 'Freigabe', tone: 'warning', icon: ShieldQuestion },
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const PROJECT_KIND: Record<ProjectKind, EnumMeta> = {
  web: { label: 'Web-Anwendung', tone: 'blue', icon: Globe },
  unity: { label: 'Unity-Projekt', tone: 'violet', icon: Gamepad2 },
  desktop: { label: 'Desktop-Anwendung', tone: 'info', icon: Monitor },
  backend: { label: 'Backend / API', tone: 'success', icon: Server },
  godot: { label: 'Godot-Projekt', tone: 'violet', icon: Gamepad2 },
  unreal: { label: 'Unreal-Projekt', tone: 'violet', icon: Gamepad2 },
  generic: { label: 'Allgemeines Projekt', tone: 'neutral', icon: Folder },
};

export const PROJECT_STATUS: Record<ProjectStatus, EnumMeta> = {
  active: { label: 'Aktiv', tone: 'success', icon: CirclePlay },
  paused: { label: 'Pausiert', tone: 'warning', icon: CirclePause },
  archived: { label: 'Archiviert', tone: 'neutral', icon: Archive },
};

export const PREVIEW_KIND: Record<PreviewKind, EnumMeta> = {
  'browser-dev-server': { label: 'Browser (Entwicklungsserver)', tone: 'blue', icon: Globe },
  'browser-static': { label: 'Browser (statische Seite)', tone: 'blue', icon: Globe },
  'desktop-run': { label: 'Programm starten', tone: 'info', icon: Monitor },
  'engine-external': { label: 'In der Engine öffnen', tone: 'violet', icon: Gamepad2 },
  none: { label: 'Keine Vorschau', tone: 'neutral', icon: EyeOff },
};

export const PREVIEW_STATE: Record<PreviewStatus['state'], EnumMeta> = {
  stopped: { label: 'Gestoppt', tone: 'neutral', icon: Square },
  starting: { label: 'Startet', tone: 'blue', icon: LoaderCircle, spin: true },
  running: { label: 'Läuft', tone: 'success', icon: Play },
  failed: { label: 'Fehlgeschlagen', tone: 'danger', icon: CircleX },
  unsupported: { label: 'Nicht unterstützt', tone: 'neutral', icon: EyeOff },
};

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const APPROVAL_KIND: Record<ApprovalKind, EnumMeta> = {
  command: { label: 'Befehl ausführen', tone: 'warning', icon: Terminal, description: 'Ein Befehl, der nicht auf der Liste der erlaubten Befehle steht.' },
  admin: { label: 'Administratorrechte', tone: 'danger', icon: ShieldAlert, description: 'Die Aktion braucht Administratorrechte.' },
  delete: { label: 'Löschen', tone: 'danger', icon: Trash2, description: 'Dateien oder Ordner sollen gelöscht werden.' },
  outside_project: { label: 'Zugriff außerhalb des Projekts', tone: 'warning', icon: FolderOpen, description: 'Zugriff auf Dateien außerhalb des Projektordners.' },
  system_change: { label: 'Systemänderung', tone: 'danger', icon: Cog, description: 'Eine systemweite Änderung (z. B. PATH, Registrierung, globale Installation).' },
  security_config: { label: 'Sicherheitseinstellung', tone: 'danger', icon: Lock, description: 'Änderung an sicherheitsrelevanten Einstellungen.' },
  publish: { label: 'Veröffentlichen', tone: 'warning', icon: Upload, description: 'Daten werden veröffentlicht oder übertragen (z. B. git push).' },
  sensitive_data: { label: 'Sensible Daten senden', tone: 'danger', icon: KeyRound, description: 'Projektinhalte sollen an einen Cloud-Anbieter gesendet werden.' },
  paid_model: { label: 'Kostenpflichtiges Modell', tone: 'warning', icon: Coins, description: 'Ein kostenpflichtiges Modell soll genutzt oder das Budget überschritten werden.' },
  install: { label: 'Programm installieren', tone: 'warning', icon: Download, description: 'Ein Werkzeug soll installiert werden.' },
  network: { label: 'Netzwerkzugriff', tone: 'warning', icon: Globe, description: 'Zugriff auf eine nicht freigegebene Internetadresse.' },
};

export const APPROVAL_STATUS: Record<ApprovalStatus, EnumMeta> = {
  pending: { label: 'Offen', tone: 'warning', icon: Hourglass },
  approved: { label: 'Erlaubt', tone: 'success', icon: CircleCheck },
  denied: { label: 'Abgelehnt', tone: 'danger', icon: CircleX },
  expired: { label: 'Abgelaufen', tone: 'neutral', icon: Clock },
};

export const APPROVAL_SCOPE: Record<ApprovalScope, EnumMeta> = {
  once: { label: 'Einmal', tone: 'neutral', icon: CircleCheck },
  always: { label: 'Immer', tone: 'violet', icon: Repeat },
};

// ---------------------------------------------------------------------------
// Errors, checks, verification
// ---------------------------------------------------------------------------

export const ERROR_SEVERITY: Record<ErrorSeverity, EnumMeta> = {
  warning: { label: 'Warnung', tone: 'warning', icon: TriangleAlert, description: 'Etwas stimmt nicht ganz, die Arbeit läuft aber weiter.' },
  retryable: { label: 'Wiederholbarer Fehler', tone: 'info', icon: RefreshCw, description: 'NOVA versucht es automatisch noch einmal.' },
  blocker: { label: 'Blocker', tone: 'danger', icon: OctagonAlert, description: 'Die betroffene Aufgabe ist angehalten, bis sich etwas ändert.' },
  critical: { label: 'Kritisch', tone: 'danger', icon: Siren, description: 'Daten oder Sicherheit sind gefährdet – die Arbeit ist gestoppt.' },
};

export const CHECK_STATUS: Record<CheckStatus, EnumMeta> = {
  passed: { label: 'Bestanden', tone: 'success', icon: CircleCheck },
  failed: { label: 'Fehlgeschlagen', tone: 'danger', icon: CircleX },
  error: { label: 'Konnte nicht laufen', tone: 'danger', icon: CircleAlert },
  not_run: { label: 'Nicht ausgeführt', tone: 'neutral', icon: CircleDashed },
  running: { label: 'Läuft', tone: 'blue', icon: LoaderCircle, spin: true },
  skipped: { label: 'Übersprungen', tone: 'neutral', icon: CircleSlash },
};

export const CHECK_KIND: Record<CheckKind, EnumMeta> = {
  test: { label: 'Tests', tone: 'info', icon: FlaskConical },
  build: { label: 'Build', tone: 'blue', icon: Hammer },
  lint: { label: 'Code-Stil', tone: 'violet', icon: ListChecks },
  typecheck: { label: 'Typprüfung', tone: 'violet', icon: BadgeCheck },
  runtime: { label: 'Laufzeitprüfung', tone: 'info', icon: Activity },
};

export const VERIFICATION_STATUS: Record<Verification['status'], EnumMeta> = {
  passed: { label: 'Geprüft ✓', tone: 'success', icon: ShieldCheck, description: 'Alle passenden Prüfungen waren erfolgreich.' },
  failed: { label: 'Prüfung fehlgeschlagen', tone: 'danger', icon: ShieldX, description: 'Mindestens eine Prüfung ist fehlgeschlagen.' },
  not_run: { label: 'Nicht geprüft', tone: 'neutral', icon: CircleDashed, description: 'Es wurden (noch) keine Prüfungen ausgeführt.' },
  unavailable: { label: 'Keine Prüfung möglich', tone: 'warning', icon: ShieldQuestion, description: 'Für diese Aufgabe gibt es keine ausführbaren Prüfungen.' },
};

// ---------------------------------------------------------------------------
// Processes, files, git, checkpoints, backups
// ---------------------------------------------------------------------------

export const PROCESS_KIND: Record<ProcessKind, EnumMeta> = {
  command: { label: 'Befehl', tone: 'neutral', icon: Terminal },
  dev_server: { label: 'Entwicklungsserver', tone: 'blue', icon: Server },
  test: { label: 'Tests', tone: 'info', icon: FlaskConical },
  build: { label: 'Build', tone: 'blue', icon: Hammer },
  terminal: { label: 'Terminal', tone: 'neutral', icon: SquareTerminal },
  preview: { label: 'Vorschau', tone: 'violet', icon: Eye },
  install: { label: 'Installation', tone: 'warning', icon: Download },
};

export const PROCESS_STATUS: Record<ProcessInfo['status'], EnumMeta> = {
  running: { label: 'Läuft', tone: 'blue', icon: LoaderCircle, spin: true },
  exited: { label: 'Beendet', tone: 'neutral', icon: CircleCheck },
  killed: { label: 'Abgebrochen', tone: 'neutral', icon: CircleSlash },
  orphaned: { label: 'Verwaist', tone: 'warning', icon: CircleHelp },
  failed: { label: 'Fehlgeschlagen', tone: 'danger', icon: CircleX },
};

export const CHANGE_OP: Record<ChangeOp, EnumMeta> = {
  create: { label: 'Neu', tone: 'success', icon: FilePlus },
  modify: { label: 'Geändert', tone: 'blue', icon: FilePen },
  delete: { label: 'Gelöscht', tone: 'danger', icon: FileMinus },
};

export const CHECKPOINT_KIND: Record<CheckpointKind, EnumMeta> = {
  pre_task: { label: 'Vor einer Aufgabe', tone: 'neutral', icon: Save },
  post_task: { label: 'Nach einer Aufgabe', tone: 'success', icon: Save },
  manual: { label: 'Manuell angelegt', tone: 'violet', icon: Save },
  pre_restore: { label: 'Vor einer Wiederherstellung', tone: 'warning', icon: RotateCcw },
};

export const BACKUP_KIND: Record<BackupInfo['kind'], EnumMeta> = {
  database: { label: 'Datenbank', tone: 'blue', icon: Database },
  project_snapshot: { label: 'Projektkopie', tone: 'violet', icon: Folder },
  export: { label: 'Export', tone: 'neutral', icon: Upload },
};

export const EXPORT_SECTION: Record<ExportSection, EnumMeta> = {
  projects: { label: 'Projekte', tone: 'neutral', icon: Folder },
  tasks: { label: 'Aufgaben', tone: 'neutral', icon: ClipboardList },
  settings: { label: 'Einstellungen', tone: 'neutral', icon: Cog },
  memory: { label: 'Gedächtnis und Wissen', tone: 'neutral', icon: Brain },
  providers: { label: 'Anbieter (ohne Schlüssel)', tone: 'neutral', icon: Cloud },
};

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export const MEMORY_KIND: Record<MemoryKind, EnumMeta> = {
  goal: { label: 'Ziel', tone: 'violet', icon: Target },
  decision: { label: 'Entscheidung', tone: 'blue', icon: Scale },
  requirement: { label: 'Anforderung', tone: 'blue', icon: ListChecks },
  convention: { label: 'Konvention', tone: 'neutral', icon: BookOpen },
  task_status: { label: 'Aufgabenstand', tone: 'neutral', icon: ClipboardList },
  bug: { label: 'Fehler', tone: 'danger', icon: Bug },
  attempt: { label: 'Lösungsversuch', tone: 'warning', icon: Repeat },
  test_result: { label: 'Testergebnis', tone: 'info', icon: FlaskConical },
  question: { label: 'Offene Frage', tone: 'warning', icon: CircleHelp },
  next_step: { label: 'Nächster Schritt', tone: 'violet', icon: ArrowRight },
  note: { label: 'Notiz', tone: 'neutral', icon: StickyNote },
  insight: { label: 'Erkenntnis', tone: 'success', icon: Lightbulb },
};

export const MEMORY_SOURCE: Record<MemoryEntry['source'], EnumMeta> = {
  user: { label: 'Manuell', tone: 'neutral', icon: UserRound },
  agent: { label: 'Von einem Agenten', tone: 'violet', icon: Sparkles },
  system: { label: 'Vom System', tone: 'neutral', icon: Cog },
};

// ---------------------------------------------------------------------------
// Models, providers, integrations
// ---------------------------------------------------------------------------

export const PROVIDER_TYPE: Record<ProviderType, EnumMeta> = {
  ollama: { label: 'Ollama (lokal)', tone: 'success', icon: Cpu },
  openai_compatible: { label: 'OpenAI-kompatibel', tone: 'blue', icon: Cloud },
  anthropic: { label: 'Anthropic', tone: 'violet', icon: Cloud },
};

export const PROVIDER_HEALTH: Record<ProviderHealth['status'], EnumMeta> = {
  ok: { label: 'Erreichbar', tone: 'success', icon: CircleCheck },
  unreachable: { label: 'Nicht erreichbar', tone: 'danger', icon: WifiOff },
  auth_error: { label: 'Anmeldung fehlgeschlagen', tone: 'danger', icon: KeyRound },
  error: { label: 'Fehler', tone: 'danger', icon: CircleAlert },
  disabled: { label: 'Ausgeschaltet', tone: 'neutral', icon: PowerOff },
  not_configured: { label: 'Nicht eingerichtet', tone: 'warning', icon: Plug },
};

export const MODEL_CAPABILITY: Record<ModelCapability, EnumMeta> = {
  completion: { label: 'Text', tone: 'neutral', icon: MessageSquare, description: 'Kann Text und Code schreiben.' },
  tools: { label: 'Werkzeuge', tone: 'violet', icon: Wrench, description: 'Kann Werkzeuge aufrufen – nötig für selbstständig arbeitende Agenten.' },
  vision: { label: 'Bilder', tone: 'blue', icon: Eye, description: 'Kann Bilder verstehen.' },
  embedding: { label: 'Suche', tone: 'info', icon: Database, description: 'Erzeugt Einbettungen für die Wissenssuche.' },
  thinking: { label: 'Denkt nach', tone: 'violet', icon: Brain, description: 'Kann vor der Antwort schrittweise nachdenken.' },
  insert: { label: 'Einfügen', tone: 'neutral', icon: FileCode, description: 'Kann Code mitten in eine Datei einfügen.' },
};

export const OLLAMA_PULL_STATUS: Record<OllamaPull['status'], EnumMeta> = {
  running: { label: 'Wird geladen', tone: 'blue', icon: LoaderCircle, spin: true },
  done: { label: 'Fertig', tone: 'success', icon: CircleCheck },
  failed: { label: 'Fehlgeschlagen', tone: 'danger', icon: CircleX },
  cancelled: { label: 'Abgebrochen', tone: 'neutral', icon: CircleSlash },
};

export const GPU_VENDOR: Record<GpuInfo['vendor'], string> = {
  nvidia: 'NVIDIA',
  amd: 'AMD',
  intel: 'Intel',
  apple: 'Apple',
  unknown: 'Unbekannt',
};

export const INTEGRATION_CATEGORY: Record<IntegrationStatus['category'], EnumMeta> = {
  vcs: { label: 'Versionsverwaltung', tone: 'neutral', icon: GitBranch },
  runtime: { label: 'Laufzeitumgebungen', tone: 'neutral', icon: Box },
  shell: { label: 'Kommandozeile', tone: 'neutral', icon: SquareTerminal },
  ai: { label: 'Künstliche Intelligenz', tone: 'violet', icon: Brain },
  engine: { label: 'Spiel-Engines', tone: 'violet', icon: Gamepad2 },
  editor: { label: 'Editoren', tone: 'neutral', icon: FileCode },
  testing: { label: 'Testen', tone: 'info', icon: FlaskConical },
  package_manager: { label: 'Paketverwaltung', tone: 'neutral', icon: Package },
};

/** Display names of the known integrations (the daemon also sends `name`). */
export const INTEGRATION_NAME: Record<IntegrationId, string> = {
  git: 'Git',
  node: 'Node.js',
  npm: 'npm',
  python: 'Python',
  dotnet: '.NET SDK',
  powershell: 'PowerShell',
  windows_terminal: 'Windows Terminal',
  ollama: 'Ollama',
  unity: 'Unity',
  unreal: 'Unreal Engine',
  godot: 'Godot',
  vscode: 'Visual Studio Code',
  playwright: 'Playwright',
  winget: 'winget',
};

// ---------------------------------------------------------------------------
// Daemon, logs, notifications
// ---------------------------------------------------------------------------

export const LOG_LEVEL: Record<LogLevel, EnumMeta> = {
  debug: { label: 'Debug', tone: 'neutral', icon: Bug },
  info: { label: 'Info', tone: 'info', icon: Info },
  warn: { label: 'Warnung', tone: 'warning', icon: TriangleAlert },
  error: { label: 'Fehler', tone: 'danger', icon: CircleX },
};

export const DAEMON_CONNECTION: Record<DaemonConnectionStateName, EnumMeta> = {
  connecting: { label: 'Verbindet', tone: 'blue', icon: LoaderCircle, spin: true },
  starting: { label: 'Startet', tone: 'blue', icon: LoaderCircle, spin: true },
  connected: { label: 'Verbunden', tone: 'success', icon: CircleCheck },
  reconnecting: { label: 'Getrennt', tone: 'warning', icon: WifiOff },
  stopped: { label: 'Getrennt', tone: 'neutral', icon: PowerOff },
  error: { label: 'Fehler', tone: 'danger', icon: CircleAlert },
};

export const DAEMON_STATE: Record<DaemonStatus['state'], EnumMeta> = {
  starting: { label: 'Startet', tone: 'blue', icon: LoaderCircle, spin: true },
  running: { label: 'Läuft', tone: 'success', icon: CircleCheck },
  paused: { label: 'Pausiert', tone: 'warning', icon: CirclePause },
  error: { label: 'Fehler', tone: 'danger', icon: CircleAlert },
  stopping: { label: 'Wird beendet', tone: 'neutral', icon: PowerOff },
};

/**
 * Status pill text of the background service (UI-SPEC §2: Läuft / Pausiert / Startet / Getrennt / Fehler).
 * Combines the bridge connection state with the last `daemon.status`.
 */
export function daemonPillMeta(connection: DaemonConnectionState | null, status: DaemonStatus | null): EnumMeta {
  if (!connection || connection.state === 'connecting' || connection.state === 'starting') return DAEMON_CONNECTION.starting;
  if (connection.state !== 'connected') return DAEMON_CONNECTION[connection.state];
  if (!status) return DAEMON_STATE.running;
  if (status.state === 'running' && status.work === 'paused') return DAEMON_STATE.paused;
  return DAEMON_STATE[status.state] ?? DAEMON_STATE.running;
}

export const NOTIFICATION_LEVEL: Record<Notification['level'], EnumMeta> = {
  info: { label: 'Info', tone: 'info', icon: Info },
  success: { label: 'Erfolg', tone: 'success', icon: CircleCheck },
  warning: { label: 'Warnung', tone: 'warning', icon: TriangleAlert },
  error: { label: 'Fehler', tone: 'danger', icon: CircleX },
};

export const NOTIFICATION_CATEGORY: Record<Notification['category'], EnumMeta> = {
  task_done: { label: 'Aufgabe erledigt', tone: 'success', icon: CircleCheck },
  error: { label: 'Fehler', tone: 'danger', icon: CircleAlert },
  approval: { label: 'Freigabe nötig', tone: 'warning', icon: ShieldQuestion },
  blocker: { label: 'Blockiert', tone: 'danger', icon: Ban },
  update: { label: 'Update', tone: 'violet', icon: Download },
  info: { label: 'Info', tone: 'info', icon: Info },
};
