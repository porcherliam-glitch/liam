# NOVA AI – UI & Electron Specification (binding for the frontend team)

Read first: `docs/MASTERPROMPT.md` (German customer requirements, esp. §4, §11 Electron security, §19 error UX),
`docs/SPEC.md` §1–3, `src/shared/*.ts` (schemas, `rpc.ts` = the ONLY data API, `events.ts`, `settings.ts`, `errors.ts`,
`bridge.ts` = `window.nova`). All user-visible text is **German** (plain, friendly, no jargon; the user is a beginner).
Code/comments English. React 19 + TypeScript strict + Tailwind CSS v4 + react-router 7 (HashRouter) + zustand 5 +
lucide-react icons + Monaco (`@monaco-editor/react` with the local `monaco-editor` package, no CDN) + xterm.js.

## 1. Design

Dark, calm, professional developer studio with violet and blue accents. No decorative clutter, no heavy animation
(only 150 ms transitions on hover/focus/open). Dense but readable (base 14 px). System fonts only (offline app):
`"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`; mono `"Cascadia Code", "Cascadia Mono", Consolas, monospace`.

Tokens (define in `src/renderer/src/styles/index.css` via Tailwind v4 `@theme`):

| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#0b0d14` | app background |
| `--color-surface` | `#11141d` | cards, sidebar |
| `--color-surface-2` | `#171b26` | inputs, hover, nested |
| `--color-border` | `#252b3a` | borders/dividers |
| `--color-text` | `#e6e8f0` | primary text |
| `--color-muted` | `#8b93a7` | secondary text |
| `--color-violet` | `#8b5cf6` | primary accent |
| `--color-blue` | `#3b82f6` | secondary accent / links |
| `--color-success` | `#22c55e` | passed, running ok |
| `--color-warning` | `#f59e0b` | warnings, waiting |
| `--color-danger` | `#ef4444` | errors, failed |
| `--color-info` | `#38bdf8` | info |

Primary buttons: gradient violet→blue. Focus ring: 2 px violet. Every interactive element keyboard reachable with
visible focus; icons have `aria-label`/`title`. Status always as color + icon + text (never color alone).

## 2. App structure and routes (HashRouter)

Sidebar (left, collapsible) entries with lucide icons, German labels:
Übersicht `/` · Projekte `/projects` · Agenten `/agents` · Aufgaben `/tasks` · Freigaben `/approvals` (badge with pending
count) · Modelle `/models` · Kosten `/costs` · Wissen `/knowledge` · Werkzeuge `/integrations` · Einstellungen
`/settings` · Protokolle `/logs`.
Project routes: `/projects/:projectId` (tabs via `?tab=overview|tasks|agents|changes|checks|memory|errors`) and the studio
`/projects/:projectId/studio` (editor + terminal + preview, optional `?file=<path>&line=<n>` to jump to an error).

Top bar: page title, global work control (Start/Pause/Fortsetzen/Stopp of the autonomous work cycle via
`work.*`, shows `work.status` incl. `idleReason`), daemon status pill (from `window.nova.daemon.state()` +
`daemon.status`: Läuft / Pausiert / Startet / Getrennt / Fehler), approvals bell with count.
When the daemon is not connected: a full-width banner with the German message, a "Dienst neu starten" button
(`daemon.restart()`) and the reason; pages show cached data greyed out and disable actions.

## 3. Data layer (`src/renderer/src/lib`, `hooks`, `stores`)

- `lib/api.ts`: `api<M extends RpcMethod>(method, params?) : Promise<RpcResult<M>>` → calls
  `window.nova.invoke`, throws `NovaRpcError {code, message, details}` on `ok:false`. Typed with `RpcParams/RpcResult`.
- `hooks/useRpc.ts`: `useRpc(method, params, { refetchOn?: NovaEventType[], enabled?, intervalMs? })` →
  `{ data, error, loading, refetch }`; refetch debounced (250 ms) when a matching event arrives; params compared by
  JSON. `useMutation(method)` → `{ run(params), loading, error }` showing a toast on error.
