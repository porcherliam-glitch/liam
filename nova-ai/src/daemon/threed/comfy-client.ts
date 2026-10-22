// ComfyUI API client for the 3D workshop (docs/SPEC-3D.md §4 "ComfyUI API used"): system stats, object_info, model
// lists, image upload, queueing prompts, history, interrupt/delete/free, file download (/view) and following a prompt
// until it ends (WebSocket with polling fallback).
//
// Key decisions:
// - Local endpoints only: the constructor rejects every base URL that is not loopback (core/net isLocalEndpoint), so
//   images and prompts never leave the PC.
// - All HTTP goes through node:http(s) instead of fetch: no 300 s fetch/undici body timeout for long transfers, real
//   streaming of large /view downloads with an IDLE timeout (reset on every chunk) and a size cap. Every call has a
//   timeout and honours an AbortSignal.
// - watch() follows `/ws?clientId=<id>` with Node's global WebSocket (Node ≥ 22) and filters by prompt_id. ComfyUI
//   sends execution messages only to the socket of the client_id given in POST /prompt, and a second socket with the
//   same clientId silently replaces the first one, so watch() also polls /history every few seconds as a safety net.
//   When the socket cannot be opened (or closes) it falls back to polling /history + /queue every second. The final
//   result always comes from /history (outputs), because `execution_success` is sent before ComfyUI stores the entry.
// - Errors are German NovaErrors with machine-readable details (ComfyErrorDetails):
//     TOOL_MISSING      ComfyUI not reachable (connection refused etc.) – the user has to start it
//     VALIDATION        POST /prompt rejected (node_errors → German text; missing model files listed separately)
//     VRAM_INSUFFICIENT execution_error caused by "out of memory"
//     CANCELLED         caller aborted (isAbortError() is true) or ComfyUI reports execution_interrupted
//     NOT_FOUND         /view file does not exist
//     DEPENDENCY_FAILED any other ComfyUI failure (HTTP status, invalid answer, timeout, execution_error, lost job)
//   watch() never interrupts ComfyUI by itself; cancelling is the caller's decision (interrupt()/deleteFromQueue()).
import http, { type IncomingMessage } from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';
import { ErrorCodes } from '@shared/errors';
import { NovaError } from '../core/errors';
import { isLocalEndpoint } from '../core/net';
import { redactString } from '../core/redact';
import { modelFolderFor, type ApiPrompt, type ObjectInfo, type ObjectInfoNode } from './workflow';

export type { ApiPrompt, ObjectInfo } from './workflow';

// ---------------------------------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------------------------------

