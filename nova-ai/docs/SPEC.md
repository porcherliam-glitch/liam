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
| env | `src/daemon/secrets/`, `src/daemon/approvals/`, `src/daemon/resources/`, `src/daemon/integrations/`, `src/daemon/updates/` | SecretStore, ApprovalService, ResourceMonitor, ConcurrencyGovernor, IntegrationService, UpdateService | approvals.*, resources.*, integrations.*, updates.check |
| integrator | `src/daemon/app.ts`, `src/daemon/index.ts`, `src/daemon/rpc-core.ts` | wiring, lifecycle | daemon.*, settings.* |

Each module folder has an `index.ts` exporting factories with this shape:
`export function createX(s: Services): X` (constructor must not call other services) and
`export const registerXRpc: RpcRegistrar`. Services with timers expose `start()`/`stop()` (or the contract methods).

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
- `startRpcServer({ endpoint, token, router, bus, log, version, instanceId })` → `{ close(): Promise<void>, endpoint }`.
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
  listen; removed on clean shutdown. `readLock()` for clients/diagnostics.
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