- `hooks/useEvents.ts`: `useNovaEvent(type, handler)`; a single global subscription in `stores/events.ts` fans out.
- `stores/daemon.ts` (zustand): connection state, last `daemon.status`, `work.status`, pending approvals count.
- `stores/toasts.ts` + `<Toaster/>`: success/info/warning/error toasts (auto-hide 5 s, errors 10 s, closable).
- `lib/format.ts`: German formatting (`Intl` de-DE): bytes (KB/MB/GB), durations ("3 Min. 12 Sek."), relative time
  ("vor 5 Min."), dates, USD currency ("0,42 $"), percent, token counts ("12,3 Tsd.").
- `lib/labels.ts`: German labels + colors + icons for every enum (TaskStatus, AgentRole, TaskKind, ProjectKind,
  ApprovalKind, ErrorSeverity, CheckStatus, Verification.status, ProcessKind, MemoryKind, IntegrationId categories,
  ProviderType, health status, preview state). Estimated values get the suffix " (geschätzt)".
- `lib/mock-bridge.ts`: in-memory `NovaBridge` with realistic fixtures (2 projects, tasks in all states, runs with
  steps, approvals, models, budget, resources incl. one GPU with `estimated` flag, errors) and
  `mockHandlers.set(method, fn)` to override responses in tests; `emitMockEvent(event)`. `main.tsx` installs it when
  `window.nova` is missing (plain browser dev) and shows a "Demo-Daten" ribbon.

## 4. Pages (each owned by one developer)

### Foundation (developer UI-1) – shell, data layer, components, Übersicht, Freigaben, Protokolle
- `components/ui/*`: Button (variants primary/secondary/ghost/danger, sizes, loading), IconButton, Card, Badge,
  StatusDot, Tabs, Table (sortable header optional), Dialog (focus trap, Esc, aria-modal), ConfirmDialog, Input,
  Textarea, Select, Switch, Checkbox, Tooltip, ProgressBar (determinate/indeterminate), Meter (value + label +
  "geschätzt" marker), EmptyState, Spinner, KeyValue list, CodeBlock (mono, copy button), SectionHeader, Toaster.