/** Minimal WebSocket surface used by watch() (the WHATWG WebSocket of Node ≥ 22 satisfies it). */
export interface WebSocketLike {
  readonly readyState: number;
  binaryType?: string;
  addEventListener(type: 'open' | 'message' | 'error' | 'close', listener: (event: { data?: unknown; code?: number; reason?: string }) => void): void;
  close(code?: number, reason?: string): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface ComfyClientOptions {
  /** ComfyUI address, e.g. "http://127.0.0.1:8188". Loopback only. */
  baseUrl: string;
  /** Client id sent with POST /prompt and used for the WebSocket (execution messages go to this id only). */
  clientId: string;
  /** Timeout for ordinary requests in ms (default 30 000). */
  timeoutMs?: number;
  /** WebSocket constructor; default: Node's global WebSocket. null = never use a socket (polling only). */
  webSocketFactory?: WebSocketFactory | null;
  /** Poll interval of the fallback in ms (default 1000). */
  pollIntervalMs?: number;
  /** Interval of the safety-net /history poll while the socket is healthy, in ms (default 5000). */
  safetyPollIntervalMs?: number;
  /** Time the socket may take to open before watch() falls back to polling, in ms (default 5000). */
  wsConnectTimeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Overrides the client's timeout for this call. */
  timeoutMs?: number;
}

export interface ComfyDevice {
  name: string;
  type: string;
  index: number | null;
  vramTotalBytes: number | null;
  vramFreeBytes: number | null;
}

export interface ComfySystemStats {
  /** system.comfyui_version, e.g. "0.42.0". */
  version: string | null;
  os: string | null;
  pythonVersion: string | null;
  pytorchVersion: string | null;
  ramTotalBytes: number | null;
  ramFreeBytes: number | null;
  /** Torch devices, primary device first (CPU mode: one device of type "cpu"). */
  devices: ComfyDevice[];
  raw: unknown;
}

export interface ComfyFileRef {
  filename: string;
  subfolder: string;
  /** "output" | "input" | "temp" */
  type: string;
}

export interface ComfyOutputFile extends ComfyFileRef {
  nodeId: string;
  /** Key in the node's output, e.g. "images" (SaveImage) or "3d" (Save3DAdvanced). */
  kind: string;
}

export type ComfyStatusMessage = [string, Record<string, unknown>];

export interface ComfyHistoryEntry {
  /** Node id → UI output of that node, e.g. { "3d": [{ filename, subfolder, type }], camera_info: [...] }. */
  outputs: Record<string, Record<string, unknown>>;
  status: { status_str: string; completed: boolean; messages: ComfyStatusMessage[] } | null;
  prompt?: unknown;
  meta?: unknown;
}

export interface QueuedPrompt {
  promptId: string;
  number: number | null;
  /** Errors of OTHER output nodes when ComfyUI still accepted the prompt (normally empty). */
  nodeErrors: Record<string, unknown>;
}

export interface ComfyQueueState {
  running: string[];
  pending: string[];
}

export type ComfyWatchEvent =
  | { type: 'transport'; transport: 'websocket' | 'polling'; reason?: string }
  | { type: 'queued'; position: number | null }
  | { type: 'execution_start' }
  | { type: 'execution_cached'; nodes: string[] }
  | { type: 'executing'; node: string | null }
  | { type: 'progress'; node: string | null; value: number; max: number }
  | { type: 'executed'; node: string; output: unknown }
  | { type: 'execution_success' }
  | { type: 'execution_error'; nodeId: string | null; nodeType: string | null; exceptionType: string | null; exceptionMessage: string }
  | { type: 'execution_interrupted'; nodeId: string | null; nodeType: string | null };

export interface PromptIssue {
  nodeId: string | null;
  classType: string | null;
  /** ComfyUI error type, e.g. "value_not_in_list". */
  type: string;
  input: string | null;
  /** German one-line description. */
  message: string;
  /** ComfyUI's original English message and details. */
  original: string;
}

export interface MissingModelFile {
  nodeId: string;
  classType: string;
  input: string;
  name: string;
  /** ComfyUI models sub folder (null when unknown for this loader). */
  folder: string | null;
}

/** `details` of every NovaError thrown by ComfyClient. */
export interface ComfyErrorDetails {
  baseUrl: string;
  path?: string;
  status?: number;
  timedOut?: boolean;
  networkCode?: string;
  comfyMessage?: string;
  issues?: PromptIssue[];
  missingModels?: MissingModelFile[];
  nodeId?: string | null;
  nodeType?: string | null;
  exceptionType?: string | null;
  exceptionMessage?: string;
  outOfMemory?: boolean;
  interrupted?: boolean;
  promptId?: string;
}

// ---------------------------------------------------------------------------------------------------------------------
// Constants and small helpers
// ---------------------------------------------------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_VIEW_IDLE_MS = 120_000;
const DEFAULT_MAX_JSON_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_VIEW_BYTES = 1024 * 1024 * 1024;
const MAX_TIMER_MS = 2_147_483_647;
/** Consecutive failed polls (≈ seconds) before watch() gives up on an unreachable ComfyUI. */
const MAX_POLL_FAILURES = 15;
/** Consecutive polls in which the prompt is neither queued, running nor in the history. */
const MAX_MISSING_POLLS = 5;
/** How long watch() waits for the history entry after a success signal. */
const HISTORY_WAIT_MS = 30_000;
const OBJECT_INFO_CONCURRENCY = 6;

const CONNECT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL']);

const ISSUE_TEXT: Record<string, string> = {
  required_input_missing: 'Pflichteingabe fehlt',
  value_not_in_list: 'Wert ist in ComfyUI nicht verfügbar',
  value_smaller_than_min: 'Wert ist kleiner als erlaubt',
  value_bigger_than_max: 'Wert ist größer als erlaubt',
  return_type_mismatch: 'Verbindung hat den falschen Datentyp',
  invalid_input_type: 'Wert hat den falschen Typ',
  bad_linked_input: 'Ungültige Verbindung',
  custom_validation_failed: 'Prüfung des Knotens fehlgeschlagen',
  exception_during_validation: 'Fehler bei der Prüfung',
  exception_during_inner_validation: 'Fehler bei der Prüfung eines vorgelagerten Knotens',
  dependency_cycle: 'Kreisverbindung im Workflow',
  missing_node_type: 'Knotentyp fehlt in ComfyUI',
  prompt_no_outputs: 'Workflow ohne Ausgabeknoten',
  invalid_dynamic_input: 'Ungültige dynamische Eingabe',
  invalid_prompt_id: 'Ungültige Auftrags-ID',
  no_prompt: 'Kein Workflow übergeben',
};

const OOM_RE = /out of memory|outofmemory|OOM\b|not enough memory|can't allocate memory|failed to allocate|allocation on device/i;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function short(text: string, max = 300): string {
  const t = redactString(text.replace(/\s+/g, ' ').trim());
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function networkCode(e: unknown): string | undefined {
  const o = asRecord(e);
  if (!o) return undefined;
  if (typeof o.code === 'string') return o.code;
  if (Array.isArray(o.errors)) for (const x of o.errors) {
    const c = networkCode(x);
    if (c) return c;
  }
  return o.cause ? networkCode(o.cause) : undefined;
}

/** True for exception texts/types of an out-of-memory failure (CUDA, ROCm, DirectML, CPU). */
export function isOutOfMemory(exceptionType: string | null | undefined, exceptionMessage: string | null | undefined): boolean {
  return /OutOfMemory/i.test(exceptionType ?? '') || OOM_RE.test(exceptionMessage ?? '');
}

function cancelledError(baseUrl: string, cause?: unknown, details: Partial<ComfyErrorDetails> = {}): NovaError {
  return new NovaError(ErrorCodes.CANCELLED, 'Die Anfrage an ComfyUI wurde abgebrochen.', {
    severity: 'warning',
    cause,
    details: { baseUrl, ...details } satisfies ComfyErrorDetails,
  });
}

/** Sanitises an upload file name: base name only, safe characters, never empty. */
export function safeUploadName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+/, '').slice(-120);
  return cleaned && /\.[A-Za-z0-9]+$/.test(cleaned) ? cleaned : `${cleaned || 'bild'}.png`;
}

