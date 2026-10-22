// Model file downloads of the 3D workshop (docs/SPEC-3D.md §3): Hugging Face files into the ComfyUI models folder
// with progress, cancel, ".part" + HTTP range resume, sha256/size verification, a disk space check and the network
// approval for the Hugging Face hosts.
// Key decisions:
// - Host rules exactly like the rest of NOVA: a host allowed by settings.network.allowedHosts needs nothing; otherwise a
//   'network' approval with the own subject "threed-download:<host>" (an "always" rule for model downloads never covers
//   agent commands). Hugging Face and its download CDN (huggingface.co, *.huggingface.co, hf.co, *.hf.co) count as one
//   host family "huggingface.co", so the user decides once although the file bytes come from the CDN redirect target.
//   Settings are never widened. Only https is followed (redirects are checked hop by hop, at most 5).
// - The download is user-initiated (UI), so a pending approval does not fail the operation: it waits (cancellable) and
//   continues after the decision; a denial ends it with NETWORK_BLOCKED.
// - sha256: Hugging Face API paths-info (lfs.oid) → X-Linked-ETag of the resolve redirect → catalog value; otherwise
//   the size is checked. A resumed ".part" is re-hashed first so the final hash covers the whole file.
// - Free space: remaining bytes + 1 GB reserve (statfs) before anything is written.
// - Interrupted transfers keep their ".part" (resume next time); verification failures delete it. Transient network
//   errors are retried twice within the operation (resuming).
import { createHash, type Hash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { open, statfs, type FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Services } from '../contracts';
import { NovaError, errorMessage, isAbortError } from '../core/errors';
import { renameWithRetry, unlinkWithRetry } from '../core/fs-atomic';
import { hostMatches, hostOf, isHostAllowed } from '../core/net';
import { sleep } from '../core/time';
import { filePath, formatSize, type CatalogFile } from './catalog';

export const HF_HOST_FAMILY = ['huggingface.co', '*.huggingface.co', 'hf.co', '*.hf.co'];
export const DISK_RESERVE_BYTES = 1024 ** 3;
const MAX_REDIRECTS = 5;
const RETRY_DELAYS_MS = [2000, 5000];

export interface DownloadDeps {
  s: Services;
  fetch: typeof fetch;
  /** Free bytes on the drive of `dir` (null = unknown). */
  freeBytes: (dir: string) => Promise<number | null>;
  /** No data for this long → the transfer is aborted (and retried). Default 60 s. */
  idleTimeoutMs?: number;
  /** Minimum time between two progress reports. Default 250 ms. */
  progressIntervalMs?: number;
  /** Delays between retries (tests use [0, 0]). */
  retryDelaysMs?: number[];
}

export interface DownloadProgress {
  /** 0..100 over all files of this operation, or null while unknown. */
  percent: number | null;
  /** German status line. */
  message: string;
}

export async function statfsFreeBytes(dir: string): Promise<number | null> {
  try {
    let probe = dir;
    while (!existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const st = await statfs(probe);
    return Number(st.bavail) * Number(st.bsize);
  } catch {
    return null;
  }
}

function sizeOf(path: string): number | null {
  try {
    const st = statSync(path);
    return st.isFile() ? st.size : null;
  } catch {
    return null;
  }
}

/** Host family key used as approval subject ("huggingface.co" for the whole Hugging Face family). */
export function hostKey(host: string): string {
  return hostMatches(host, HF_HOST_FAMILY) ? 'huggingface.co' : host.toLowerCase();
}

class RetryableError extends Error {}

/**
 * Asks (or waits) for the network approval of a host family once per operation. Throws NETWORK_BLOCKED when the
 * user denies it or the URL is not https.
 */
export function createHostGate(deps: DownloadDeps, title: string, onWaiting: (message: string) => void) {
  const approved = new Set<string>();
  const log = deps.s.core.log.child('threed');
  return async function ensure(url: string, signal: AbortSignal): Promise<void> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new NovaError('NETWORK_BLOCKED', 'Die Download-Adresse ist ungültig.', { severity: 'warning' });
    }
    if (parsed.protocol !== 'https:') {
      throw new NovaError('NETWORK_BLOCKED', `NOVA lädt Modelle nur über verschlüsselte Verbindungen (https), nicht von „${parsed.host}“.`, { severity: 'warning' });
    }
    const host = hostOf(url) ?? parsed.host;
    const net = deps.s.core.settings.section('network');
    if (isHostAllowed(url, { allowedHosts: net.allowedHosts, extraUrls: [] })) return;
    const key = hostKey(host);
    if (approved.has(key)) return;
    const family = key === 'huggingface.co' ? '„huggingface.co“ und dessen Download-Server (*.hf.co)' : `„${key}“`;
    for (let round = 0; round < 3; round++) {
      const check = deps.s.approvals.check({
        projectId: null,
        taskId: null,
        runId: null,
        kind: 'network',
        title: `Download von ${key === 'huggingface.co' ? 'Hugging Face' : key} erlauben`,
        action: `NOVA möchte für die 3D-Werkstatt Modelldateien von ${family} herunterladen (${title}).`,
        consequences: 'NOVA verbindet sich mit diesem Server und speichert die Modelldateien im Modellordner von ComfyUI. Es werden keine Projektdaten gesendet.',
        subject: `threed-download:${key}`,
        details: { purpose: 'threed_download', host: key, hosts: key === 'huggingface.co' ? HF_HOST_FAMILY : [key] },
      });
      if (check.state === 'approved') {
        if (check.approval && !check.viaRule) {
          try {
            deps.s.approvals.consume(check.approval.id);
          } catch (e) {
            log.debug('Freigabe bereits verbraucht', { error: errorMessage(e) });
          }
        }
        approved.add(key);
        return;
      }
      if (check.state === 'denied') {
        try {
          deps.s.approvals.acknowledgeDenial(check.approval.id);
        } catch {
          /* best effort */
        }
        throw new NovaError('NETWORK_BLOCKED', `Der Download von ${family} wurde abgelehnt.`, {
          severity: 'warning',
          userAction: 'Den Download erneut starten und unter „Freigaben“ zustimmen oder den Server unter Einstellungen → Netzwerk erlauben.',
          details: { host: key },
        });
      }
      onWaiting(`Wartet auf Ihre Freigabe für ${family} (Seite „Freigaben“) …`);
      await deps.s.approvals.waitFor(check.approval.id, signal);
    }
    throw new NovaError('APPROVAL_REQUIRED', `Für den Download von ${family} ist eine Freigabe nötig.`, { severity: 'warning', details: { host: key } });
  };
}