- `components/common/*`: ErrorCard (NovaErrorInfo: severity badge Warnung/Wiederholbarer Fehler/Blocker/Kritisch;
  sections "Was ist passiert?", "Betroffene Aufgabe", "Bereits versucht", "Ist das Projekt sicher?", "Kann NOVA es
  selbst beheben?", "Was ist zu tun?", collapsible technical details, "Als erledigt markieren" → errors.resolve),
  TaskStatusBadge, VerificationBadge ("Geprüft ✓", "Prüfung fehlgeschlagen", "Nicht geprüft", "Keine Prüfung möglich"),
  RoleBadge, ModelBadge, PriorityBadge/selector, RelativeTime, ApprovalCard (title, action as code block,
  consequences, buttons "Einmal erlauben" / "Immer erlauben" / "Ablehnen"), DaemonBanner, WorkControls.
- `pages/DashboardPage.tsx` from `dashboard.summary` (refetch on task/run/check/error/approval/resources/budget events):
  running projects, paused/waiting projects, live agent activity (active runs with role, task, model, runtime, last
  action), open tasks count, last successful builds, failed tests, current errors (ErrorCard compact), local model
  status (Ollama running/version/model count) + cloud provider health, resource meters CPU/RAM/GPU/VRAM/disk (live
  from `resources.snapshot` events; show "nicht verfügbar" + gpuNote when no GPU data; mark estimates), costs today/
  month, tokens, runtime local/cloud, remaining budget. Empty state for first start: "Noch kein Projekt" + buttons
  "Projekt erstellen" and "Modell einrichten".
- `pages/ApprovalsPage.tsx`: pending first, history below, rules list (approvals.rules / deleteRule).
- `pages/LogsPage.tsx`: daemon logs (daemon.logs, level filter, scope filter, live append from `log` events),
  "Diagnose-Paket erstellen" (daemon.diagnostics → show path + "Ordner öffnen").
- Router, layout, sidebar, top bar; stub files for the other pages (replaced by their owners).

### Projects & agents (developer UI-2)
- `pages/projects/ProjectsPage.tsx`: cards/table with name, kind, status, progress bar, open/running/failed/blocked task
  counts, open errors, last activity, work toggle (projects.setWork). "Neues Projekt" opens `CreateProjectDialog`:
  5 modes as tabs: "Beschreiben" (free text → kind auto), "Assistent" (step-by-step questions: Art, Zielplattform,
  wichtigste Funktionen, Stil/Technik-Wünsche, Speicherort → answers), "Vorlage" (templates.list cards with missing
  tools warnings), "Öffnen" (select folder via `app.selectDirectory`), "Importieren" (git URL + target folder).
  Shows warnings from the result and navigates to the project.
- `pages/projects/ProjectDetailPage.tsx` with tabs:
  - Übersicht: name/description (editable), path (open folder button), kind/technologies (editable chips), status,
    progress, commands (editable ProjectConfig: test/build/dev/run/lint commands, testAfterChange, reviewChanges,
    autoCommit, monthly budget, allowed commands, conventions), "Erkennen" (projects.detect), quick buttons
    "Studio öffnen", "Tests ausführen", "Build ausführen", "Ziel planen" (tasks.plan with goal text),
    work toggle, last changes (files.changed), last test/build results, open errors, active agents.
  - Aufgaben: task list grouped/filterable by status, priority selector, controls per task (Start, Pause, Fortsetzen,
    Stopp, Wiederholen, Bearbeiten (allowed while not running – also during pause), Löschen), dependency display,
    verification badge + checks, blocker text, result, files; "Aufgabe anlegen" dialog (title, description,
    kind/role, priority, dependencies multi-select, acceptance).
  - Agenten: runs of the project (role, task, status, model, runtime, steps, tokens, last action, blocker, files),
    step feed (agents.steps, live `run.step`) with expandable data.
  - Änderungen: NOVA-changed files (files.changed: op, tasks, "nach NOVA geändert" marker) with diff link to studio,
    history (files.history), restore points (checkpoints.list) with "Vorschau" (checkpoints.preview → list of files to
    restore and conflicts) and "Wiederherstellen" (ConfirmDialog explaining that only NOVA's changes are undone and
    user changes stay), "Wiederherstellungspunkt anlegen", undo per task; git status + recent commits (git.log,
    NOVA commits marked), "Git einrichten" (git.init) when no repo.
  - Prüfungen: check runs (checks.list) with status, counts, duration, failures (click → studio jump to file:line),
    output tail; buttons Tests/Build/Lint ausführen; explicit text when no command is configured ("Für dieses Projekt
    ist kein Testbefehl eingerichtet – Prüfung nicht möglich").
  - Gedächtnis: project memory list by kind, search (memory.search), add/edit/delete, export, clear (confirm).
  - Fehler: errors.list(projectId) with ErrorCard.
- `pages/agents/AgentsPage.tsx`: all runs (active first) across projects with role, task (link), project, status,
  model, runtime (live ticking), last action, blocker, files; controls on the task (pause/resume/stop/priority);
  agent roles overview (agents.roles: name, description, tools, module); live activity feed.
- `pages/tasks/TasksPage.tsx`: global task board (filters: project, status, role; sort by priority), same controls.

### Studio (developer UI-3) – `/projects/:projectId/studio`
- Layout: left file tree (files.tree lazy-loading, NOVA-changed files highlighted with a violet dot + git status
  letter, refresh on `files.changed`), center editor with tabs (Monaco, dark theme matching tokens, language from
  FileContent.language, dirty marker, Ctrl+S saves via files.write with expectedHash; on CONFLICT offer reload/diff),
  right/bottom panels: Suche (files.search, click → open at line), Änderungen (files.changed + Monaco DiffEditor for
  files.diff / git.diff, "Von NOVA geändert" badges, per-task filter), Prüfungen (latest failures → jump to file:line),
  Terminal (xterm.js + FitAddon; terminal.create/run/interrupt/close; local line editing with history ↑/↓, Ctrl+C →
  interrupt; output from `terminal.output` events; clear note that interactive programs are not supported), Vorschau
  (preview.status/start/stop; browser kinds in a sandboxed `<iframe sandbox="allow-scripts allow-forms
  allow-same-origin allow-modals" referrerpolicy="no-referrer">` only for loopback URLs; reload when `reloadToken`
  changes; "Im Browser öffnen" via app.openExternal; unsupported kinds show the German message, desktop-run shows
  start/stop + process output).
- Monaco setup: `import * as monaco from 'monaco-editor'` + `loader.config({ monaco })`, workers via Vite `?worker`
  imports (editor, json, css, html, ts). Large files (> 2 MB / truncated) read-only with notice. Binary → notice.
- Tests mock Monaco and xterm.

### Models, costs, knowledge, tools, settings (developer UI-4)
- `pages/models/ModelsPage.tsx`: Ollama card (ollama.status: installiert/läuft/Version/URL, German fix instructions,
  "Erneut prüfen"), installed models table (name, size, parameters, quantization, family, context, capabilities
  badges incl. "Werkzeuge", fit check (ollama.fit → passt / passt nicht / unbekannt + alternatives), running models
  with VRAM (ollama.running), delete with confirm), pull form with suggestions (e.g. qwen2.5-coder:7b,
  qwen2.5-coder:14b, llama3.1:8b, deepseek-coder-v2:16b, mistral-nemo – shown as suggestions only) and live progress
  (`ollama.pull` events, cancel); default model + ordered fallback list + per-role overrides (models.getSelection/
  setSelection; only models from models.list; paid models marked and disabled unless provider approved and price
  set), context size, temperature, max output tokens. Cloud providers: list (providers.list + health), add/edit dialog
  (type, name, base URL presets for OpenAI / Anthropic / OpenRouter / LM Studio (local, paid=false), paid flag,
  "Kostenpflichtige Nutzung freigeben" checkbox with explicit warning text), API key field (write-only, shows
  "Schlüssel gespeichert" when hasApiKey; never displays keys), test connection, remove; pricing per paid model
  (models.setPricing, "geschätzt" checkbox).
- `pages/costs/CostsPage.tsx`: budget status (today/month spent, limits, remaining, paused state with
  "Kostenpflichtige Arbeit fortsetzen" (budget.resumePaid, confirm), per project), limits form (budget.setLimits),
  usage table (budget.usage: time, provider, model, project, tokens in/out, duration, cost, "geschätzt"), token totals,
  local vs cloud runtime.
- `pages/knowledge/KnowledgePage.tsx`: global knowledge base (memory.list projectId null) + search across all projects
  (memory.search includeGlobal), add/edit/delete, shareable toggle with explanation, export/import (selectFile/
  saveFile), clear global (confirm).
- `pages/integrations/IntegrationsPage.tsx`: integrations.list grouped by category with available/version/path/
  message, manual path (selectFile → integrations.setPath, reset), "Installieren" (integrations.install → explains that
  a Freigabe was created, link to Freigaben), refresh.
- `pages/settings/SettingsPage.tsx`: sections (left sub-nav): Allgemein (projectsDir with folder picker), Agenten,
  Parallelität & Ressourcen, Berechtigungen (allowlist editor, approval toggles), Netzwerk (allowed hosts editor,
  cloud data approval), Benachrichtigungen, Speicher & Backups (retention, backup list, "Jetzt sichern",
  project snapshot, export (sections checkboxes → data.export with saveFile) / import (data.import)), Hintergrund &
  Autostart (keepRunningWhenUiClosed, closeToTray, resumeAfterRestart, autostart via `app.setAutostart`), Updates
  (feed URL, check now → updates.check; text "Updates werden nie automatisch installiert"), Diagnose (log level, log
  size, diagnostics bundle), Gedächtnis (memory settings). Each section saves via settings.update with validation
  errors shown inline; unsaved-changes indicator.

## 5. Electron main & preload (developer M) – `src/main/**`, `src/preload/**`, `electron-builder.yml`, `build/**`

- Security: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`,
  `webviewTag: false`, `allowRunningInsecureContent: false`; `app.enableSandbox()`; deny all permission requests
  (`session.setPermissionRequestHandler/CheckHandler`); `setWindowOpenHandler` → deny, open http(s) externally after
  validation; block `will-navigate` away from the app origin; subframes (`will-frame-navigate`) only to loopback http
  URLs (`http://127.0.0.1:*`, `http://localhost:*`, `http://[::1]:*`); CSP for the app:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'
  data:; worker-src 'self' blob:; connect-src 'self'; frame-src http://127.0.0.1:* http://localhost:* http://[::1]:*;
  object-src 'none'; base-uri 'none'` (dev adds the Vite dev server + `'unsafe-eval'` only when NOVA_DEV=1).
  Production loads the renderer through a privileged custom protocol `app://nova/` (`protocol.handle`, path traversal
  safe, correct MIME types) instead of file://.
- IPC (`src/shared/bridge.ts` channel names): every `ipcMain.handle` verifies `event.senderFrame` is the main frame of
  the app window with the app origin; `nova:rpc` checks `isRpcMethod`, validates params with
  `RpcContract[method].params.safeParse` and forwards to the daemon client; returns `BridgeRpcResult`. openExternal only
  `http:`/`https:`; openPath only existing absolute paths.
- DaemonSupervisor (`src/main/daemon-supervisor.ts`): uses `src/daemon/core/paths.ts` (defaultDataDir, dataPaths,
  defaultEndpoint) and `src/daemon/client/daemon-client.ts` (written by the server developer; contract in SPEC §4.1 –
  code against that API). Connect → if no daemon: spawn `process.execPath` with `ELECTRON_RUN_AS_NODE=1`, args
  `[daemonEntry, '--data-dir', dataDir]`, `detached: true`, `stdio: 'ignore'`, `windowsHide: true`, then `unref()`.
  daemonEntry dev: `<appPath>/out/daemon/index.cjs`; packaged: `<resources>/app.asar.unpacked/out/daemon/index.cjs`.
  Wait for `/health` (20 s). Subscribe to events → forward to the renderer. On connection loss → reconnecting; if the
  daemon process is gone → auto-restart (max 3 attempts per 5 min, then state error with German message and manual
  restart button). Expose state changes. On app quit: if `!settings.background.keepRunningWhenUiClosed` →
  `daemon.shutdown`.
- Window: 1440×900 default, min 1100×700, remember bounds (JSON in userData), dark background `#0b0d14`
  (no white flash), native frame, German menu minimal (or no menu bar; DevTools only in dev).
- Tray (`Tray` with the app icon): "NOVA öffnen", "Arbeit pausieren"/"Arbeit fortsetzen" (work.pause/resume),
  "Oberfläche beenden", "NOVA vollständig beenden (inkl. Hintergrunddienst)". Close button → hide to tray when
  `background.closeToTray` (first time shows a notification explaining it), else quit UI.
- Single instance (`app.requestSingleInstanceLock`): second start focuses the window. `--hidden` flag (autostart) starts
  minimized to tray. Autostart: `app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] })`.
- Notifications: daemon `notification` events → `new Notification({ title, body })` (Windows toast; set
  `app.setAppUserModelId('ai.nova.studio')`), click → show window + `nova:navigate` to the task/project/approvals page.
- `electron-builder.yml`: appId `ai.nova.studio`, productName `NOVA AI`, files `out/**` + package.json, asarUnpack
  `out/daemon/**`, win target nsis x64, NSIS: oneClick false, perMachine false, allowToChangeInstallationDirectory
  true, createStartMenuShortcut true, createDesktopShortcut false + custom `build/installer.nsh` asking "Desktop-
  Verknüpfung erstellen?" (MessageBox, default No in silent mode) and removing it on uninstall,
  deleteAppDataOnUninstall false (user data and projects are never deleted), installer language German; linux target
  `dir` (for CI smoke tests). Icon: generate `build/icon.png` (512×512) with a script `scripts/make-icon.mjs` (pure
  Node + zlib PNG encoder; violet→blue gradient rounded square with a white "N" drawn from rectangles/lines) and
  `build/icon.ico` (ICO container embedding PNGs 16/32/48/256 – write the ICO header yourself).
- `e2e/app.spec.ts` (Playwright `_electron`): launches the built app with a temp `NOVA_DATA_DIR`, `--no-sandbox`
  on Linux CI, waits for the daemon pill to show "Läuft", checks sidebar navigation, creates a project from the
  "Webanwendung" template via the dialog, opens the studio, and closes the app; verifies the daemon process exits when
  keepRunningWhenUiClosed=false (set via settings before quitting). Config `playwright.config.ts`.

## 6. Testing

Vitest + jsdom + @testing-library/react (`/** @vitest-environment jsdom */` at the top of each renderer test file),
using `lib/mock-bridge.ts`. Each page gets tests for its main flows (render with data, empty state, an action calls
the right RPC with the right params, error toast). Run `npx vitest run src/renderer/<your folder>` and
`npx tsc -p tsconfig.web.json --noEmit` (filter to your files while others are still writing). `npm run build`
must succeed at the end of the wave.