function mimeOf(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

// ---------------------------------------------------------------------------------------------------------------------
// node_errors → German text
// ---------------------------------------------------------------------------------------------------------------------

function issueFrom(nodeId: string | null, classType: string | null, raw: unknown): PromptIssue {
  const r = asRecord(raw) ?? {};
  const type = str(r.type) ?? 'unknown';
  const extra = asRecord(r.extra_info) ?? {};
  const input = str(extra.input_name);
  const original = short([str(r.message), str(r.details)].filter(Boolean).join(': '), 400);
  const what = ISSUE_TEXT[type] ?? 'Fehler';
  const where = [nodeId !== null && classType ? `Knoten „${classType}“ (#${nodeId})` : null, input ? `Eingabe „${input}“` : null].filter(Boolean).join(', ');
  return { nodeId, classType, type, input, message: `${where ? `${where}: ` : ''}${what}${original ? ` (${original})` : ''}`, original };
}

/** Parses the 400 body of POST /prompt ({ error, node_errors }) into issues and missing model files. */
export function parsePromptRejection(body: unknown, prompt?: ApiPrompt): { issues: PromptIssue[]; missingModels: MissingModelFile[]; topLevel: PromptIssue | null } {
  const b = asRecord(body) ?? {};
  const issues: PromptIssue[] = [];
  const missingModels: MissingModelFile[] = [];
  const nodeErrors = asRecord(b.node_errors) ?? {};
  for (const [nodeId, entry] of Object.entries(nodeErrors)) {
    const e = asRecord(entry) ?? {};
    const classType = str(e.class_type) ?? prompt?.[nodeId]?.class_type ?? null;
    for (const raw of Array.isArray(e.errors) ? e.errors : []) {
      const issue = issueFrom(nodeId, classType, raw);
      issues.push(issue);
      if (issue.type === 'value_not_in_list' && classType && issue.input) {
        const folder = modelFolderFor(classType, issue.input);
        const received = asRecord(asRecord(raw)?.extra_info)?.received_value;
        const name = typeof received === 'string' ? received : str(prompt?.[nodeId]?.inputs[issue.input]);
        if (folder && name) missingModels.push({ nodeId, classType, input: issue.input, name, folder });
      }
    }
  }
  const top = asRecord(b.error);
  let topLevel: PromptIssue | null = null;
  if (top) {
    const extra = asRecord(top.extra_info) ?? {};
    const nodeId = extra.node_id !== undefined && extra.node_id !== null ? String(extra.node_id) : null;
    topLevel = issueFrom(nodeId, str(extra.class_type), top);
  }
  return { issues, missingModels, topLevel };
}

function promptRejectedError(baseUrl: string, status: number, body: unknown, prompt?: ApiPrompt): NovaError {
  const { issues, missingModels, topLevel } = parsePromptRejection(body, prompt);
  const details: ComfyErrorDetails = { baseUrl, path: '/prompt', status, issues, missingModels };
  if (missingModels.length) {
    const list = missingModels.map((m) => `„${m.name}“${m.folder ? ` (Ordner „${m.folder}“)` : ''}`);
    return new NovaError(ErrorCodes.VALIDATION, `ComfyUI kann den Auftrag nicht starten: Es fehlen Modelldateien – ${[...new Set(list)].join(', ')}.`, {
      severity: 'blocker',
      details,
      userAction: 'Die fehlenden Modelle unter „Modelle“ → „3D-Modelle“ herunterladen (oder die Dateien in den genannten Unterordner des ComfyUI-Ordners „models“ legen).',
    });
  }
  const missingType = topLevel?.type === 'missing_node_type' ? topLevel : issues.find((i) => i.type === 'missing_node_type');
  if (missingType) {
    const top = asRecord(asRecord(body)?.error);
    const cls = str(asRecord(top?.extra_info)?.class_type) ?? missingType.classType ?? 'unbekannt';
    return new NovaError(ErrorCodes.VALIDATION, `In ComfyUI fehlt der Knoten „${cls}“. Die installierte ComfyUI-Version ist zu alt oder eine Erweiterung fehlt.`, {
      severity: 'blocker',
      details,
      userAction: 'ComfyUI auf die neueste Version aktualisieren und neu starten.',
    });
  }
  const image = issues.find((i) => i.classType === 'LoadImage' && i.type === 'custom_validation_failed');
  if (image) {
    return new NovaError(ErrorCodes.VALIDATION, 'ComfyUI findet das hochgeladene Eingabebild nicht (Ordner „input/nova“).', {
      severity: 'blocker',
      details,
      userAction: 'Den Auftrag erneut starten. Wenn der Fehler bleibt: prüfen, ob ComfyUI in seinen Ordner „input“ schreiben darf.',
    });
  }
  const lines = issues.length ? issues.map((i) => i.message) : topLevel ? [topLevel.message] : [`HTTP ${status}`];
  return new NovaError(ErrorCodes.VALIDATION, `ComfyUI hat den Auftrag abgelehnt: ${lines.slice(0, 4).join('; ')}${lines.length > 4 ? ` (und ${lines.length - 4} weitere)` : ''}.`, {
    severity: 'blocker',
    details,
    userAction: 'ComfyUI aktualisieren und den Auftrag erneut starten. Bleibt der Fehler, die Meldung an den NOVA-Support geben.',
  });
}

function executionError(baseUrl: string, promptId: string, data: Record<string, unknown>): NovaError {
  const nodeId = data.node_id !== undefined && data.node_id !== null ? String(data.node_id) : null;
  const nodeType = str(data.node_type);
  const exceptionType = str(data.exception_type);
  const exceptionMessage = short(str(data.exception_message) ?? '', 500);
  const where = nodeType ? `im Knoten „${nodeType}“${nodeId ? ` (#${nodeId})` : ''}` : 'bei der Ausführung';
  const outOfMemory = isOutOfMemory(exceptionType, exceptionMessage);
  const details: ComfyErrorDetails = { baseUrl, promptId, nodeId, nodeType, exceptionType, exceptionMessage, outOfMemory };
  if (outOfMemory) {
    return new NovaError(ErrorCodes.VRAM_INSUFFICIENT, `Der Grafikspeicher hat für die 3D-Erzeugung nicht gereicht (${where}).`, {
      severity: 'blocker',
      details,
      userAction:
        'Andere Programme schließen, die die Grafikkarte nutzen (Spiele, Videoschnitt, andere KI-Programme), die Qualität „Entwurf“ wählen und Sprachmodelle vor 3D-Aufträgen entladen lassen. Danach erneut versuchen.',
    });
  }
  return new NovaError(ErrorCodes.DEPENDENCY_FAILED, `ComfyUI meldet einen Fehler ${where}${exceptionMessage ? `: ${exceptionMessage}` : '.'}`, {
    severity: 'blocker',
    details,
    userAction: 'Die genaue Meldung steht im ComfyUI-Fenster bzw. -Protokoll. ComfyUI aktualisieren und die Modelldateien prüfen (unvollständige Downloads neu laden).',
  });
}

function interruptedError(baseUrl: string, promptId: string, data: Record<string, unknown>): NovaError {
  const nodeId = data.node_id !== undefined && data.node_id !== null ? String(data.node_id) : null;
  return new NovaError(ErrorCodes.CANCELLED, 'Die Erzeugung wurde in ComfyUI abgebrochen.', {
    severity: 'warning',
    details: { baseUrl, promptId, nodeId, nodeType: str(data.node_type), interrupted: true } satisfies ComfyErrorDetails,
  });
}

/** Files listed in a history entry's outputs (SaveImage → kind "images", Save3DAdvanced → kind "3d"). */
export function outputFiles(entry: ComfyHistoryEntry, nodeId?: string): ComfyOutputFile[] {
  const out: ComfyOutputFile[] = [];
  for (const [id, output] of Object.entries(entry.outputs ?? {})) {
    if (nodeId !== undefined && id !== nodeId) continue;
    for (const [kind, list] of Object.entries(output ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const r = asRecord(item);
        if (!r || typeof r.filename !== 'string') continue;
        out.push({ nodeId: id, kind, filename: r.filename, subfolder: str(r.subfolder) ?? '', type: str(r.type) ?? 'output' });
      }
    }
  }
  return out;
}

function parseHistoryEntry(raw: unknown): ComfyHistoryEntry | null {
  const r = asRecord(raw);
  if (!r) return null;
  const outputs: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of Object.entries(asRecord(r.outputs) ?? {})) outputs[k] = asRecord(v) ?? {};
  const s = asRecord(r.status);
  const status = s
    ? {
        status_str: str(s.status_str) ?? '',
        completed: s.completed === true,
        messages: (Array.isArray(s.messages) ? s.messages : []).flatMap((m): ComfyStatusMessage[] =>
          Array.isArray(m) && typeof m[0] === 'string' ? [[m[0], asRecord(m[1]) ?? {}]] : [],
        ),
      }
    : null;
  return { outputs, status, prompt: r.prompt, meta: r.meta };
}

function queueIds(list: unknown): Array<{ id: string; number: number }> {
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => (Array.isArray(item) && typeof item[1] === 'string' ? [{ id: item[1], number: num(item[0]) ?? 0 }] : []));
}