interface RemoteMeta {
  sha256: string | null;
  size: number | null;
}

/** sha256 + size of a repository file from the Hugging Face API (null fields when unavailable). */
async function fetchHfMeta(deps: DownloadDeps, file: CatalogFile, ensure: (url: string, signal: AbortSignal) => Promise<void>, signal: AbortSignal): Promise<RemoteMeta> {
  const url = `https://huggingface.co/api/models/${file.repo}/paths-info/main`;
  try {
    await ensure(url, signal);
    const body = new URLSearchParams({ paths: file.repoPath, expand: 'false' });
    const res = await deps.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'NOVA-AI' },
      body: body.toString(),
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    });
    if (!res.ok) return { sha256: null, size: null };
    const data = (await res.json()) as unknown;
    const entry = Array.isArray(data) ? (data as Array<Record<string, unknown>>).find((e) => e && e.path === file.repoPath) : null;
    const lfs = entry && typeof entry.lfs === 'object' && entry.lfs ? (entry.lfs as Record<string, unknown>) : null;
    const sha = typeof lfs?.oid === 'string' && /^[0-9a-f]{64}$/i.test(lfs.oid) ? lfs.oid.toLowerCase() : null;
    const size = typeof lfs?.size === 'number' ? lfs.size : typeof entry?.size === 'number' ? (entry.size as number) : null;
    return { sha256: sha, size };
  } catch (e) {
    if (signal.aborted) throw e;
    if (e instanceof NovaError && (e.code === 'NETWORK_BLOCKED' || e.code === 'APPROVAL_REQUIRED')) throw e;
    return { sha256: null, size: null };
  }
}

async function hashExisting(path: string, hash: Hash, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(path, { highWaterMark: 4 * 1024 * 1024 });
    const onAbort = () => stream.destroy(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    stream.on('data', (chunk) => hash.update(chunk as Buffer));
    stream.on('error', (e) => {
      signal.removeEventListener('abort', onAbort);
      reject(e);
    });
    stream.on('end', () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    });
  });
}

function transientNetworkError(e: unknown): boolean {
  if (e instanceof RetryableError) return true;
  const text = `${errorMessage(e)} ${errorMessage((e as { cause?: unknown })?.cause ?? '')}`;
  return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|socket|terminated|other side closed|fetch failed|network/i.test(text);
}

/**
 * Downloads the given files (skips those already present) into modelsDir. Throws NovaError (German) on failure,
 * the abort reason on cancel.
 */
