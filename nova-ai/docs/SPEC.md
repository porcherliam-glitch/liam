# NOVA AI – Engineering Specification (binding contract for all modules)

Audience: developers (human or AI) implementing NOVA AI modules. Code, comments and identifiers are **English**;
every text a user can read (UI, error messages, notifications, activity feed summaries, approval texts) is **German**
(plain language, no jargon, du-Form is NOT used – use neutral/Sie-free phrasing like "Bitte Ollama starten.").

The customer requirements are in `docs/MASTERPROMPT.md` (German). This file translates them into an architecture.
Contracts in code are binding: `src/shared/*.ts` (domain schemas, RPC contract, events, settings) and
`src/daemon/contracts.ts` (service interfaces). Read them completely before writing code.

---------------------------------------------------------------------------------------------------------------------

## 1. Process topology

```
┌──────────────────────────── Electron app (NOVA AI.exe) ────────────────────────────┐
│ Renderer (React, sandboxed, contextIsolation, no Node)                              │
│    │ window.nova.rpc(method, params) / window.nova.onEvent(cb)   (preload bridge)   │
│ Main process: window, tray, autostart, notifications, DaemonSupervisor, IPC bridge  │
└──────────────┬──────────────────────────────────────────────────────────────────────┘
               │ HTTP over named pipe \\.\pipe\nova-ai-daemon-<hash> (unix socket on Linux/macOS)
               │ Bearer token from <dataDir>/daemon.token, POST /rpc, GET /events (SSE), GET /health
┌──────────────┴─────────────── Daemon (same exe, ELECTRON_RUN_AS_NODE=1) ─────────────┐
│ RPC server → services (Services container, src/daemon/contracts.ts)                  │
│ SQLite (node:sqlite, WAL) in <dataDir>/nova.db, logs, snapshots, backups             │
│ Child processes: commands, tests, builds, dev servers, terminal lines, git, ollama   │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- The daemon is started detached by Electron main if not running, survives closing the UI (setting
  `background.keepRunningWhenUiClosed`), and is single-instance per user (pipe/socket ownership + lock file).
- `<dataDir>` = `%APPDATA%\NOVA AI` on Windows (override `--data-dir` / `NOVA_DATA_DIR`).
- The daemon bundle (`out/daemon/index.cjs`) is self-contained (esbuild bundles zod); it may only use Node built-ins
  at runtime. **No native modules anywhere** (Windows users have no build tools). SQLite = `node:sqlite`.
- Runtime deps allowed in the daemon: Node built-ins + `zod`. Nothing else. Do not run `npm install`.

## 2. Module ownership

Each module lives in its own folder(s). A developer writes only inside the folders of their module (plus tests inside
them). Shared files (`src/shared/**`, `src/daemon/contracts.ts`, `src/daemon/core/**`, `src/daemon/db/**`,
`tests/helpers/**`, `package.json`, configs) are owned by the integrator; request changes in your final report.

| Module | Folders | Implements (contracts.ts) | RPC methods (`register<Module>Rpc`) |
|---|---|---|---|
| server | `src/daemon/server/`, `src/daemon/client/` | RpcRouter, RPC/SSE server, single instance, token, DaemonClient | (transport only) |
| providers | `src/daemon/providers/`, `tests/fakes/fake-ollama.ts` | ProviderRegistry, ModelClient, BudgetService, OllamaService, ProviderFactory ×3 | providers.*, models.*, ollama.*, budget.* |
| tools | `src/daemon/tools/`, `src/daemon/changes/`, `src/daemon/processes/` | PathGuard, ChangeJournal, FileLockService, CommandPolicy, ProcessManager, TerminalService, FileService, ToolRegistry + generic agent tools | files.*, processes.*, terminal.* |
| agents | `src/daemon/agents/` | AgentRunner, RunStore, AgentRoleModule ×4 (planner, coder, tester, reviewer) | agents.roles, agents.runs, agents.steps |
| orchestrator | `src/daemon/tasks/` | TaskService, WorkCycle | tasks.*, work.*, errors.*, dashboard.summary |
| git | `src/daemon/git/`, `src/daemon/checkpoints/`, `src/daemon/backup/` | GitService, CheckpointService, BackupService | git.*, checkpoints.*, backup.*, data.* |
| memory | `src/daemon/memory/` | MemoryService | memory.* |
| projects | `src/daemon/projects/`, `src/daemon/checks/`, `src/daemon/preview/` | ProjectService, TemplateRegistry (+4 templates), ProjectDetector, CheckService, PreviewService | projects.*, templates.list, checks.*, preview.* |
| env | `src/daemon/env/`, `src/daemon/secrets/`, `src/daemon/approvals/`, `src/daemon/resources/`, `src/daemon/integrations/`, `src/daemon/updates/` | SecretStore, ApprovalService, ResourceMonitor, ConcurrencyGovernor, IntegrationService, UpdateService | approvals.*, resources.*, integrations.*, updates.check |
| integrator | `src/daemon/app.ts`, `src/daemon/index.ts`, `src/daemon/rpc-core.ts`, `src/daemon/core/**` | wiring, lifecycle, NotificationService, OperationService, DaemonInfo | daemon.*, settings.*, notifications.*, operations.* |

Each module exposes ONE barrel file exporting factories with this shape:
`export function createX(s: Services): X` (constructor must not call other services) and
`export const register<Module>Rpc: RpcRegistrar`. Services with timers expose `start()`/`stop()` (or the contract methods).
Exact barrels and export names (used by `src/daemon/app.ts`):

| Barrel | Exports |
|---|---|
| `src/daemon/server/index.ts` | `createRpcRouter(log)`, `startRpcServer(opts)`, `ensureToken(paths): string`, `readToken(paths): string \| null`, `writeLock(paths, info)`, `readLock(paths)`, `removeLock(paths, instanceId)` |
| `src/daemon/client/index.ts` | `DaemonClient`, `DaemonRpcError` |
| `src/daemon/providers/index.ts` | `createProviderRegistry`, `createModelClient`, `createBudgetService`, `createOllamaService`, `registerProvidersRpc` |
| `src/daemon/tools/index.ts` | `createPathGuard`, `createChangeJournal`, `createFileLockService`, `createCommandPolicy`, `createProcessManager`, `createTerminalService`, `createFileWatcher`, `createFileService`, `createToolRegistry`, `registerToolsRpc` |
| `src/daemon/agents/index.ts` | `createRunStore`, `createAgentRunner`, `registerAgentsRpc` |
| `src/daemon/tasks/index.ts` | `createTaskService`, `createWorkCycle`, `registerTasksRpc` |
| `src/daemon/git/index.ts` | `createGitService`, `createCheckpointService`, `createBackupService`, `registerGitRpc` |
| `src/daemon/memory/index.ts` | `createMemoryService`, `registerMemoryRpc` |
| `src/daemon/projects/index.ts` | `createProjectService`, `createTemplateRegistry`, `createProjectDetector`, `createCheckService`, `createPreviewService`, `registerProjectsRpc` |
| `src/daemon/env/index.ts` | `createSecretStore`, `createApprovalService`, `createResourceMonitor`, `createConcurrencyGovernor`, `createIntegrationService`, `createUpdateService`, `registerEnvRpc` |

All factories take `(s: Services)` only (an optional second `options` argument for test injection is allowed).

## 3. Global rules

1. TypeScript strict. No `any` in public signatures (use `unknown` + zod). Imports from shared via `@shared/...`;
   inside the daemon use relative imports.
2. Expected failures throw `NovaError(code, germanMessage, opts)` (`src/daemon/core/errors.ts`) with a code from
   `ErrorCodes` (`src/shared/errors.ts`). Important problems that the user must see are additionally reported via
   `core.errors.report({...})` (answers: what happened, affected task, what was tried, project safe?, auto-fixable?,
   user action). Use `dedupeKey` to avoid spam.
3. Every state change visible in the UI emits the matching event via `core.bus.emit(...)` (see `src/shared/events.ts`).
4. Never log or persist secrets: logs pass through redaction automatically; for data you store yourself
   (agent steps, memory, check output, exports) call `redact()` / `redactString()` from `core/redact.ts`.
5. Time: `core.clock.now()`. IDs: `newId(prefix)` from `core/ids.ts`. JSON columns: `toJson`/`fromJson`.
   DB access: `core.db` (`run/get/all/transaction`). The full schema is in `src/daemon/db/migrations.ts` – use it as is.
6. Never delete or overwrite user files except through the ChangeJournal (agents) or FileService (user edits).
   Never `git reset --hard`, `git clean`, `git push`, `git checkout -- .`, force anything, or rewrite history.
7. Platform: the product targets Windows 10/11. Code must also run on Linux (CI/tests). Branch on
   `core.platform` (inject it in tests), never on hard-coded assumptions. Windows specifics: `cmd.exe /d /s /c` for
   agent commands, PowerShell for the terminal, `taskkill /pid N /T /F` for process trees, paths case-insensitive,
   `\\` separators, `where.exe` to find executables, `%LOCALAPPDATA%`, `%ProgramFiles%`.
8. Child processes: always `windowsHide: true`, never `shell: true` with untrusted string concatenation where an
   argv array is possible (git, ollama, where, nvidia-smi …). Agent/user command lines intentionally go through
   the shell (they are command lines) but only via ProcessManager.
9. Resource friendliness: no busy loops; timers ≥ 1 s; long work async; bounded caches; output tails capped.
10. Tests: vitest, co-located `*.test.ts` next to the code. Use `tests/helpers/core.ts` (`createTestCore`, `tempDir`)
    and `tests/helpers/services.ts` (`makeServices(core, partialFakes)`). Tests must be deterministic, fast
    (< 5 s per file), must not touch the network (except 127.0.0.1 servers you start) and must clean up temp dirs.
11. No placeholders, TODO stubs or fake success. If something cannot work on this platform (e.g. DPAPI on Linux)
    implement it fully for Windows, guard it by platform, and say so in the header comment and your report.

## 4. Module specifications

### 4.1 server (RPC transport)

- `createRpcRouter(log)`: `register(method, handler)`; `handle(req)` validates `method` (`isRpcMethod`), parses params
  with `RpcContract[method].params` (zod; on failure → `VALIDATION` error listing issues in German), calls the handler,
  in non-production (`process.env.NODE_ENV !== 'production'` or tests) validates the result with the result schema and
  logs mismatches (does not fail the call). Maps `NovaError` → `{code, message, details}`; unknown errors → `INTERNAL`
  with German message "Interner Fehler im Hintergrunddienst." and the redacted message in details. Unregistered method
  → `NOT_FOUND`.
- `startRpcServer({ endpoint, token, tokenPath, router, bus, log, version, instanceId })` → `{ close(): Promise<void>, endpoint }`
  (`tokenPath` is used to read the token of an existing daemon when probing on EADDRINUSE).
  - `node:http` server listening on the pipe/socket path. On EADDRINUSE: probe the existing endpoint (`GET /health`
    with the token from the token file); if it answers → throw `NovaError('CONFLICT', 'NOVA läuft bereits …')`; if not
    and the endpoint is a unix socket file → unlink and retry once.
  - Auth: every request needs `Authorization: Bearer <token>` (compare with `crypto.timingSafeEqual`), else 401.
    Requests carrying an `Origin` header are rejected with 403 (browsers must never talk to the daemon).
    Body limit 25 MB; JSON only; method/path whitelist: `POST /rpc`, `GET /events`, `GET /health`.
  - `GET /events`: SSE (`text/event-stream`), one `data: <json NovaEvent>\n\n` per bus event, `: ping` every 15 s,
    unsubscribe on close. Optional query `?types=a,b` filter.
  - `GET /health` → `{ ok: true, pid, version, instanceId }`.
- `token.ts`: `ensureToken(paths)` creates 32 random bytes hex at daemon start (new token per daemon start), written
  atomically (temp + rename) with mode 0o600; `readToken(paths)`.
- `lock.ts`: lock file `<dataDir>/daemon.lock` JSON `{ pid, instanceId, endpoint, startedAt, version }` written after
  listen (`writeLock(paths, info)`); removed on clean shutdown (`removeLock(paths, instanceId)` deletes only if the file
  still belongs to that instance). `readLock(paths)` for clients/diagnostics (null if missing/corrupt).
- `src/daemon/client/daemon-client.ts` – `DaemonClient` used by Electron main, scripts and integration tests:
  `new DaemonClient({ endpoint, tokenPath | token })`, `rpc<M>(method, params, { timeoutMs })` (typed with
  `RpcParams/RpcResult`, throws `DaemonRpcError` with code/message), `health()`, `subscribe(onEvent, onState)` with
  automatic reconnect (exponential backoff 0.5 s → 10 s, re-reads the token file on reconnect because a restarted daemon
  has a new token), `close()`. Uses `http.request({ socketPath })`. No Electron imports (pure Node).
- Tests: router validation/mapping, auth (401/403), SSE delivery + reconnect, EADDRINUSE handling, client typing.

### 4.2 providers (models, Ollama, cloud, budget)

- Built-in `ProviderFactory`s:
  - **ollama**: base URL from provider config (default row `ollama-local`, `http://127.0.0.1:11434`,
    paid=false, approved=true). API: `GET /api/version`, `GET /api/tags`, `POST /api/show {model}` (capabilities,
    model_info `*.context_length`, details), `POST /api/pull {model, stream:true}` (NDJSON: status, digest, total,
    completed; final `{status:"success"}`; `{error}` lines), `DELETE /api/delete {model}`, `GET /api/ps`,
    `POST /api/chat {model, messages, tools, stream:false, options:{num_ctx, temperature, num_predict}, format?}`.
    Ollama tool calls: `message.tool_calls[].function.{name, arguments(object)}` (no ids → generate). Tool results are
    sent as `{role:"tool", content, tool_name}`. Usage: `prompt_eval_count`, `eval_count`. Connection refused →
    `OLLAMA_UNREACHABLE` ("Ollama ist nicht erreichbar. Bitte Ollama starten …"). 404 model not found →
    `MODEL_UNAVAILABLE`.
  - **openai_compatible**: `POST {baseUrl}/chat/completions` (tools as `{type:"function", function:{name, description,
    parameters}}`, tool calls `{id, type, function:{name, arguments:string-json}}`, tool messages
    `{role:"tool", tool_call_id, content}`), `GET {baseUrl}/models`, `Authorization: Bearer <key>`. Usage from `usage`.
    Covers OpenAI, OpenRouter, Groq, Mistral, LM Studio, vLLM … (local servers can be configured with paid=false).
  - **anthropic**: `POST {baseUrl}/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`; system prompt
    as top-level `system`; tools `{name, description, input_schema}`; response content blocks `text` / `tool_use
    {id,name,input}`; tool results as user message with `{type:"tool_result", tool_use_id, content}`; consecutive
    same-role messages must be merged. `GET {baseUrl}/v1/models`. Usage `input_tokens`/`output_tokens`.
  - HTTP errors: 401/403 → `PROVIDER_AUTH`, 429 → `PROVIDER_RATE_LIMIT` (retryable), 5xx/network → `PROVIDER_ERROR`
    (retryable), abort → `CANCELLED`. All requests honour `AbortSignal` and `settings.agents.modelTimeoutSec`.
    API keys only in headers, never in URLs/logs.
- **ProviderRegistry** (table `providers`, `model_profiles` for cached ModelInfo + user pricing). API keys via
  `SecretStore` id `provider:<id>`. `hasApiKey` = `secrets.has(...)`. Emits `provider.updated`. Removing the
  `ollama-local` row is not allowed (disable instead).
- **ModelClient**: exactly the contract semantics. Paid models need: provider.paid → provider.approved === true AND
  pricing known (user-entered via `models.setPricing`, otherwise `PRICE_UNKNOWN`) AND budget allows AND paid work not
  paused. Additionally, when `settings.network.approveCloudProjectData` is true, sending project data to a paid/cloud
  provider for a project requires a `sensitive_data` approval (subject = `cloud:<providerId>`; ApprovalService
  'always' rules make this a one-time decision per project). Estimate input tokens as `ceil(chars/3.5)`.
  Fallback only to candidates in the configured chain. After a budget stop with `budgets.fallbackToLocal`, continue
  with the next approved local model; if none → `NO_MODEL` with German explanation. Record usage for every call
  (`costEstimated` = pricing.estimated or tokens estimated). Emit `budget.updated` after recording paid usage.
  If no model is configured at all, `NO_MODEL` message explains how to pick one in "Modelle".
- **BudgetService**: limits from `settings.budgets` (0 = no paid usage allowed; null = unlimited), per project from
  `project.config.monthlyBudgetUsd`. Day/month boundaries local time (`core/time.ts`). On reaching a limit:
  `pausePaid(reason)` (persist in table `meta` key `budget_paid_paused`), notification (category blocker), error report
  `BUDGET_EXCEEDED`. Warn once per day at `warnAtRatio`. `resumePaid()` clears the pause (explicit user action).
- **OllamaService**: `status()` combines API reachability + binary detection (`where ollama` / default path
  `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`; on other OS `which ollama`) and a German message with the fix
  (install from https://ollama.com/download or `winget install Ollama.Ollama`, start Ollama). `pull()` streams
  progress events, supports cancel (AbortController), at most 2 concurrent pulls, emits `ollama.models.changed` when
  done. `delete()` emits `ollama.models.changed`. `fit(model)`: required ≈ model size × 1.2 (+ KV cache estimate from
  num_ctx), available = free VRAM of the largest GPU from `resources.latest()`; `estimated: true` when GPU numbers are
  estimates; alternatives = installed models (completion-capable) that fit, smallest first.
- `tests/fakes/fake-ollama.ts`: `startFakeOllama(opts)` → `{ url, close(), requests: {method, path, body}[],
  setModels(list), queueChat(response | (req)=>response), pullScript(model, events[]) }` implementing all endpoints
  above with realistic payloads (incl. `capabilities: ["completion","tools"]`). Used by integration tests too.
- RPC: providers.*, models.*, ollama.*, budget.* per `src/shared/rpc.ts`.

### 4.3 tools (sandbox, files, processes, terminal, agent tools)

- **PathGuard**: normalizes, resolves against project root, follows symlinks of the deepest existing ancestor
  (`fs.realpathSync.native`), case-insensitive comparison on Windows, rejects `..` escapes, absolute paths outside,
  UNC/device paths (`\\?\`, `\\.\`), NUL bytes, alternate data streams (`file.txt:stream`), reserved names
  (CON, PRN, AUX, NUL, COM1–9, LPT1–9). Protected (no agent writes): `.git/**`, `.nova/**` (reserved), anything inside
  the NOVA data dir.
- **ChangeJournal** (table `changes`, blobs in `<dataDir>/snapshots/<aa>/<sha256>`): before writing, store the old
  content blob (if file existed) and its hash; write atomically (temp file in same dir + rename, retry rename on
  Windows EPERM/EBUSY up to 5× with backoff); record `create|modify|delete`. Skip journal entry when content is
  unchanged. Emit `files.changed`. `revert()` exactly as in the contract; restoring a `create` deletes the file;
  restoring a `delete` recreates it from the blob; each reverted change is marked `reverted=1`; reverts themselves are
  journaled with actor `nova` and `task_id = null` so a restore can be undone through the pre_restore checkpoint.
- **FileLockService** (table `file_locks`).
- **CommandPolicy**: decision order: (1) hard block list (format, diskpart, `rm -rf /`, `del /s` on drive roots,
  `Remove-Item -Recurse` on paths outside project, `shutdown`, `reg add/delete`, `bcdedit`, `cipher /w`, `vssadmin`,
  fork bombs, `curl|wget … | sh/iex`, `Set-ExecutionPolicy`, `netsh`, `sc config/delete`, `schtasks /create`, writing to
  `C:\Windows`) → `block`; (2) admin indicators (`runas`, `sudo`, `Start-Process -Verb RunAs`) → `approve/admin`;
  (3) global installs/system changes (`npm i -g`, `pip install` without venv/`--user`? → approve `system_change`,
  `winget/choco/scoop install` → `install`, `setx`, PATH edits) → approve; (4) publish (`git push`, `npm publish`,
  `docker push`, `scp`, `curl -T/--upload-file/-F`) → `publish`; (5) destructive deletes inside the project
  (`rm -r`, `rmdir /s`, `del /s`, `Remove-Item -Recurse`, `git clean`, `git reset --hard`, `git checkout -- .`) →
  `delete`; (6) command matches `settings.permissions.commandAllowlist` or `project.config.allowedCommands` prefixes
  (whole-word prefix match after normalizing whitespace; chained commands `&&`, `||`, `;`, `|` are split and EVERY part
  must be allowed) → `allow`; (7) else `approve/command` if `approveUnknownCommands`, otherwise allow. Network-only
  commands when `allowAgentNetwork=false` (`curl`, `wget`, `Invoke-WebRequest`, `npm install`…) → approve `network`.
- **ProcessManager** (table `processes`): spawn via shell (`cmd.exe /d /s /c "<line>"` with `windowsVerbatimArguments`
  on Windows, `/bin/sh -c` elsewhere), `detached: true` on POSIX (process group), env = process env minus secret-like
  vars (`*_API_KEY`, `*_TOKEN`, `*_SECRET`, `*PASSWORD*`, `ANTHROPIC_*`, `OPENAI_*`, `NOVA_*`) plus `input.env`,
  `CI=1`, `FORCE_COLOR=0`, `NO_COLOR=1`. Timeout → kill tree, `timedOut: true`. Abort → kill tree, `cancelled: true`.
  Output: keep tails (default 1 MB per stream), emit `process.output` (throttled ≥ 100 ms batches) and
  `process.updated`. Respect `governor.canStartProcess()`: when false, wait (poll 1 s, honour abort) up to the timeout.
  Kill tree: Windows `taskkill /pid <pid> /T /F`; POSIX `process.kill(-pid, 'SIGTERM')`, then SIGKILL after 3 s.
  `recoverOrphans()`: rows with status running and another instance_id → if pid alive and (Windows:
  `tasklist /FI "PID eq N" /FO CSV /NH` image matches; POSIX: `/proc/<pid>/cmdline` or `ps -p`) contains the command's
  first token → kill tree; mark `orphaned`. Return count.
- **TerminalService**: per-line execution: Windows `powershell.exe -NoLogo -NoProfile -NonInteractive -Command <line>`,
  others `bash -lc` (fallback `sh -c`). `cd <dir>` / `Set-Location` / `cd ..` handled internally (stays inside the
  project, otherwise message). `cls`/`clear` → system output "\u001bc". Output via `terminal.output`, end via
  `terminal.exit`. One running line per session (others rejected with accepted=false while busy). `interrupt` kills
  the line's tree. Uses ProcessManager with kind `terminal` (user action → no CommandPolicy).
- **FileService**: tree (skip `node_modules`, `.git`, `dist`, `out`, `build`, `Library`, `Temp`, `obj`, `bin`,
  `.venv`, `__pycache__` beyond depth 1 – show them but do not descend; mark `changedByNova` from journal and
  `gitStatus` from `git.status` when repo), read (max 2 MB, binary detection by NUL bytes in first 8 KB, Monaco
  language guess by extension), write (user edit via journal actor `user`, expectedHash conflict check), search (plain
  or regex, case flag, skip binary/large > 1 MB files and ignored dirs, max results, 1-based line/col, preview ≤ 200
  chars), changed (journal + git status merged), history, diff (before = snapshot before the first non-reverted NOVA
  change of that file (or of taskId), after = current content; unified diff generated in-house – implement a small
  Myers/LCS line diff, no dependency).
- **Agent tools** (`src/daemon/tools/agent-tools/*.ts`, registered by `createToolRegistry(s)`), all paths
  project-relative, results compact (truncate large outputs with a note), German `describe()`:
  - `list_files {path=".", depth=2}` (all roles), `read_file {path, startLine?, endLine?}` (≤ 400 lines per call,
    line-numbered), `search_files {query, path?, regex?}` (all roles)
  - `write_file {path, content}` (coder, tester), `edit_file {path, oldText, newText, replaceAll?}` (exact match; error
    with nearest-match hint if not found / ambiguous), `delete_file {path}` (coder; approval kind `delete` when
    `permissions.approveDeletes`) – all writes: PathGuard → protected check → FileLockService.acquire (on conflict
    return error `FILE_LOCKED` "Datei wird gerade von Aufgabe … bearbeitet") → ChangeJournal (actor nova, taskId, runId)
    → `tasks.addFiles`. Writes outside the project are never possible (PATH_OUTSIDE_PROJECT error).
  - `run_command {command, timeoutSec?}` (coder, tester): CommandPolicy → block → error; approve →
    `approvals.check` (subject = normalized command) → pending → `approval_required`; denied → error "Vom Benutzer
    abgelehnt" and acknowledge; approved → run via ProcessManager (cwd project root, kind command, task's signal),
    consume once-approval; result = exit code + output tail (≤ 8000 chars).
  - `run_checks {kind: "test"|"build"|"lint"}` (coder, tester, reviewer): `checks.run(...)`, returns status, counts,
    failures, output tail.
  - `git_diff {path?}` (reviewer, coder): diff of the task's changed files (`files.diff` for each of task.files) or git
    diff when no task files.
  - `memory_search {query}` (all roles), `memory_note {kind, title, content}` (all roles; respects
    `memory.agentsMayWrite`; shareable only for kind insight).
  Terminal tools (`finish`, `submit_plan`, `submit_review`) belong to the agents module.
- RPC: files.*, processes.*, terminal.*.

### 4.4 agents (runtime and roles)

- **RunStore** (tables `agent_runs`, `agent_steps`; conversation state JSON in `agent_runs.state`; if > 2 MB, write it
  to `<dataDir>/run-state/<runId>.json` and store a reference). Emits `run.updated`, `run.step` (step data redacted and
  truncated to 8 KB).
- **AgentRunner.run()** loop:
  1. Create run (or load state for resume). Resolve model via `models.resolve(role, {projectId, preferred})`.
  2. Build messages: system prompt from the role module (project facts: name, kind, technologies, path, platform/shell,
     commands, conventions; task title/description/acceptance; memory context `memory.contextFor`; extraContext;
     strict rules: stay in the project, small verified changes, call the finish tool when done, never invent results,
     report blockers honestly) + user message with the task.
  3. Each step: check `signal.aborted` → cancelled; `pauseRequested()` → save state, status paused; call
     `models.chat` with the role's tool specs. **Native tools** if `supportsTools`, else **JSON protocol**: tools are
     described in the system prompt and the model must answer with exactly one JSON object
     `{"tool": "<name>", "arguments": {...}}` (parse the first balanced JSON object in the text, also inside ```json
     fences; on parse failure send a correction message; 3 consecutive failures → failed `AGENT_BAD_OUTPUT`).
  4. Execute tool calls sequentially through the ToolRegistry (validate args with the tool's zod schema; validation
     errors go back to the model as tool errors). Persist the conversation state after every step. Record steps:
     model_call (model, tokens), tool_call (German describe), tool_result (short), errors.
  5. `approval_required` → save state with the pending tool call, run/task status waiting_approval, return. On resume
     the pending call is executed again (approval now resolved; if denied the tool returns the denial).
  6. Finish tool → validate with the role's output schema (on failure: tell the model what is wrong, up to 2 retries)
     → done. A text answer without tool calls in native mode → remind the model to use tools/finish (max 3 times).
  7. Step limit `settings.agents.maxStepsPerRun` → blocked `AGENT_STEP_LIMIT`. Context management: when the estimated
     prompt exceeds 75% of the model context, compact old tool results (keep the last 6 messages verbatim, replace older
     tool results with "[gekürzt: <first 200 chars>]").
  8. Model errors: NO_MODEL / BUDGET_EXCEEDED / PAID_NOT_APPROVED / PRICE_UNKNOWN → blocked (state saved so it can
     resume later); retryable provider errors → up to 3 retries with backoff (1 s, 4 s, 10 s) then failed.
  9. Update `run.lastAction` (German) on every tool call; `run.files` from tool results.
- **Role modules** (exchangeable, `registerRole`): planner (tools: list/read/search/memory_*, finish tool
  `submit_plan` → PlanOutputSchema; must inspect the project before planning; small tasks with acceptance criteria;
  ≤ 15 tasks), coder (read/write/edit/delete/search/run_command/run_checks/git_diff/memory_*, finish tool `finish` →
  CoderOutputSchema), tester (read/search/run_checks/run_command/write/edit/memory_*, finish `finish` →
  TesterOutputSchema; must actually run the checks; must not fake results), reviewer (read/search/git_diff/run_checks/
  memory_*, finish `submit_review` → ReviewOutputSchema; reviews correctness, security, incomplete work, regressions).
  System prompts in English; they must instruct the model to write German summaries for the user.
- RPC: agents.roles, agents.runs, agents.steps.

### 4.5 orchestrator (tasks + work cycle)

- **TaskService** (table `tasks`; `failure_signatures` column internal). Role default by kind: plan→planner,
  code/fix/build/custom→coder, test→tester, review→reviewer. `dependsOn` must reference tasks of the same project and
  must not create cycles (VALIDATION). Delete only when not running (also deletes runs via cascade, expires approvals,
  releases locks). Emits `task.updated` / `task.removed`.
- **WorkCycle** – a scheduler loop (`startLoop`, tick every 1 s and on relevant events: task/approval/settings/
  resources changes). Global state running/paused/stopped persisted in table `meta` (`work_state`); per-project
  `project.workEnabled`. Only projects with workEnabled and global state running get new runs.
  1. Pick ready tasks (all `dependsOn` done; dependency failed/cancelled → task blocked with explanation) by priority.
  2. Concurrency: `governor.allowed().allowed` total parallel runs; at most 1 run per task.
  3. Before a run (non-planner): checkpoint `pre_task` (if `backup.checkpointBeforeTasks`).
  4. `agents.run(...)` with an AbortController per run and pause flags. Status mapping from the outcome.
  5. Planner done → create tasks from the plan (map keys to ids, add dependency on nothing else; source planner) if
     `agents.autoCreatePlannedTasks`, store plan memory entries (`memory.add`, source agent), task done.
  6. Coder done → verification: if `project.config.testAfterChange` and a test command exists → `checks.run(test)`;
     build command and kind web/desktop/backend → `checks.run(build)` first. If `reviewChanges` → reviewer pass (run
     the reviewer role as a separate agent run on the same task context, or create a review task that blocks
     completion – choose one, document it). Verification status from REAL results only: all passed → passed; any
     failure → failed; no checks available → `unavailable` (UI shows "nicht geprüft").
  7. Failed verification → if attempts < maxAttempts: compute failure signature (check.failureSignature or review
     findings hash); if the same signature occurred `agents.maxIdenticalFailures` times in a row → instruct the next
     attempt to take a different approach (extraContext lists previous attempts) and on the next identical failure
     block with `REPEATED_FAILURE` (German explanation + error report). Otherwise re-run the coder with extraContext
     (test failures/review findings), attempts++. When attempts are exhausted → failed + error report + notification.
  8. Success → `checkpoints.afterTask(task)` (commit if configured), memory entries (task_status, test_result), errors of
     the task resolved, notification task_done, task done.
  9. Approvals: `approvals.onDecision` → re-queue/resume waiting runs (resumeRunId). Denials are handled inside the
     tool (agent sees the denial).
  10. Pause (task/project/global): sets pause flags; runs stop at the next step boundary (state saved). Resume →
      resumeRunId. Stop → abort controllers, `processes.killTask`, task cancelled (stopTask) or re-queued
      (work.stop keeps tasks `queued` but global state stopped), locks released.
  11. Idle: when nothing can run, compute a German `idleReason` ("Keine offenen Aufgaben", "3 Aufgaben warten auf
      Freigabe", "Kein Modell verfügbar – bitte in 'Modelle' eines auswählen", "Arbeit pausiert", "Ressourcenlimit:
      CPU 92 %") – never create work on its own.
  12. `recover()` on startup: `runs.markInterrupted()`, tasks with status running → interrupted; locks released; if
      `background.resumeAfterRestart` → interrupted tasks re-queued with resume of the saved state (status queued, the
      runner resumes the interrupted run). Paused/waiting tasks stay as they are.
  13. Emits `work.status` on changes; blocked tasks report errors (dedupe per task).
- RPC: tasks.*, work.*, errors.*, dashboard.summary (aggregates from all services; must not fail when a sub-source
  fails – use null/empty values for that part).

### 4.6 git (git, checkpoints, backups, export/import)

- **GitService**: uses `git` via `execFile` with argv arrays (path from `integrations.resolvePath('git')`, fallback
  `git`), `-c core.quotepath=off`, env `GIT_TERMINAL_PROMPT=0`, timeouts. `status` parses `--porcelain=v1 -b -z`.
  `diff` builds FileDiff with original (from `git show <ref|HEAD>:<path>`) and modified (working tree) and unified
  text (`git diff`). `commitPaths` uses `git add -- <paths>` and `git commit -m <msg> --no-verify? NO (respect hooks)`
  with author from git config; if no identity configured, use `-c user.name="NOVA AI" -c user.email="nova@localhost"`
  for that commit only. Commit messages: `NOVA: <task title>`. `clone` with `--depth 50`? (full clone is safer for
  history; use full) and abort support. Never push.
- **CheckpointService** (table `checkpoints`): `create` stores git HEAD (if repo) and `journal.maxId(projectId)`.
  `restore({checkpointId})` reverts all NOVA changes with id > changeCursor; `restore({taskId})` reverts the task's
  changes. Always creates a `pre_restore` checkpoint first, returns conflicts (files the user changed afterwards are
  left untouched), commits restored files with message `NOVA: Wiederherstellung <label>` when `commit` and repo.
  `afterTask` commits `task.files` when autoCommit (project config, default from settings.agents.autoCommit) and
  (verification passed or (`commitOnlyWhenVerified` false and not failed)); returns a `post_task` checkpoint.
- **BackupService** (table `backups`, files under `<dataDir>/backups/`): database backups via `db.backupTo()`
  (`nova-YYYYMMDD-HHMMSS-<reason>.db`), retention by count and days, daily backup, project snapshot copy (skip
  node_modules, .git, out, dist, build, Library, Temp, obj, bin, .venv; max 2 GB, abort beyond with error), export JSON
  `{ format: "nova-export", version: 1, exportedAt, sections: {...} }` – NEVER includes secrets or API keys
  (providers exported without keys), import merges (skip existing ids, report counts/warnings, validate with zod).
- RPC: git.*, checkpoints.*, backup.*, data.*.

### 4.7 memory

- **MemoryService** (table `memory_entries` + FTS5 `memory_fts`): FTS query building (escape quotes, prefix match
  `term*`, OR of terms, bm25 ranking, snippet via `snippet()`), fallback LIKE search when the FTS query is empty.
  Redact content on write; reject entries whose content is mainly a secret. `contextFor`: always include goals,
  requirements, conventions, decisions of the project (most recent first), then FTS matches for the query, then (if
  `memory.useGlobalKnowledge`) shareable global entries (projectId null, shareable=1) and shareable `insight` entries of
  OTHER projects – never non-shareable entries of other projects. Limit `memory.maxContextEntries`. When
  `memory.enabled` is false: contextFor returns [], agent writes are ignored (return the would-be entry with id "" is
  NOT allowed – throw VALIDATION "Gedächtnis ist deaktiviert").
- Export/import JSON (`<dataDir>/exports/memory-<project|global>-<ts>.json`). Emits `memory.updated`.
- RPC: memory.*.

### 4.8 projects (projects, templates, detection, checks, preview)

- **ProjectService** (table `projects`; `path_key` = normalized absolute path, lower-case on Windows). `create`:
  - `template`/`description`/`wizard`: target dir = `input.path` or `<projectsDir>/<safe name>` (projectsDir from
    settings.general or `<home>/Documents/NOVA Projekte`); the dir must not exist or be empty (else VALIDATION);
    template chosen explicitly or derived from kind/technologies/description keywords (German + English keywords:
    "browser", "spiel", "game", "web", "unity", "api", "backend", "desktop", "windows" …; default web); scaffold; git init
    + initial commit (via GitService) if `initGit` and git available; requirements/answers → memory (requirement/goal).
  - `open`: existing folder, detect kind/config; never modifies files.
  - `import`: `git.clone(repoUrl, target)`, then like open.
  - If `planNow` and description non-empty → `work.planGoal(project.id, description)`; return `planTaskId`.
  - Warnings (German) for missing tools (template requiredTools vs integrations).
- **ProjectSummary**: progress = done / (all − cancelled) × 100 (0 when no tasks), counts, open errors, last build/test
  check, last activity.
- **Templates** (`src/daemon/projects/templates/*`, all scaffold WITHOUT network; real, runnable starter code + README
  in German + .gitignore):
  1. `web-game` – Browserspiel (Vite-free: plain HTML/CSS/JS canvas game loop in ES modules, `index.html`,
     `src/game.js`, `tests/game.test.mjs` using `node --test`, package.json scripts `test: node --test`,
     `dev: node server.mjs` (tiny static server on 127.0.0.1 with port from env PORT or 5174, prints its URL), preview
     kind browser-dev-server).
  2. `web-app` – Webanwendung (same zero-dependency approach: static SPA + `server.mjs` + `node --test` tests).
  3. `unity` – Unity-Projekt: `Assets/Scripts/<Name>Game.cs` (MonoBehaviour), `Assets/Tests/EditMode/…` with asmdef,
     `Packages/manifest.json` (com.unity.test-framework), `ProjectSettings/ProjectVersion.txt` is NOT created (Unity
     creates it), `.gitignore` (Unity), README explaining how to open it in Unity Hub. Commands: test =
     `"<UnityPath>" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults
     TestResults/editmode.xml -logFile -` only when Unity is detected (via integrations) else null; preview kind
     engine-external.
  4. `desktop-electron`? NO npm installs allowed at scaffold time → `desktop-dotnet` – Windows-Desktop-Anwendung (WPF,
     .NET 8): `App.xaml`, `MainWindow.xaml(.cs)`, `.csproj`, tests project with xUnit? (needs NuGet restore at build
     time – acceptable, commands `dotnet build` / `dotnet test`), preview kind desktop-run (`dotnet run`).
  5. `backend-api` – Backend/API (Node built-ins only: `node:http` JSON REST API + `node:sqlite` storage + `node --test`
     tests; `dev: node server.mjs`), preview browser-dev-server (shows JSON / a tiny HTML index).
  6. `godot` (optional, engine-external) and `empty` (generic, only README) – implement if time permits; minimum 1–5.
- **ProjectDetector**: package.json (scripts test/build/dev/start/lint, deps → technologies: react, vue, svelte, vite,
  electron, express, fastify, next …), Unity (`Assets/` + `ProjectSettings/`), Godot (`project.godot`), Unreal
  (`*.uproject`), .NET (`*.csproj`/`*.sln`, WPF/WinForms detection via `UseWPF`/`UseWindowsForms`), Python
  (`pyproject.toml`, `requirements.txt`, pytest), static web (`index.html`). Returns ProjectConfig with sensible
  commands (null when unknown) and preview kind.
- **CheckService** (table `check_runs`): runs the configured command via ProcessManager (kind test/build, cwd root,
  timeout from settings), parses results: vitest/jest (`Tests  3 passed | 1 failed`), node --test (`# pass N`,
  `# fail N`), pytest (`N passed, M failed`), dotnet test (`Passed!  - Failed: 0, Passed: 5`), mocha, Unity XML
  results file (NUnit `test-run` attributes), tsc errors (`file(line,col): error TS…`), generic `file:line:col` errors →
  failures with file/line. Status: exit 0 → passed (if counts show failures → failed), non-zero → failed, spawn error →
  error, no command → not_run with message. failureSignature = sha1 of sorted (file + first failure line) list.
  Emits `check.updated`. Output tail ≤ 200 lines redacted.
- **PreviewService**: browser-dev-server → start project dev command via `processes.start` (kind preview), wait for URL
  (pattern `https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\S*`, 60 s), only loopback URLs accepted; browser-static →
  built-in static file server on 127.0.0.1 random port serving the project dir (path traversal safe, no directory
  listing outside, `Cache-Control: no-store`), reloadToken bumps on `files.changed` (debounced 300 ms);
  desktop-run → runs the run/dev command on request (external window), state running while process lives;
  engine-external/none → `unsupported` with German explanation (e.g. "Unity-Projekte werden in Unity geöffnet …").
  Emits `preview.updated`. `stopAll` on shutdown.
- RPC: projects.*, templates.list, checks.*, preview.*.

### 4.9 env (secrets, approvals, resources, integrations, updates)

- **SecretStore** (table `secrets`): Windows → DPAPI via
  `powershell.exe -NoProfile -NonInteractive -Command <script>` with the plaintext passed on **stdin** (never argv),
  `[System.Security.Cryptography.ProtectedData]::Protect(bytes, entropy, CurrentUser)` (Add-Type System.Security),
  base64 in/out; macOS → `security add-generic-password -U -s "NOVA AI" -a <id> -w <value>`? (argv exposure – use
  `-w` from stdin is not supported; acceptable on macOS dev only, document); Linux → `secret-tool store/lookup` if
  available (value via stdin), else `aes-local`: AES-256-GCM with a random key in `<dataDir>/secret.key` (mode 0600),
  `secure=false`. `createSecretStore(core, { platform, forceScheme? })`; a `memory` scheme for tests. Decrypted values
  are registered with the redactor. Values never logged.
- **ApprovalService** (tables `approvals`, `approval_rules`): exactly the contract semantics; fingerprint =
  sha256(kind|projectId|normalized subject). Creating a pending approval emits `approval.updated` and a notification
  (category approval, German title). `decide(always)` creates a rule. `waitFor` resolves on decision.
- **ResourceMonitor**: CPU % from `os.cpus()` deltas, memory from `os.totalmem/freemem` (on Linux prefer
  MemAvailable from /proc/meminfo), disks via `fs.statfsSync` for the data dir and each active project's drive,
  GPU: (1) `nvidia-smi --query-gpu=name,utilization.gpu,memory.total,memory.used --format=csv,noheader,nounits`
  (Windows default path `C:\Windows\System32\nvidia-smi.exe` or `%ProgramFiles%\NVIDIA Corporation\NVSMI\nvidia-smi.exe`);
  (2) Windows any vendor: one long-lived PowerShell process sampling `Get-Counter '\GPU Engine(*engtype_3D)\Utilization
  Percentage','\GPU Adapter Memory(*)\Dedicated Usage'` every 5 s + VRAM total from registry
  `HKLM:\SYSTEM\ControlSet001\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0*` `HardwareInformation.qwMemorySize`
  (adapter names from `DriverDesc`), mark source accordingly; (3) otherwise `gpuNote` explains why there are no values.
  Never fake values. Ollama loaded models via `ollama.running()` (every 10 s, errors ignored). Daemon RSS/CPU from
  `process.memoryUsage()`/`process.cpuUsage()`. Ring buffer of 2 h. Emits `resources.snapshot` every sample.
- **ConcurrencyGovernor**: if `resources.adaptive`: CPU > maxCpuPercent or free RAM < minFreeRamMb → allowed =
  max(0, activeRuns) (no new starts) with German reason; free RAM < minFreeRamMb/2 → 0 new starts; else configured.
  Processes: `processes.runningCount() < resources.maxProcesses`.
- **IntegrationService** (table `integrations` for manual paths + last status): detection for every `IntegrationId`
  (version commands with timeouts: `git --version`, `node --version`, `npm --version` (npm.cmd on Windows), `python
  --version`/`py -3 --version`, `dotnet --version`, `powershell -NoProfile -Command $PSVersionTable.PSVersion.ToString()`
  / `pwsh`, `wt.exe` presence (`%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe`), `ollama --version`, Unity Hub editors
  (`%ProgramFiles%\Unity\Hub\Editor\*\Editor\Unity.exe`, newest version first; also secondaryInstallPath from
  `%APPDATA%\UnityHub\secondaryInstallPath.json`), Unreal (`%ProgramFiles%\Epic Games\UE_*\Engine\Binaries\Win64\
  UnrealEditor.exe`), Godot (PATH `godot`, `godot4`, `%LOCALAPPDATA%\Programs\Godot*`, manual), VS Code (`code`),
  Playwright (`npx playwright --version` is slow → check `node_modules/.bin`? report "projektabhängig"), winget
  (`winget --version`)), German messages and install hints (`winget install --id Git.Git -e`, `OpenJS.NodeJS.LTS`,
  `Python.Python.3.12`, `Microsoft.DotNet.SDK.8`, `Microsoft.PowerShell`, `Microsoft.WindowsTerminal`,
  `Ollama.Ollama`, `Unity.UnityHub`, `GodotEngine.GodotEngine`, `Microsoft.VisualStudioCode`; Unreal → Epic launcher
  URL). Cache results 10 min. `requestInstall` creates an `install` approval (subject = the winget command); after
  approval the installation runs via ProcessManager (no admin elevation from NOVA; winget may show its own UAC prompt –
  say so in the approval consequences) and the status is refreshed. Emits `integrations.updated`.
- **UpdateService**: if `updates.feedUrl` empty → message "Keine Update-Quelle eingerichtet."; else fetch JSON
  `{version, url, notes}` (10 s timeout), compare semver with `core.version`, never downloads/installs anything.
- RPC: approvals.*, resources.*, integrations.*, updates.check.

## 5. Integrator responsibilities (app.ts)

Wiring order: core → secrets → providers/budget/models/ollama → tools/journal/locks/policy/processes/terminals/files
→ memory → git/checkpoints/backups → projects/templates/detector/checks/preview → approvals/resources/governor/
integrations/updates → agents/runs/tools registry → tasks/work. Startup: migrations (DB backup before migrating an
existing DB), `providers.ensureDefaults()`, `processes.recoverOrphans()`, `work.recover()`, `resources.start()`,
`backups.maybeDailyBackup()`, RPC server, `work.startLoop()`. Shutdown (signal, `daemon.shutdown`, uncaught error):
stop accepting work → `work.shutdown(10 s)` → `preview.stopAll()` → `terminals.closeAll()` → `processes.shutdown()` →
`resources.stop()` → close server → `db.close()` → remove lock → exit 0. Crash safety: `uncaughtException` logs,
reports a critical error, attempts graceful shutdown.

---------------------------------------------------------------------------------------------------------------------

## 6. Binding amendments after the contract review (OVERRIDE §1–§5 where they differ)

Three independent reviews found 101 issues. The decisions below are binding. `src/shared/*` and
`src/daemon/contracts.ts` already reflect them; read the doc comments there.

### 6.0 Global

1. **Honest limits (state them in code headers, UI texts and README; never promise more):**
   (a) Agent commands, checks, previews and git hooks run with the user's Windows rights. Approvals cover recognised
   commands only, not code inside projects. There is no OS sandbox (no native code).
   (b) The command block list is best effort. cmd.exe expansion makes complete detection impossible. Only one thing is
   guaranteed: auto-allow requires a line without metacharacters.
   (c) allowAgentNetwork=false cannot block connections opened by programs or tests.
   (d) DPAPI protects keys against other Windows users and offline disk access. It does not protect against processes
   of the same user, including commands that NOVA runs.
   (e) PathGuard cannot prevent TOCTOU swaps. It prevents model mistakes.
   (f) Without a UI, Windows may terminate the daemon at logoff or shutdown. State stays consistent (WAL plus journal),
   and running commands count as interrupted.
   (g) Local administrators can read the token and the database.
   (h) Costs are estimates when the provider returns no usage or a call is aborted (booked at the estimated maximum).
   (i) After a Windows restart, tasks resume only once NOVA is started (autostart is optional).
   UI sentence: "NOVA fragt vor bekannten riskanten Befehlen nach. Projektcode, Tests und Build-Skripte, die ein Agent
   geschrieben hat, laufen jedoch mit den Rechten des Windows-Kontos und können technisch nicht eingeschränkt werden."
2. Core helpers are mandatory. Use `buildChildEnv()` for every child process, `execTool()`, `findExecutable()` and
   `runPowerShell()` for tools with argv, `atomicWriteFile()`, `renameWithRetry()` and `unlinkWithRetry()` for files,
   `isLocalEndpoint()` and `assertHostAllowed()` for network, and `maskSecretFile()`/`redactString()` for secrets.
   Never call `spawn` with `shell:true`. Never parse localized OS text: use exit codes, CSV/JSON
   (`ConvertTo-Json`), porcelain formats and `LC_ALL=C`. Every daemon PowerShell script runs through `runPowerShell`
   (UTF-8, no progress records, `-EncodedCommand`).
3. Directory walkers never follow symlinks or junctions. Use `readdir({withFileTypes:true})` or `lstat`, and list such
   entries as dirs with `children = null`.
4. Redaction on store covers task results, approval title/action/consequences/details (the fingerprint uses the raw
   subject), process commands, check output and agent steps. The ToolRegistry redacts every tool result before it
   reaches a model. Notification bodies never include command lines, paths or file content.
5. Every service with history implements `prune(olderThanMs)`. The integrator runs a maintenance timer at start and
   every 24 h: backups, retention, `journal.pruneSnapshots`, all prunes with `diagnostics.historyRetentionDays`,
   `PRAGMA optimize`, and VACUUM when freelist/page_count > 0.2.
6. Long work runs inside `core.operations.run({kind,title,projectId}, fn)`. This covers clone, project snapshot,
   export/import, memory export/import, restore, installs and diagnostics. Report progress and honour
   `ctx.signal`. RPC result types stay unchanged. `checks.run` returns immediately with status running.

### 6.1 server

- **Startup order (integrator, app.ts):** canonicalize the data dir, then `acquireInstanceLock` BEFORE opening the
  DB. If the lock is held: read the existing token, probe `/health` with a nonce proof, exit 3, and touch NOTHING.
  Next: apply restore-pending, open/migrate the DB, `journal.recoverPending`, `recoverOrphans`, `work.recover`,
  backups, resources. Generate the token in memory, bind the endpoint, write the token atomically, then the lock file.
- **Auth:** `GET /health` accepts `X-Nova-Nonce: <32 hex>` without Authorization and returns
  `{ ok, pid, version, instanceId, proof: HMAC-SHA256(token, nonce) }`. DaemonClient verifies the proof on every
  (re)connect before it sends the token. On a mismatch it fails with DAEMON_UNAVAILABLE: "Der Kommunikationskanal wird
  von einem fremden Programm belegt. Bitte den PC neu starten." Compare tokens with
  `timingSafeEqual(sha256(a), sha256(b))`, so differing lengths never throw. Wrap every request handler and SSE writer
  in try/catch (500). The body limit is enforced while streaming (destroy at 25 MB, 413).
- **close():** stop accepting connections, `res.end()` every SSE response, `server.closeAllConnections()`, resolve.
- **SSE:** end a connection when `res.writableLength` exceeds 4 MB (the client reconnects). Coalesce
  process/terminal output per stream every 100 ms. Cap event data at 64 KB with "[… gekürzt]". Allow at most 16
  connections (429). Set `headersTimeout` 10 s and `requestTimeout` 60 s for /rpc; /events has no timeout.
- **DaemonClient:** on 401, re-read the token file and retry once. Default RPC timeout 120 s, and 30 min for
  `projects.create`, `backup.*`, `data.*`, `memory.export/import`, `checkpoints.restore`, `integrations.install`.

### 6.2 providers

- The Ollama endpoint is the `ollama-local` provider row only; the settings no longer have `ollamaBaseUrl`.
  `ollama.status({baseUrl})` tests a candidate URL.
- `upsert` merge semantics are defined in the schema doc. Provider ids match `^[a-z0-9][a-z0-9-]*$`. Options must not
  contain secrets. `options.authHeader` sends the stored key under another header (Azure `api-key`). A non-local
  baseUrl must use https.
- Local versus cloud is decided only by `isLocalEndpoint(baseUrl)`. For non-local providers, ModelClient deep-redacts
  all message contents and tool arguments. The sensitive_data approval (subject `cloud:<providerId>`) applies to every
  non-local provider when `approveCloudProjectData` is on, paid or not. ModelClient never calls `consume` for it. A
  'once' approval is valid for the whole task and expires with the task.
- **Budget:** `reserve()` → send with `max_tokens` = reserved output → `record(usage, reservationId)`. After an abort,
  timeout, 5xx or network error AFTER the request was sent, record estimated input + maxOutputTokens with
  costEstimated=true. On success without usage, estimate output as `ceil(chars/3.5)`. Never record 0 for a paid call.
  `release()` only applies when the request provably never reached the provider. A project limit pauses only that
  project.
- When a budget stop happens, create an approval of kind `paid_model` with subject `budget:resume`. Approving it calls
  `budget.resumePaid()`. Wire this via `approvals.onDecision` in the providers module.
- VRAM: local candidates are checked with `ollama.fit(model, min(numCtx, contextLength))`, cached for 60 s. A candidate
  with fits===false is rejected and the next one is tried. If none is left, throw VRAM_INSUFFICIENT with alternatives
  and an error report.
- Rate limits: `options.maxConcurrent` and `options.maxRequestsPerMinute` per provider (semaphore + token bucket).
  On 429 honour Retry-After (at most 120 s) within the retry budget.
- `lastHealth()` and `ollama.lastStatus()` are caches. `dashboard.summary` never triggers network calls.

### 6.3 tools

- **PathGuard:** use the exact algorithm in the contract doc. Lock, journal, dedupe and protection checks use
  `ResolvedPath.key`.
- **ChangeJournal:** follow the crash-safe order (pending → committed) and run `recoverPending()` at startup. Command
  changes go through `scanState` / `recordCommandChanges` around every agent command. Blobs are verified on read.
  The journal is honest about non-revertible command changes.
- **write_file / edit_file:** edit_file matches on a CRLF→LF normalized view and writes newText back in the file's
  dominant EOL. write_file on an existing file keeps its dominant EOL and its BOM. NOVA never adds a BOM. New files use
  CRLF for .bat/.cmd/.sln/.csproj/.cs/.ps1 and LF otherwise. Writes to `isSensitive` files need a
  `security_config` approval. read_file/search_files on sensitive files return `maskSecretFile()` content plus a German
  note. A write whose content contains a secret (`containsSecret`) adds a warning to the tool result.
- **CommandPolicy (fail-closed):**
  (a) C0 control chars (CR, LF, NUL …) → block "Steuerzeichen im Befehl".
  (b) Auto-allow requires all of the following: no `& | < > ^ % ! ( ) ; $` or backtick, balanced quotes, and an
  exact prefix match (`line === p || line.startsWith(p + ' ')`). On Windows the first token is compared
  case-insensitively. Chained or redirected lines are never auto-allowed; they need approval kind `command` with the
  raw line.
  (c) Classify a normalized copy: strip `^` and `"`, lower-case, split on `& && | || ; newline ( )`, and take each
  segment's first token as a basename without .exe/.com/.bat/.cmd/.ps1. A segment starting with `%` or `!` → approve.
  (d) Block list (best effort): format, diskpart, `del /s` and `rd /s` on drive roots, `Remove-Item -Recurse` on
  paths outside the project, shutdown, `reg add/delete`, bcdedit, `cipher /w`, vssadmin, `Set-ExecutionPolicy`,
  netsh, `sc config/delete`, `schtasks /create`, writes to %WINDIR%, fork bombs, `curl|wget … | sh/iex`. Encoded
  PowerShell (`-e`, `-ec`, `-en`, `-enc`, … any prefix of -EncodedCommand, also with `/`) → block.
  (e) Nested interpreters → approve: cmd, powershell, pwsh, wsl, bash, sh, start, call, conhost, mshta, rundll32,
  regsvr32, cscript, wscript, certutil, bitsadmin, `node -e/--eval/-p`, `python -c`.
  (f) Admin (runas, sudo, `-Verb RunAs`) → approve admin.
  (g) Install/system (`npm i -g`, `pip install` outside a venv, winget/choco/scoop, setx, PATH edits) → approve.
  (h) security_config: `git config --global/--system`, `npm config set`, Set/Add-MpPreference, icacls, takeown,
  hosts file.
  (i) publish: git push, npm publish, docker push, scp, uploads.
  (j) delete: rm -r, rmdir /s, del /s, Remove-Item -Recurse, git clean, `git reset` (any form), git restore,
  `git stash` (except list/show), `git checkout -f/--force/-- <path>`, `git switch -f/--discard-changes`, git rm.
  (k) outside_project: absolute paths outside the root used as write or delete targets.
  (l) **Network** (evaluated before auto-allow): curl, wget, iwr/irm, Invoke-WebRequest/RestMethod,
  Start-BitsTransfer, bitsadmin, `certutil -urlcache`, `git clone/fetch/pull/ls-remote`, `npm install/i/ci/add`,
  `pip install`, `dotnet restore/add package`, winget, scp, ssh, sftp, ftp. With allowAgentNetwork=false → approve
  network. URL hosts that are not allowed (`assertHostAllowed` logic) → approve network with subject = host.
  (m) **Taint rule** (before auto-allow): if an argument resolves to a project file with a non-reverted NOVA change in
  the current task AND the first token is an interpreter/launcher (node, python, py, deno, bun, tsx, ts-node, bash, sh,
  `powershell -File`) or the file itself is .bat/.cmd/.ps1/.exe/.vbs/.js → approve command, consequences "Führt eine
  Datei aus, die NOVA in dieser Aufgabe geschrieben hat."
  (n) Allowlist → allow; otherwise approve command (if approveUnknownCommands is off, metacharacter-free unknown commands
  are allowed and everything else is approved).
  Add table-driven tests for every bypass.
- **run_command:** policy → approval check → `consume()` BEFORE execution → `scanState` → run → `recordCommandChanges`.
  When a waiting approval resumes, re-evaluate the policy on the stored command.
- **ProcessManager:** process identity is (pid, OS creation time). Windows uses ONE
  `Get-CimInstance Win32_Process | Select ProcessId,ParentProcessId,Name,CreationDate(UTC ISO) | ConvertTo-Json` query.
  Never use wmic, never parse localized tasklist text. Descendants follow ParentProcessId with creation time ≥ the
  parent's. Kill leaves-first with `taskkill /pid N /F` and judge by exit code (0/128). This walk also handles roots
  that have already exited (kill, shutdown, recoverOrphans). POSIX uses /proc stat field 22 + btime, and kill(-pgid).
  Record `started_at` immediately before spawn. The env sets `npm_config_yes=false` via buildChildEnv.
- **TerminalService:** Windows runs lines via `runPowerShell`-style `-EncodedCommand` (trusted user input). Output is
  UTF-8.
- **FileWatcher:** `fs.watch(root, {recursive:true})`. Ignore the FileService.tree dirs and .git, debounce 300 ms, and
  suppress `journal.recentlyWritten(2 s)`. Emit `files.changed {actor:'external'}`. Watch at most 20 non-archived
  projects. On EMFILE/ENOSPC fall back to a 5 s mtime poll. app.ts starts it for all active projects; ProjectService
  calls watch/unwatch on create/remove.
- **Tool table (authoritative, AgentRoleModule.toolNames):** planner [list_files, read_file, search_files,
  memory_search, memory_note, ask_user]; coder [list_files, read_file, search_files, write_file, edit_file, delete_file,
  run_command, run_checks, git_diff, memory_search, memory_note, ask_user]; tester [list_files, read_file, search_files,
  write_file, edit_file, run_command, run_checks, git_diff, memory_search, memory_note, ask_user]; reviewer [list_files,
  read_file, search_files, git_diff, run_checks, memory_search, memory_note]. `ask_user {question, options?,
  assumption}` (tools module) creates a TaskNote (kind question, author agent) plus a notification (category blocker)
  and returns `{status:'needs_input', noteId}`. `run_checks` accepts every CheckKind and passes `ctx.task.id` as
  taskId.

### 6.4 agents

- `AgentRunInput.role` (default task.role) is the role of the run. The reviewer pass is a separate run with role
  'reviewer' on the same task. `RunStore.latestForTask(taskId, role?)`.
- The run state stores `taskSnapshot {title, description, acceptance, role}`, `inFlight {toolCallId, name, args,
  readOnly, startedAt} | null` (saved BEFORE any non-readOnly tool executes and cleared after its result is
  persisted), and the pending tool call or model call for approvals.
- **Resume:**
  - If title/description/acceptance changed, append "The user edited this task while it was paused. New …".
  - If the role changed, start a fresh run instead.
  - Unconsumed user notes are appended as "Note from the user: …" at every step boundary and on resume, then marked
    consumed.
  - inFlight with readOnly → run it again. Otherwise do NOT run it again: append the tool result "Interrupted by a
    restart; the action may be partially done. Inspect the current state before continuing." and add an `error` step.
- **Outcomes:** abort reason INTERRUPTED → state kept, run status interrupted, outcome interrupted. Model errors
  APPROVAL_REQUIRED → run waiting_approval with pendingApprovalId, and the model call repeats on resume. NO_MODEL,
  VRAM_INSUFFICIENT, BUDGET_EXCEEDED, PAID_NOT_APPROVED, PRICE_UNKNOWN, OLLAMA_UNREACHABLE (after retries) → blocked
  with the code, state saved. `needs_input` tool result → blocked, code NEEDS_INPUT. `run.errorCode` is set.
- The runner NEVER writes the tasks table. `activeMs` counts only running time.
- The runner rejects tool calls that are not in `toolNames` or the finish tool, with an error message back to the
  model. Tool specs come from `tools.specs(toolNames)` plus the finish tool spec
  (`z.toJSONSchema(schema,{io:'input'})`).
- In JSON-protocol mode (no native tools) the system prompt lists the tools with their JSON schemas.
- The planner prompt says: for minor unknowns choose sensible defaults and record them as memory kind 'decision'
  tagged 'annahme'; use ask_user only for decisive choices; at most 15 small tasks with acceptance criteria and
  expected files.

### 6.5 orchestrator

- **WorkCycle is the only writer of** task.status, blocker, blockerCode, result, model, verification, attempts,
  startedAt, finishedAt and startRequested.
- **Work state:** global state in meta `work_state` (default `running`) plus `project.workState`
  (`ProjectService.setWorkState`).
  - `work.start({projectId})` → running.
  - `work.pause` → paused: runs of the project pause at the next step and their tasks become paused (remember which).
  - `work.resume` → running, and the tasks paused by that pause resume.
  - `work.stop` → stopped: runs cancelled, tasks re-queued.
  - Without projectId these act on the global state.
  - The scheduler starts a queued task iff global = running AND (project.workState = running OR
    task.startRequested).
  - `tasks.start` and `tasks.resume` set startRequested; it is cleared when the task finishes.
  - New projects: description/wizard/template → running; open/import → stopped (the UI shows the honest-limits
    warning before enabling).
- **Outcome mapping:** done → verification flow; paused → paused; waiting_approval → waiting_approval; blocked →
  blocked + blockerCode; failed → failed; cancelled → cancelled (stopTask) or queued (work.stop); interrupted →
  interrupted.
- **Resume vs fresh run:** a task starts by resuming `runs.latestForTask(id)` iff its status is paused,
  waiting_approval or interrupted, or blocked with a resumable errorCode (RESUMABLE_BLOCKER_CODES). Otherwise it starts
  a fresh run. `tasks.retry` sets attempts=0, resets verification, clears the blocker and always starts fresh.
- **Auto-unblock:** blocked tasks with resumable codes are re-checked on provider.updated, provider.removed,
  ollama.models.changed, settings.updated (models/budgets/resources), budget.updated (paidPaused=false),
  integrations.updated, task.note (NEEDS_INPUT) and every 60 s, using `models.resolve(role,{projectId})`,
  `integrations.get`, disk and resources. When the condition is gone the task is queued for resume, the blocker is
  cleared and its errors are resolved. DEPENDENCY_FAILED dependents are re-queued when the dependency becomes done.
- **Approvals:** `onDecision` → for every run with status waiting_approval and `pendingApprovalId === approval.id`,
  re-queue its task if the task is still waiting_approval.
- **Locks:** acquired by write tools. WorkCycle releases them when a task becomes done, failed or cancelled, or blocked
  with a non-resumable code. They are kept while paused, waiting_approval or interrupted. `recover()` releases only
  locks of tasks it does not resume.
- **Checkpoints:** pre_task only before the first run of a task (attempts=0, no resume).
- **Verification (from REAL results only):**
  - coder done with result.status='blocked' → task blocked, AGENT_BLOCKED.
  - coder done → checks per project: build (if a command exists and kind web/desktop/backend), test (if
    testAfterChange), typecheck/lint if configured. Applicable kinds without a command are listed as 'skipped' with a
    German reason. Then the reviewer pass if reviewChanges (verdict changes_requested → check 'Review' failed with
    findings).
  - tester done → only CheckRuns with taskId = task.id started during the run. If none exist the orchestrator runs
    `checks.run(test)` itself; if there is no test command → unavailable. `passed` from the agent is informational; if
    the agent claimed success but the check failed → failed plus an error step.
  - reviewer task → check 'Review' from the verdict.
  - plan task → unavailable.
  - Patch the verification BEFORE calling `checkpoints.afterTask`.
- **Repeated failures:** the failure signature comes from `check.failureSignature` or a hash of the review findings.
  After `maxIdenticalFailures` identical signatures in a row, the next attempt gets the instruction "take a different
  approach" plus the list of previous attempts. The next identical failure → blocked REPEATED_FAILURE with an error
  report whose userAction names `checkpoints.latestVerified`.
- **Planner done:**
  - Created tasks get `parentId = planTask.id` and `plannedFiles = PlanTask.files`; their description gets
    "Voraussichtlich betroffene Dateien: …". plannedFiles are never written to task.files.
  - Plan memory is stored with source 'system' (best effort, try/catch).
  - Two tasks of one project whose plannedFiles overlap never run in parallel.
- **Integration pass:** when all non-cancelled children of a plan task P are done, run build then test with
  taskId = P. Results go into P.verification as 'Integration: Build' and 'Integration: Tests', plus a memory
  test_result. On failure create a fix task (parentId P, source system), an error report and a notification.
- **Idle:** idleReason plus a per-project `suggestion` (`memory.latestNextStep` or "Neues Ziel planen"). Never create
  tasks on its own.
- **Recover:**
  - `runs.markInterrupted()`; tasks with status running → interrupted.
  - When the run's inFlight tool was non-readOnly AND its approval kind was publish/delete/install/admin/system_change
    → the task becomes paused with blocker "Nach Neustart unterbrochen – bitte prüfen".
  - Otherwise, if resumeAfterRestart → queued for resume.
- **Shutdown:** set pause flags → wait timeoutMs → abort the remaining runs with NovaError INTERRUPTED → wait ≤ 2 s →
  persist anything still running as interrupted.
- **`dashboard.summary`** uses only cached/local data:
  - recentBuilds: the newest 10 PASSED build/package runs.
  - failedTests: `checks.currentFailures`.
  - models.local: `ollama.lastStatus()`.
  - cloud: `providers.lastHealth()`.
  - The daemon status comes from `s.daemon.status()`.
  - Any part may be null on failure.
- `tasks.createFix` builds the description from check failures/outputTail or from the error's whatHappened/details.
- `tasks.delete` → CONFLICT when dependents exist. `tasks.update`, `tasks.stop` and `tasks.delete` call
  `approvals.expireForTask`.

### 6.6 git

- Every git call goes through `execTool` with `buildChildEnv({ LC_ALL:'C', LANG:'C' })` and
  `-c core.longpaths=true -c core.quotepath=off`. `--end-of-options` comes before revisions and `--` before paths.
  Refs match `^(?!-)[A-Za-z0-9._/@{}~^-]+$`.
- Read-only commands use `GIT_OPTIONAL_LOCKS=0`. Mutating commands are serialized per canonical repo root.
- A stale `index.lock` (no NOVA git process running and older than 60 s) is removed with a warning, then retried once.
  Otherwise retry every 1 s, up to 5 times.
- "dubious ownership" → GIT_ERROR (German) plus an approval of kind security_config for
  `git config --global --add safe.directory <path>`. Never add it automatically.
- `commitPaths`: `git add -- <paths>`, then `git commit --only -m <msg> -- <paths>` (respects hooks). Without a
  configured identity, use `-c user.name="NOVA AI" -c user.email="nova@localhost"`.
- `clone`: only https://, ssh:// and git@host: URLs; `GIT_ALLOW_PROTOCOL=https:ssh`; no submodules; host checked with
  assertHostAllowed (not allowed → network approval); progress parsed from `--progress`.
- Checkpoints carry a `verification` marker and emit `checkpoint.updated`. `restore` → CONFLICT while tasks of the
  project run. Restore commits leave out modifiedSinceNova files.
- **Backups:**
  - Database restore: validate the backup (opens, schema_version ≤ latest), back up the current DB
    ("vor Wiederherstellung"), write `restore-pending.json`, request the daemon restart. app.ts swaps the files before
    opening the DB.
  - Project snapshot restore goes to a new folder only.
  - Retention: count and age for DB backups, `retentionCount` project snapshots per project.
  - Import never takes over the permissions, network or budgets sections; providers get approved=false; task status
    running/waiting_approval/interrupted becomes queued; the FK order is projects → tasks → memory → providers;
    path_key collisions and existing ids are skipped with German warnings.
  - The snapshot copy skips links.

### 6.7 memory

- projectId semantics as in the contract.
- Agent insights become shareable only when `autoShareAgentInsights` is on.
- Shared entries entering another project's context get absolute paths and the source project name replaced with
  placeholders (`<Projektpfad>`, `<Projekt>`).
- `memory.clear` emits one `memory.updated {cleared:true}`.
- `removeProject` deletes the project's non-shareable entries.

### 6.8 projects

- **Root safety (create in all modes, import, and update path):**
  - Canonicalize with realpath, case-folded on Windows.
  - Reject drive and share roots.
  - Reject %USERPROFILE% and its known folders (Desktop, Documents, Downloads, Pictures, Music, Videos via
    `[Environment]::GetFolderPath`).
  - Reject anything equal to or inside %WINDIR%, %ProgramFiles%, %ProgramFiles(x86)%, %ProgramData%, %APPDATA% or
    %LOCALAPPDATA%.
  - Reject anything equal to, inside or an ancestor of the data dir, or of another registered project.
  - The VALIDATION message is "Dieser Ordner kann nicht als Projektordner verwendet werden: <Grund>".
  - Warn under OneDrive or when the root is longer than 150 characters.
  - The default projectsDir is `%USERPROFILE%\NOVA Projekte`.
- `remove()`: CONFLICT if tasks run. Then `preview.stop`, `terminals.closeProject`, `processes.killProject`,
  `approvals.expireForProject`, `locks.releaseProject`, `watcher.unwatch`. In one transaction delete the project row
  (cascade) plus its changes, approval_rules and file_locks; call `memory.removeProject`; resolve its errors. Keep
  usage records and backups. Emit project.removed.
- `refreshGit` after create/init. `pathMissing` in the summary. `update({path})` relinks a moved folder, with the
  same safety rules.
- **Detector:**
  - typecheck: `scripts.typecheck`, else `npx tsc --noEmit` when a tsconfig exists.
  - e2e: `scripts.e2e` / `test:e2e` / playwright config.
  - security: `npm audit --omit=dev --audit-level=high` for npm projects.
  - package: dotnet publish, `npm run dist` or package, Unity build.
  - artifactGlobs defaults per kind.
  - Unity `engineVersion` from `ProjectSettings/ProjectVersion.txt`.
- **CheckService:**
  - Install dependencies first when the marker is missing (package.json without node_modules, *.csproj without obj/,
    Python without .venv). An install failure → status error "Abhängigkeiten konnten nicht installiert werden".
    Installs triggered by agents/system go through CommandPolicy (network rules); user-triggered installs do not.
  - The runtime check starts run/dev for up to 30 s. It passes if the process is still alive after 10 s, or for web if
    the loopback URL answers 2xx; then kill the tree.
  - Record artifacts.
  - Unity uses only the editor matching engineVersion (`integrations.resolvePath('unity',{version})`). If it is
    missing → not_run "Unity <ver> ist nicht installiert …". If the project is open (Temp/UnityLockfile locked) →
    error "Projekt ist in Unity geöffnet – bitte Unity schließen."
  - Parsers rely on exit codes plus machine-readable output where possible (dotnet test with
    `--logger "trx"`/English via env, Unity NUnit XML, vitest/jest/node --test summaries).
- **Preview static server:**
  - Answer 421 unless Host is exactly `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`.
  - Serve only below a random `/p/<32hex>/` prefix (included in PreviewStatus.url).
  - Never serve dot-segments; do not follow links out of the root (PathGuard).
  - GET and HEAD only, with `X-Content-Type-Options: nosniff`.
  - Templates' `server.mjs` implement the Host check too.
- Templates are copy-free and offline. Their README states the honest limits (German).

### 6.9 env

- **SecretStore Windows:** DPAPI via one PowerShell process per batch. Script and data go via stdin
  (`-Command -`, single-line script, base64 payloads). Entropy = UTF-8 of "NOVA AI|" + id. Decrypted values are
  cached in memory, and `loadAll()` runs at start. Any failure → SECRET_STORE "Der Windows-Schlüsselspeicher ist
  nicht verfügbar. API-Schlüssel bitte erneut eingeben." Never fall back on Windows. The aes-local fallback (Linux/macOS
  only) reports the warning error 'secret-store-insecure'.
  UI sentence: "Schlüssel sind mit dem Windows-Konto verschlüsselt. Programme unter diesem Konto – auch von NOVA
  ausgeführte Projektbefehle – können sie auslesen."
- **Approvals:** reuse requires fingerprint + taskId. `consume` before execution. `decide` rejects 'always' for
  APPROVAL_KINDS_ONCE_ONLY.
- **Resources (Windows GPU via WMI classes, not localized):**
  - `Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine` (sum UtilizationPercentage per luid over names
    containing engtype_3D) and `…GPUAdapterMemory` (DedicatedUsage).
  - VRAM total from `HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}\0???`
    HardwareInformation.qwMemorySize.
  - One PowerShell call every 10 s (not every sample).
  - nvidia-smi first when present.
- **Governor:**
  - `allowed(activeRuns)`.
  - `allowedFor(model)` → not ok when the model is not loaded (`ollama.running`) and VRAM usage > maxVramPercent.
  - `canWrite(absPath)` → statfs of that path < minFreeDiskMb → not ok. On the data drive this also stops new runs.
  - `canStartProcess` counts only command/test/build/install/terminal kinds.
- **Integrations:**
  - Modules with `register()`. Built-ins are listed in BUILTIN_INTEGRATIONS.
  - All installations are reported (Unity versions from Hub/Editor/*, secondaryInstallPath.json, editors-v2.json /
    editors.json; Unreal from LauncherInstalled.dat + `UE_*` + UE4Editor.exe; Godot from PATH, WinGet Links/Packages,
    Steam, %LOCALAPPDATA%\Programs).
  - `open()` (vscode `code -g file:line`, windows_terminal `wt.exe -d <root>`, unity `-projectPath` with the matching
    version, godot `--editor --path`, unreal `<x>.uproject`) runs detached as a user action.
  - winget command: `winget install --id <Id> -e --source winget --accept-package-agreements
    --accept-source-agreements --disable-interactivity` (plus `--scope user` where supported). The approval
    consequences say (German) that approving accepts the license terms and that a UAC prompt may need someone at the
    PC.
  - After an install: `refreshWindowsPath(true)` and refresh.
- **Updates:** `start()` → daily check if enabled. The feed host must pass assertHostAllowed. Notify once per version
  (meta `update_notified_version`). Never download or install.

### 6.10 integrator / Electron (summary; details in UI-SPEC)

- **DaemonStatus:** state 'error' when lastError is set or an open critical error exists. It carries
  previousShutdown (meta `last_shutdown` written on a clean exit), secretStore and methods. It is re-emitted on every
  work.status.
- **crash.json:** written on fatal errors. CLI flags `--diagnostics-only` and `--restore-db <file>`.
- **Electron main:**
  - Stays resident in the tray while keepRunningWhenUiClosed, supervising the daemon and showing toasts.
  - Spawns the daemon with `cwd: dataDir`, stdio to `logs/daemon-start.log`.
  - Exit 3 → connect to the running daemon. If the version differs → shutdown, then spawn the new daemon.
  - Handles `query-session-end` / `session-end` → `daemon.shutdown({reason:'os-shutdown'})`.
  - CLI `--stop-daemon` is used by the NSIS customInit and customUnInit (the uninstaller also removes the autostart
    entry).
  - Fuses: RunAsNode on, NodeOptions off, inspect args off.
  - openPath only for directories, plus `showInFolder`.
  - No `dangerouslySetInnerHTML`.