// ---------------------------------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------------------------------

interface RawRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Buffer;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs: number;
  /** true: timeoutMs is an idle timeout between chunks (downloads) instead of an overall timeout. */
  idle?: boolean;
  maxBytes: number;
  onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
}

interface RawResponse {
  status: number;
  body: Buffer;
}

export class ComfyClient {
  readonly baseUrl: string;
  readonly clientId: string;
  private readonly timeoutMs: number;
  private readonly wsFactory: WebSocketFactory | null;
  private readonly pollIntervalMs: number;
  private readonly safetyPollIntervalMs: number;
  private readonly wsConnectTimeoutMs: number;

  constructor(opts: ComfyClientOptions) {
    const base = opts.baseUrl.trim().replace(/\/+$/, '');
    let protocol = '';
    try {
      protocol = new URL(base).protocol;
    } catch {
      protocol = '';
    }
    if ((protocol !== 'http:' && protocol !== 'https:') || !isLocalEndpoint(base)) {
      throw new NovaError(ErrorCodes.NETWORK_BLOCKED, `ComfyUI muss auf diesem PC laufen (z. B. http://127.0.0.1:8188). Die Adresse „${opts.baseUrl}“ ist nicht erlaubt.`, {
        severity: 'warning',
        userAction: 'Unter „3D-Werkstatt“ → „Einstellungen“ eine lokale Adresse eintragen oder das Feld leer lassen (automatische Erkennung).',
        details: { baseUrl: opts.baseUrl },
      });
    }
    if (!opts.clientId.trim()) throw new NovaError(ErrorCodes.VALIDATION, 'Für ComfyUI fehlt die Client-ID.', { severity: 'warning' });
    this.baseUrl = base;
    this.clientId = opts.clientId;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const globalWs = (globalThis as { WebSocket?: new (url: string) => WebSocketLike }).WebSocket;
    this.wsFactory = opts.webSocketFactory !== undefined ? opts.webSocketFactory : globalWs ? (url) => new globalWs(url) : null;
    this.pollIntervalMs = Math.max(1, opts.pollIntervalMs ?? 1000);
    this.safetyPollIntervalMs = Math.max(1, opts.safetyPollIntervalMs ?? 5000);
    this.wsConnectTimeoutMs = Math.max(1, opts.wsConnectTimeoutMs ?? 5000);
  }

  // ---- HTTP plumbing ------------------------------------------------------------------------------------------------

  private details(extra: Partial<ComfyErrorDetails> = {}): ComfyErrorDetails {
    return { baseUrl: this.baseUrl, ...extra };
  }