export async function downloadFiles(
  deps: DownloadDeps,
  input: { files: CatalogFile[]; modelsDir: string; title: string; signal: AbortSignal; onProgress: (p: DownloadProgress) => void; lockFile?: (key: string, fn: () => Promise<void>) => Promise<void> },
): Promise<{ downloaded: string[] }> {
  const { modelsDir, signal } = input;
  const log = deps.s.core.log.child('threed');
  const interval = deps.progressIntervalMs ?? 250;
  const idleTimeout = deps.idleTimeoutMs ?? 60_000;
  const retryDelays = deps.retryDelaysMs ?? RETRY_DELAYS_MS;
  const missing = input.files.filter((f) => (sizeOf(filePath(modelsDir, f)) ?? 0) === 0);
  if (missing.length === 0) return { downloaded: [] };

  // Free space for what is still missing (+ reserve).
  input.onProgress({ percent: null, message: 'Prüft den freien Speicherplatz …' });
  const remaining = missing.reduce((n, f) => n + Math.max(0, f.sizeBytes - (sizeOf(`${filePath(modelsDir, f)}.part`) ?? 0)), 0);
  const free = await deps.freeBytes(modelsDir);
  if (free !== null && free < remaining + DISK_RESERVE_BYTES) {
    throw new NovaError('DISK_FULL', `Zu wenig Speicherplatz: Der Download braucht ${formatSize(remaining + DISK_RESERVE_BYTES)} (inklusive 1 GB Reserve), frei sind nur ${formatSize(free)}.`, {
      severity: 'warning',
      userAction: 'Speicherplatz auf dem Laufwerk des ComfyUI-Modellordners freigeben oder einen anderen Modellordner wählen.',
      details: { required: remaining + DISK_RESERVE_BYTES, free, modelsDir },
    });
  }

  const ensure = createHostGate(deps, input.title, (message) => input.onProgress({ percent: null, message }));
  const totalBytes = missing.reduce((n, f) => n + f.sizeBytes, 0);
  let doneBefore = 0; // bytes of completed files
  let lastReport = 0;
  const report = (current: number, message: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < interval) return;
    lastReport = now;
    input.onProgress({ percent: totalBytes > 0 ? Math.min(99.9, ((doneBefore + current) / totalBytes) * 100) : null, message });
  };
  const downloaded: string[] = [];

  for (let index = 0; index < missing.length; index++) {
    const file = missing[index];
    const label = `Datei ${index + 1} von ${missing.length}: ${file.name}`;
    const work = async () => {
      if ((sizeOf(filePath(modelsDir, file)) ?? 0) > 0) return; // another operation finished it meanwhile
      for (let attempt = 0; ; attempt++) {
        try {
          await downloadOne(file, label);
          return;
        } catch (e) {
          if (signal.aborted || isAbortError(e)) throw e;
          if (!transientNetworkError(e) || attempt >= retryDelays.length) {
            if (e instanceof NovaError) throw e;
            throw new NovaError('PROVIDER_ERROR', `Der Download von ${file.name} ist fehlgeschlagen: ${errorMessage(e)}. Ein erneuter Start setzt an derselben Stelle fort.`, {
              severity: 'warning',
              cause: e,
            });
          }
          log.warn('Download unterbrochen – neuer Versuch', { file: file.name, attempt: attempt + 1, error: errorMessage(e) });
          report(0, `${label} – Verbindung unterbrochen, neuer Versuch …`, true);
          await sleep(retryDelays[attempt], signal);
        }
      }
    };
    if (input.lockFile) await input.lockFile(file.key, work);
    else await work();
    doneBefore += file.sizeBytes;
    downloaded.push(file.key);
    report(0, `${label} – fertig`, true);
  }
  return { downloaded };

  async function downloadOne(file: CatalogFile, label: string): Promise<void> {
    const finalPath = filePath(modelsDir, file);
    const partPath = `${finalPath}.part`;
    mkdirSync(dirname(finalPath), { recursive: true });
    const meta = await fetchHfMeta(deps, file, ensure, signal);
    let expectedSha = meta.sha256;
    let expectedSize = meta.size ?? file.sizeBytes;
    let offset = sizeOf(partPath) ?? 0;
    if (offset > expectedSize) {
      unlinkWithRetry(partPath);
      offset = 0;
    }

    // Follow redirects manually so every hop passes the host rules.
    let url = file.url;
    let res: Response | null = null;
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    let idleTimer: NodeJS.Timeout | null = null;
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(new RetryableError('Zeitüberschreitung: der Server sendet keine Daten mehr')), idleTimeout);
      idleTimer.unref?.();
    };
    try {
      armIdle();
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        await ensure(url, signal);
        const headers: Record<string, string> = { 'user-agent': 'NOVA-AI', 'accept-encoding': 'identity' };
        if (offset > 0) headers.range = `bytes=${offset}-`;
        const r = await deps.fetch(url, { headers, redirect: 'manual', signal: combined });
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
          const linked = (r.headers.get('x-linked-etag') ?? '').replace(/^W\//, '').replace(/"/g, '').toLowerCase();
          if (!expectedSha && /^[0-9a-f]{64}$/.test(linked)) expectedSha = linked;
          const linkedSize = Number(r.headers.get('x-linked-size'));
          if (meta.size === null && Number.isFinite(linkedSize) && linkedSize > 0) expectedSize = linkedSize;
          await r.body?.cancel().catch(() => undefined);
          url = new URL(r.headers.get('location') as string, url).toString();
          continue;
        }
        res = r;
        break;
      }
      if (!res) throw new NovaError('PROVIDER_ERROR', `Zu viele Weiterleitungen beim Download von ${file.name}.`, { severity: 'warning' });
      expectedSha ??= file.sha256;

      let complete = false;
      if (res.status === 416 && offset > 0 && offset === expectedSize) {
        complete = true;
        await res.body?.cancel().catch(() => undefined);
      } else if (res.status === 200) {
        offset = 0;
      } else if (res.status === 206) {
        const range = /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(res.headers.get('content-range') ?? '');
        if (!range || Number(range[1]) !== offset) {
          await res.body?.cancel().catch(() => undefined);
          unlinkWithRetry(partPath);
          throw new RetryableError('Der Server hat den Download nicht an der richtigen Stelle fortgesetzt');
        }
      } else {
        await res.body?.cancel().catch(() => undefined);
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          throw new NovaError('PROVIDER_ERROR', `Die Datei ${file.name} ist auf Hugging Face nicht (mehr) verfügbar (HTTP ${res.status}).`, { severity: 'warning' });
        }
        if (res.status >= 500 || res.status === 429) throw new RetryableError(`HTTP ${res.status}`);
        throw new NovaError('PROVIDER_ERROR', `Der Download von ${file.name} ist fehlgeschlagen (HTTP ${res.status}).`, { severity: 'warning' });
      }

      const hash = expectedSha ? createHash('sha256') : null;
      if (hash && offset > 0) {
        report(offset, `${label} – prüft bereits geladene Daten …`, true);
        await hashExisting(partPath, hash, signal);
      }

      if (!complete) {
        const handle: FileHandle = await open(partPath, offset > 0 ? 'a' : 'w');
        let written = offset;
        try {
          if (!res.body) throw new RetryableError('Leere Antwort');
          for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            armIdle();
            const buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            let off = 0;
            while (off < buf.length) {
              const { bytesWritten } = await handle.write(buf, off, buf.length - off);
              off += bytesWritten;
            }
            hash?.update(buf);
            written += buf.length;
            if (written > expectedSize) break;
            report(written, `${label} – ${formatSize(written)} von ${formatSize(expectedSize)}`);
          }
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (combined.aborted) throw controller.signal.aborted && !signal.aborted ? (controller.signal.reason as Error) : signal.reason;
        if (written < expectedSize) throw new RetryableError(`Verbindung nach ${formatSize(written)} von ${formatSize(expectedSize)} beendet`);
      }

      report(expectedSize, `${label} – wird geprüft …`, true);
      const size = sizeOf(partPath) ?? 0;
      if (size !== expectedSize) {
        unlinkWithRetry(partPath);
        throw new NovaError('PROVIDER_ERROR', `Die Datei ${file.name} hat die falsche Größe (${formatSize(size)} statt ${formatSize(expectedSize)}). Sie wurde verworfen; bitte den Download erneut starten.`, {
          severity: 'warning',
        });
      }
      if (hash && expectedSha) {
        const actual = hash.digest('hex');
        if (actual !== expectedSha) {
          unlinkWithRetry(partPath);
          throw new NovaError('PROVIDER_ERROR', `Die Prüfsumme von ${file.name} stimmt nicht (beschädigter Download). Die Datei wurde verworfen; bitte den Download erneut starten.`, {
            severity: 'warning',
            details: { expected: expectedSha, actual },
          });
        }
      }
      renameWithRetry(partPath, finalPath);
      log.info('3D-Modelldatei heruntergeladen', { file: file.key, bytes: expectedSize, verified: hash ? 'sha256' : 'size' });
    } catch (e) {
      if (controller.signal.aborted && !signal.aborted) throw new RetryableError(errorMessage(controller.signal.reason));
      throw e;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
    }
  }
}