  private raw(req: RawRequest): Promise<RawResponse> {
    if (req.signal?.aborted) return Promise.reject(cancelledError(this.baseUrl, req.signal.reason, { path: req.path }));
    const url = new URL(this.baseUrl + req.path);
    const lib = url.protocol === 'https:' ? https : http;
    return new Promise<RawResponse>((resolve, reject) => {
      let settled = false;
      let responded = false;
      let timer: NodeJS.Timeout | null = null;
      const ms = Math.max(1, Math.min(MAX_TIMER_MS, Math.floor(req.timeoutMs)));
      const finish = (err: NovaError | null, res?: RawResponse) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        if (err) {
          request.destroy();
          reject(err);
        } else resolve(res as RawResponse);
      };
      const onAbort = () => finish(cancelledError(this.baseUrl, req.signal?.reason, { path: req.path }));
      const arm = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const sec = Math.round(req.timeoutMs / 1000);
          finish(
            new NovaError(ErrorCodes.DEPENDENCY_FAILED, `ComfyUI hat nicht rechtzeitig geantwortet (${req.path}, Zeitüberschreitung nach ${sec} s).`, {
              severity: 'retryable',
              autoFixable: true,
              details: this.details({ path: req.path, timedOut: true }),
              userAction: 'Prüfen, ob ComfyUI noch läuft und nicht hängt (ComfyUI-Fenster ansehen).',
            }),
          );
        }, ms);
      };
      const headers: Record<string, string> = { accept: 'application/json', ...(req.headers ?? {}) };
      if (req.body) headers['content-length'] = String(req.body.length);
      const request = lib.request(url, { method: req.method, headers }, (res: IncomingMessage) => {
        responded = true;
        const total = Number(res.headers['content-length']);
        const totalBytes = Number.isFinite(total) && total >= 0 ? total : null;
        if (totalBytes !== null && totalBytes > req.maxBytes) {
          finish(this.tooLarge(req.path, req.maxBytes));
          return;
        }
        const chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > req.maxBytes) {
            finish(this.tooLarge(req.path, req.maxBytes));
            return;
          }
          chunks.push(chunk);
          if (req.idle) arm();
          req.onProgress?.(received, totalBytes);
        });
        res.on('end', () => finish(null, { status: res.statusCode ?? 0, body: Buffer.concat(chunks) }));
        res.on('error', (e) => finish(this.networkError(req.path, e, true)));
        res.on('close', () => {
          if (!res.complete) finish(this.networkError(req.path, new Error('Verbindung vor Ende der Antwort geschlossen'), true));
        });
      });
      request.on('error', (e) => finish(this.networkError(req.path, e, responded)));
      req.signal?.addEventListener('abort', onAbort, { once: true });
      arm();
      request.end(req.body);
    });
  }

  private tooLarge(path: string, maxBytes: number): NovaError {
    return new NovaError(ErrorCodes.DEPENDENCY_FAILED, `Die Antwort von ComfyUI ist zu groß (${path}, mehr als ${Math.round(maxBytes / 1024 / 1024)} MB).`, {
      severity: 'blocker',
      details: this.details({ path }),
    });
  }

  private networkError(path: string, e: unknown, responded: boolean): NovaError {
    const code = networkCode(e);
    if (!responded && code && CONNECT_CODES.has(code)) {
      return new NovaError(ErrorCodes.TOOL_MISSING, `ComfyUI ist nicht erreichbar (${new URL(this.baseUrl).host}). Bitte ComfyUI starten.`, {
        severity: 'blocker',
        cause: e,
        details: this.details({ path, networkCode: code }),
        userAction: 'ComfyUI starten (ComfyUI Desktop oder die portable Version) und unter „3D-Werkstatt“ den Status neu prüfen. Ist ComfyUI nicht installiert: „Integrationen“ → „ComfyUI“.',
      });
    }
    const text = e instanceof Error ? short(e.message, 200) : 'unbekannter Fehler';
    return new NovaError(ErrorCodes.DEPENDENCY_FAILED, `Die Verbindung zu ComfyUI wurde unterbrochen (${code ?? text}).`, {
      severity: 'retryable',
      autoFixable: true,
      cause: e,
      details: this.details({ path, networkCode: code }),
      userAction: 'Prüfen, ob ComfyUI noch läuft, und den Auftrag erneut starten.',
    });
  }

  private statusError(path: string, status: number, body: Buffer): NovaError {
    const text = body.toString('utf8');
    let msg: string | undefined;
    try {
      const j = asRecord(JSON.parse(text));
      const err = j?.error;
      msg = typeof err === 'string' ? err : (str(asRecord(err)?.message) ?? str(j?.message) ?? undefined);
    } catch {
      msg = text.trim().startsWith('<') ? undefined : text;
    }
    const suffix = msg ? ` Meldung: ${short(msg)}` : '';
    return new NovaError(ErrorCodes.DEPENDENCY_FAILED, `ComfyUI hat die Anfrage abgelehnt (HTTP ${status} bei ${path}).${suffix}`, {
      severity: status >= 500 ? 'retryable' : 'blocker',
      autoFixable: status >= 500,
      details: this.details({ path, status, comfyMessage: msg ? short(msg) : undefined }),
    });
  }

  private parseJson(path: string, body: Buffer): unknown {
    const text = body.toString('utf8');
    if (!text.trim()) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch (e) {
      throw new NovaError(ErrorCodes.DEPENDENCY_FAILED, `ComfyUI hat eine unerwartete Antwort geschickt (${path}: keine gültigen JSON-Daten).`, {
        severity: 'blocker',
        cause: e,
        details: this.details({ path }),
      });
    }
  }

  /** JSON request; returns null for HTTP statuses listed in `allow` instead of throwing. */
  private async json(method: 'GET' | 'POST', path: string, body: unknown, opts: RequestOptions = {}, allow: number[] = []): Promise<{ status: number; data: unknown }> {
    const res = await this.raw({
      method,
      path,
      body: body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8'),
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      signal: opts.signal,
      timeoutMs: opts.timeoutMs ?? this.timeoutMs,
      maxBytes: DEFAULT_MAX_JSON_BYTES,
    });
    if (allow.includes(res.status)) return { status: res.status, data: this.parseJsonLenient(res.body) };
    if (res.status < 200 || res.status >= 300) throw this.statusError(path, res.status, res.body);
    return { status: res.status, data: this.parseJson(path, res.body) };
  }

  private parseJsonLenient(body: Buffer): unknown {
    try {
      return JSON.parse(body.toString('utf8')) as unknown;
    } catch {
      return null;
    }
  }

  // ---- API ------------------------------------------------------------------------------------------------------------

  /** GET /system_stats */
  async systemStats(opts?: RequestOptions): Promise<ComfySystemStats> {
    const { data } = await this.json('GET', '/system_stats', undefined, opts);
    const root = asRecord(data);
    const sys = asRecord(root?.system);
    if (!root || !sys) {
      throw new NovaError(ErrorCodes.DEPENDENCY_FAILED, 'Unter dieser Adresse antwortet kein ComfyUI (/system_stats ohne Systemdaten).', {
        severity: 'blocker',
        details: this.details({ path: '/system_stats' }),
        userAction: 'Die ComfyUI-Adresse unter „3D-Werkstatt“ → „Einstellungen“ prüfen.',
      });
    }
    const devices = (Array.isArray(root.devices) ? root.devices : []).flatMap((d): ComfyDevice[] => {
      const r = asRecord(d);
      if (!r) return [];
      return [{ name: str(r.name) ?? 'unbekannt', type: str(r.type) ?? '', index: num(r.index), vramTotalBytes: num(r.vram_total), vramFreeBytes: num(r.vram_free) }];
    });
    return {
      version: str(sys.comfyui_version),
      os: str(sys.os),
      pythonVersion: str(sys.python_version),
      pytorchVersion: str(sys.pytorch_version),
      ramTotalBytes: num(sys.ram_total),
      ramFreeBytes: num(sys.ram_free),
      devices,
      raw: data,
    };
  }

  /** GET /object_info/<class> for each class; classes the running ComfyUI does not know are absent in the result. */
  async objectInfo(classNames: string[], opts?: RequestOptions): Promise<ObjectInfo> {
    const result: ObjectInfo = {};
    const queue = [...new Set(classNames)];
    const worker = async () => {
      for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
        const { data } = await this.json('GET', `/object_info/${encodeURIComponent(name)}`, undefined, opts, [404]);
        const entry = asRecord(asRecord(data)?.[name]);
        if (entry) result[name] = entry as ObjectInfoNode;
      }
    };
    await Promise.all(Array.from({ length: Math.min(OBJECT_INFO_CONCURRENCY, queue.length) }, worker));
    return result;
  }

  /** GET /models/<folder>: file names (relative, Windows ComfyUI may use "\" for sub folders); null = folder unknown to this ComfyUI. */
  async listModels(folder: string, opts?: RequestOptions): Promise<string[] | null> {
    const { status, data } = await this.json('GET', `/models/${encodeURIComponent(folder)}`, undefined, opts, [404]);
    if (status === 404) return null;
    return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string') : [];
  }

  /**
   * POST /upload/image (multipart; subfolder "nova", overwrite) → the LoadImage value ComfyUI expects, e.g.
   * "nova/job_1.png" (always "/" as separator, ComfyUI joins it with its input folder on every OS).
   */
  async uploadImage(bytes: Buffer, filename: string, opts: RequestOptions & { subfolder?: string } = {}): Promise<string> {
    const name = safeUploadName(filename);
    const subfolder = (opts.subfolder ?? 'nova').replace(/[^A-Za-z0-9._-]+/g, '_');
    const boundary = `----nova${randomBytes(12).toString('hex')}`;
    const field = (key: string, value: string) => Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`, 'utf8');
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${name}"\r\nContent-Type: ${mimeOf(name)}\r\n\r\n`, 'utf8'),
      bytes,
      Buffer.from('\r\n', 'utf8'),
      field('subfolder', subfolder),
      field('overwrite', 'true'),
      field('type', 'input'),
      Buffer.from(`--${boundary}--\r\n`, 'utf8'),
    ]);
    const res = await this.raw({
      method: 'POST',
      path: '/upload/image',
      body,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      signal: opts.signal,
      timeoutMs: opts.timeoutMs ?? Math.max(this.timeoutMs, 120_000),
      maxBytes: DEFAULT_MAX_JSON_BYTES,
    });
    if (res.status < 200 || res.status >= 300) throw this.statusError('/upload/image', res.status, res.body);
    const data = asRecord(this.parseJson('/upload/image', res.body));
    const stored = str(data?.name);
    if (!stored) {
      throw new NovaError(ErrorCodes.DEPENDENCY_FAILED, 'ComfyUI hat das Bild angenommen, aber keinen Dateinamen gemeldet.', {
        severity: 'blocker',
        details: this.details({ path: '/upload/image' }),
      });
    }
    const sub = (str(data?.subfolder) ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return sub ? `${sub}/${stored}` : stored;
  }

  /** POST /prompt. Rejections (HTTP 400 with node_errors) become a German VALIDATION NovaError. */
  async queuePrompt(prompt: ApiPrompt, opts: RequestOptions & { extraData?: Record<string, unknown> } = {}): Promise<QueuedPrompt> {
    const body: Record<string, unknown> = { prompt, client_id: this.clientId };
    if (opts.extraData) body.extra_data = opts.extraData;
    const { status, data } = await this.json('POST', '/prompt', body, opts, [400]);
    if (status === 400) throw promptRejectedError(this.baseUrl, status, data, prompt);
    const r = asRecord(data);
    const promptId = str(r?.prompt_id);
    if (!promptId) {
      throw new NovaError(ErrorCodes.DEPENDENCY_FAILED, 'ComfyUI hat den Auftrag ohne Auftrags-ID beantwortet.', { severity: 'blocker', details: this.details({ path: '/prompt' }) });
    }
    return { promptId, number: num(r?.number), nodeErrors: asRecord(r?.node_errors) ?? {} };
  }

  /** GET /history/<id>: the entry once the prompt has finished (success or error), else null. */
  async history(promptId: string, opts?: RequestOptions): Promise<ComfyHistoryEntry | null> {
    const { data } = await this.json('GET', `/history/${encodeURIComponent(promptId)}`, undefined, opts);
    return parseHistoryEntry(asRecord(data)?.[promptId]);
  }

  /** GET /queue: ids of running and pending prompts (pending sorted by queue position). */
  async queue(opts?: RequestOptions): Promise<ComfyQueueState> {
    const { data } = await this.json('GET', '/queue', undefined, opts);
    const r = asRecord(data) ?? {};
    return {
      running: queueIds(r.queue_running).map((q) => q.id),
      pending: queueIds(r.queue_pending)
        .sort((a, b) => a.number - b.number)
        .map((q) => q.id),
    };
  }

  /** POST /interrupt. With promptId only that prompt is interrupted if it is running (older ComfyUI: global interrupt). */
  async interrupt(promptId?: string, opts?: RequestOptions): Promise<void> {
    await this.json('POST', '/interrupt', promptId ? { prompt_id: promptId } : {}, opts);
  }

  /** POST /queue { delete: [id] }: removes a prompt that has not started yet. */
  async deleteFromQueue(promptId: string, opts?: RequestOptions): Promise<void> {
    await this.json('POST', '/queue', { delete: [promptId] }, opts);
  }

  /** POST /free { unload_models, free_memory }: ComfyUI releases graphics memory after the current job. */
  async free(opts?: RequestOptions): Promise<void> {
    await this.json('POST', '/free', { unload_models: true, free_memory: true }, opts);
  }

  /** GET /view: downloads an output file (streamed; idle timeout instead of an overall limit). */
  async view(
    ref: { filename: string; subfolder?: string; type?: string },
    opts: { signal?: AbortSignal; idleTimeoutMs?: number; maxBytes?: number; onProgress?: (receivedBytes: number, totalBytes: number | null) => void } = {},
  ): Promise<Buffer> {
    const q = new URLSearchParams({ filename: ref.filename, subfolder: ref.subfolder ?? '', type: ref.type ?? 'output' });
    const path = `/view?${q.toString()}`;
    const res = await this.raw({
      method: 'GET',
      path,
      headers: { accept: '*/*' },
      signal: opts.signal,
      timeoutMs: opts.idleTimeoutMs ?? DEFAULT_VIEW_IDLE_MS,
      idle: true,
      maxBytes: opts.maxBytes ?? DEFAULT_MAX_VIEW_BYTES,
      onProgress: opts.onProgress,
    });
    if (res.status === 404) {
      throw new NovaError(ErrorCodes.NOT_FOUND, `Die Datei „${ref.filename}“ wurde in ComfyUI nicht gefunden.`, {
        severity: 'blocker',
        details: this.details({ path: '/view', status: 404 }),
      });
    }
    if (res.status < 200 || res.status >= 300) throw this.statusError('/view', res.status, res.body);
    return res.body;
  }

  // ---- watch ----------------------------------------------------------------------------------------------------------

  /** WebSocket URL of this client: ws(s)://host/ws?clientId=<id>. */
  webSocketUrl(): string {
    const u = new URL(`${this.baseUrl}/ws`);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.searchParams.set('clientId', this.clientId);
    return u.toString();
  }

  /**
   * Follows a queued prompt until it ends. Resolves with the history entry (outputs) on success; rejects with a German
   * NovaError on execution errors (VRAM_INSUFFICIENT for out of memory), interruption (CANCELLED), abort of `signal`
   * (CANCELLED) or when ComfyUI disappears. Events are delivered to `onEvent` (exceptions in it are ignored).
   */
  watch(promptId: string, onEvent: (event: ComfyWatchEvent) => void, signal?: AbortSignal): Promise<ComfyHistoryEntry> {
    if (signal?.aborted) return Promise.reject(cancelledError(this.baseUrl, signal.reason, { promptId }));
    return new Promise<ComfyHistoryEntry>((resolve, reject) => {
      const stop = new AbortController();
      let done = false;
      let ws: WebSocketLike | null = null;
      let active = false;
      let pollFailures = 0;
      let missingPolls = 0;
      let lastQueuePosition: number | null | undefined;
      let finishing = false;

      const emit = (event: ComfyWatchEvent) => {
        try {
          onEvent(event);
        } catch {
          // A failing listener must not break the watch.
        }
      };
      const cleanup = () => {
        done = true;
        stop.abort();
        signal?.removeEventListener('abort', onAbort);
        if (ws) {
          try {
            ws.close(1000, 'done');
          } catch {
            // socket already closed
          }
          ws = null;
        }
      };
      const succeed = (entry: ComfyHistoryEntry) => {
        if (done) return;
        cleanup();
        resolve(entry);
      };
      const fail = (err: NovaError) => {
        if (done) return;
        cleanup();
        reject(err);
      };
      const onAbort = () => fail(cancelledError(this.baseUrl, signal?.reason, { promptId }));
      signal?.addEventListener('abort', onAbort, { once: true });

      /** Final decision from a history entry; returns true when the watch ended. */
      const settleFromHistory = (entry: ComfyHistoryEntry): boolean => {
        const status = entry.status;
        if (status && status.status_str === 'error') {
          const err = status.messages.find((m) => m[0] === 'execution_error');
          if (err) fail(executionError(this.baseUrl, promptId, err[1]));
          else {
            const intr = status.messages.find((m) => m[0] === 'execution_interrupted');
            fail(intr ? interruptedError(this.baseUrl, promptId, intr[1]) : executionError(this.baseUrl, promptId, {}));
          }
          return true;
        }
        if (!status || status.completed || status.status_str === 'success') {
          succeed(entry);
          return true;
        }
        return false;
      };

      /** After a success signal: wait for the history entry (ComfyUI stores it right after execution_success). */
      const finishFromHistory = async () => {
        if (finishing || done) return;
        finishing = true;
        const deadline = Date.now() + HISTORY_WAIT_MS;
        let delay = Math.min(200, this.pollIntervalMs);
        while (!done) {
          try {
            const entry = await this.history(promptId, { signal: stop.signal });
            if (entry && settleFromHistory(entry)) return;
          } catch (e) {
            if (done) return;
            if (e instanceof NovaError && e.code === ErrorCodes.TOOL_MISSING && Date.now() > deadline) return fail(e);
          }
          if (Date.now() > deadline) {
            return fail(
              new NovaError(ErrorCodes.DEPENDENCY_FAILED, 'ComfyUI meldet den Auftrag als fertig, liefert aber kein Ergebnis.', {
                severity: 'blocker',
                details: this.details({ promptId, path: '/history' }),
                userAction: 'Den Auftrag erneut starten.',
              }),
            );
          }
          await sleep(delay, stop.signal);
          delay = this.pollIntervalMs;
        }
      };

      const handleMessage = (type: string, data: Record<string, unknown>) => {
        const pid = str(data.prompt_id);
        if (pid !== null && pid !== promptId) return;
        if (pid === null && !(active && (type === 'progress' || type === 'executing'))) return;
        switch (type) {
          case 'execution_start':
            active = true;
            emit({ type: 'execution_start' });
            break;
          case 'execution_cached':
            active = true;
            emit({ type: 'execution_cached', nodes: (Array.isArray(data.nodes) ? data.nodes : []).map(String) });
            break;
          case 'executing': {
            const node = data.node === null || data.node === undefined ? null : String(data.node);
            emit({ type: 'executing', node });
            if (node === null) void finishFromHistory();
            else active = true;
            break;
          }
          case 'progress':
            emit({ type: 'progress', node: data.node === null || data.node === undefined ? null : String(data.node), value: num(data.value) ?? 0, max: num(data.max) ?? 0 });
            break;
          case 'executed':
            emit({ type: 'executed', node: String(data.node ?? data.display_node ?? ''), output: data.output });
            break;
          case 'execution_success':
            emit({ type: 'execution_success' });
            void finishFromHistory();
            break;
          case 'execution_error': {
            const err = executionError(this.baseUrl, promptId, data);
            const d = err.details as ComfyErrorDetails;
            emit({ type: 'execution_error', nodeId: d.nodeId ?? null, nodeType: d.nodeType ?? null, exceptionType: d.exceptionType ?? null, exceptionMessage: d.exceptionMessage ?? '' });
            fail(err);
            break;
          }
          case 'execution_interrupted': {
            const err = interruptedError(this.baseUrl, promptId, data);
            const d = err.details as ComfyErrorDetails;
            emit({ type: 'execution_interrupted', nodeId: d.nodeId ?? null, nodeType: d.nodeType ?? null });
            fail(err);
            break;
          }
          default:
            break;
        }
      };

      /** One poll of /history; `full` (polling mode) also asks /queue for the queue position and lost prompts. */
      const pollOnce = async (full: boolean): Promise<void> => {
        try {
          const entry = await this.history(promptId, { signal: stop.signal, timeoutMs: Math.min(this.timeoutMs, 15_000) });
          pollFailures = 0;
          if (entry) {
            settleFromHistory(entry);
            return;
          }
          if (!full) return;
          const q = await this.queue({ signal: stop.signal, timeoutMs: Math.min(this.timeoutMs, 15_000) });
          if (q.running.includes(promptId)) {
            missingPolls = 0;
            if (!active) {
              active = true;
              emit({ type: 'execution_start' });
            }
          } else {
            const pos = q.pending.indexOf(promptId);
            if (pos >= 0) {
              missingPolls = 0;
              if (lastQueuePosition !== pos) emit({ type: 'queued', position: pos });
              lastQueuePosition = pos;
            } else if (++missingPolls >= MAX_MISSING_POLLS) {
              fail(
                new NovaError(ErrorCodes.DEPENDENCY_FAILED, 'Der Auftrag ist in ComfyUI nicht mehr vorhanden (gelöscht oder ComfyUI wurde neu gestartet).', {
                  severity: 'blocker',
                  details: this.details({ promptId, path: '/queue' }),
                  userAction: 'Den Auftrag erneut starten.',
                }),
              );
            }
          }
        } catch (e) {
          if (done) return;
          if (e instanceof NovaError && (e.code === ErrorCodes.TOOL_MISSING || e.code === ErrorCodes.DEPENDENCY_FAILED)) {
            if (++pollFailures >= MAX_POLL_FAILURES) {
              fail(
                new NovaError(ErrorCodes.TOOL_MISSING, 'Die Verbindung zu ComfyUI ist während der Erzeugung abgebrochen (ComfyUI beendet oder abgestürzt?).', {
                  severity: 'blocker',
                  cause: e,
                  details: this.details({ promptId }),
                  userAction: 'ComfyUI neu starten und den Auftrag erneut starten.',
                }),
              );
            }
            return;
          }
          fail(e instanceof NovaError ? e : new NovaError(ErrorCodes.DEPENDENCY_FAILED, `Fehler beim Abfragen von ComfyUI: ${short(String(e))}`, { details: this.details({ promptId }) }));
        }
      };

      let polling = false;
      const startPolling = async (reason: string) => {
        if (polling || done) return;
        polling = true;
        emit({ type: 'transport', transport: 'polling', reason });
        while (!done) {
          await pollOnce(true);
          if (done) break;
          await sleep(this.pollIntervalMs, stop.signal);
        }
      };

      const safetyNet = async () => {
        while (!done && !polling) {
          await sleep(this.safetyPollIntervalMs, stop.signal);
          if (done || polling) break;
          await pollOnce(false);
        }
      };

      if (!this.wsFactory) {
        void startPolling('Kein WebSocket verfügbar');
        return;
      }
      let socket: WebSocketLike;
      try {
        socket = this.wsFactory(this.webSocketUrl());
      } catch (e) {
        void startPolling(`WebSocket nicht möglich: ${short(e instanceof Error ? e.message : String(e), 120)}`);
        return;
      }
      ws = socket;
      try {
        socket.binaryType = 'arraybuffer';
      } catch {
        // read-only in some implementations
      }
      let opened = false;
      const connectTimer = setTimeout(() => {
        if (opened || done) return;
        try {
          socket.close();
        } catch {
          // ignore
        }
        if (ws === socket) ws = null;
        void startPolling('WebSocket-Verbindung kam nicht zustande');
      }, this.wsConnectTimeoutMs);
      stop.signal.addEventListener('abort', () => clearTimeout(connectTimer), { once: true });
      socket.addEventListener('open', () => {
        if (done || polling) return;
        opened = true;
        clearTimeout(connectTimer);
        emit({ type: 'transport', transport: 'websocket' });
        // The prompt may have finished before the socket was connected.
        void pollOnce(false).then(() => safetyNet());
      });
      socket.addEventListener('message', (event) => {
        if (done || polling || typeof event.data !== 'string') return;
        let msg: Record<string, unknown> | null = null;
        try {
          msg = asRecord(JSON.parse(event.data));
        } catch {
          return;
        }
        const type = str(msg?.type);
        const data = asRecord(msg?.data);
        if (type && data) handleMessage(type, data);
      });
      socket.addEventListener('error', () => {
        if (done) return;
        clearTimeout(connectTimer);
        if (ws === socket) ws = null;
        void startPolling('WebSocket-Fehler');
      });
      socket.addEventListener('close', () => {
        if (done) return;
        clearTimeout(connectTimer);
        if (ws === socket) ws = null;
        void startPolling('WebSocket wurde geschlossen');
      });
    });
  }
}
