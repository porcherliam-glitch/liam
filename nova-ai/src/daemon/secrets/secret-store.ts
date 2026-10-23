// SecretStore (contract: src/daemon/contracts.ts; SPEC §4.9, §6.9): API keys encrypted with an OS mechanism, table
// `secrets` records every stored id (+ ciphertext where the OS keeps no copy).
// Key decisions:
// - Scheme choice: Windows → dpapi (NEVER a fallback: any failure is SECRET_STORE "Der Windows-Schlüsselspeicher ist
//   nicht verfügbar. API-Schlüssel bitte erneut eingeben."); macOS → keychain (`security`); Linux → libsecret when
//   `secret-tool` exists AND a real round trip works, otherwise aes-local (secure=false, warning error dedupeKey
//   'secret-store-insecure'); 'memory' for tests (nothing touches disk). `opts.scheme` forces a scheme.
// - DPAPI: one PowerShell process per batch with script + base64 data on stdin (dpapi.ts). loadAll() decrypts every
//   dpapi row in ONE batch; set()/get()-miss are batches of one.
// - Decrypted values live in an in-memory cache and are registered with the redactor (registerSecret) so they never
//   reach logs, errors, agent steps or exports. Values are never logged; failure reasons are data-free codes.
// - Each row remembers its scheme, so rows written by an older scheme (e.g. aes-local before secret-tool was installed)
//   still decrypt; the next set() re-encrypts with the current scheme.
// - Rows that cannot be decrypted (other Windows account, keyring item removed, key file damaged) are kept (never
//   silently deleted), has() reports false for them, get() throws SECRET_STORE and an error report asks the user to
//   re-enter the key. A total failure of the OS store is reported (dedupeKey 'secret-store-unavailable') and thrown.
// - All operations are serialized (one OS call at a time, no read/write races between loadAll, set and delete).
import { accessSync, constants as fsConstants, existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { SecretStore, Services } from '../contracts';
import { NovaError, errorMessage } from '../core/errors';
import { registerSecret } from '../core/redact';
import { defaultPowerShellStdinRunner, runDpapiBatch, type PowerShellStdinRunner } from './dpapi';
import { aesDecrypt, aesEncrypt, loadOrCreateKey } from './aes-local';
import {
  SECRET_TOOL,
  SECURITY_TOOL,
  defaultToolRunner,
  keychainDelete,
  keychainLookup,
  keychainStore,
  libsecretClear,
  libsecretLookup,
  libsecretProbe,
  libsecretStore,
  type ToolRunner,
} from './os-keyring';

export type SecretScheme = SecretStore['scheme'];

export interface SecretStoreOptions {
  /** Forces a scheme (tests: 'memory'; app.ts may pass 'aes-local'). */
  scheme?: SecretScheme;
  /** Defaults to core.platform. */
  platform?: NodeJS.Platform;
  /** Runs `powershell.exe … -Command -` with stdin (DPAPI). Injected in tests. */
  powershell?: PowerShellStdinRunner;
  /** argv runner for secret-tool / security. Injected in tests. */
  runTool?: ToolRunner;
  /** Synchronous PATH lookup (decides whether secret-tool exists). */
  commandExists?: (name: string) => boolean;
  /** aes-local key file (default <dataDir>/secret.key). */
  keyFile?: string;
}

const KEYRING_MARKER = 'os-keyring';
const MAX_ID_LENGTH = 200;
const MAX_VALUE_LENGTH = 64 * 1024;

interface SecretRow {
  id: string;
  scheme: string;
  ciphertext: string;
}

function defaultCommandExists(name: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    try {
      accessSync(join(dir, name), fsConstants.X_OK);
      return true;
    } catch {
      /* next */
    }
  }
  return false;
}

function chooseScheme(platform: NodeJS.Platform, commandExists: (name: string) => boolean): SecretScheme {
  if (platform === 'win32') return 'dpapi';
  if (platform === 'darwin') return existsSync(SECURITY_TOOL) ? 'keychain' : 'aes-local';
  return commandExists(SECRET_TOOL) ? 'libsecret' : 'aes-local';
}

function unavailableMessage(scheme: SecretScheme): string {
  switch (scheme) {
    case 'dpapi':
      return 'Der Windows-Schlüsselspeicher ist nicht verfügbar. API-Schlüssel bitte erneut eingeben.';
    case 'libsecret':
      return 'Der Linux-Schlüsselbund (Secret Service) ist nicht verfügbar. API-Schlüssel bitte erneut eingeben.';
    case 'keychain':
      return 'Der macOS-Schlüsselbund ist nicht verfügbar. API-Schlüssel bitte erneut eingeben.';
    case 'aes-local':
      return 'Der lokale Schlüsselspeicher ist nicht lesbar (Schlüsseldatei fehlt oder ist beschädigt). API-Schlüssel bitte erneut eingeben.';
    default:
      return 'Der Schlüsselspeicher ist nicht verfügbar. API-Schlüssel bitte erneut eingeben.';
  }
}

function validateId(id: string): void {
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new NovaError('VALIDATION', 'Ungültige Kennung für einen gespeicherten Schlüssel.', { severity: 'warning' });
  }
}

function validateValue(value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new NovaError('VALIDATION', 'Der Schlüssel darf nicht leer sein.', { severity: 'warning' });
  }
  if (value.length > MAX_VALUE_LENGTH) {
    throw new NovaError('VALIDATION', 'Der Schlüssel ist zu lang.', { severity: 'warning' });
  }
}

export interface SecretStoreImpl extends SecretStore {
  /** Ids that exist in the database but could not be decrypted (diagnostics/tests). */
  unreadableIds(): string[];
}

export function createSecretStore(s: Services, opts: SecretStoreOptions = {}): SecretStoreImpl {
  const core = s.core;
  const log = core.log.child('secrets');
  const platform = opts.platform ?? core.platform;
  const powershell = opts.powershell ?? defaultPowerShellStdinRunner;
  const runTool = opts.runTool ?? defaultToolRunner;
  const keyFile = opts.keyFile ?? join(core.paths.root, 'secret.key');
  const commandExists = opts.commandExists ?? defaultCommandExists;

  let scheme: SecretScheme = opts.scheme ?? chooseScheme(platform, commandExists);
  let probed = scheme !== 'libsecret';
  const cache = new Map<string, string>();
  const memoryValues = new Map<string, string>();
  const unreadable = new Set<string>();
  let insecureReported = false;

  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn, fn);
    chain = p.catch(() => undefined);
    return p;
  };

  const storeError = (forScheme: SecretScheme, reason: string, cause?: unknown): NovaError =>
    new NovaError('SECRET_STORE', unavailableMessage(forScheme), {
      severity: 'blocker',
      userAction: 'API-Schlüssel unter „Modelle“ erneut eingeben. Bleibt der Fehler bestehen, NOVA neu starten.',
      details: { scheme: forScheme, reason },
      cause,
    });

  const reportUnavailable = (forScheme: SecretScheme, reason: string): void => {
    try {
      core.errors.report({
        code: 'SECRET_STORE',
        severity: 'blocker',
        title: 'Schlüsselspeicher nicht verfügbar',
        whatHappened: unavailableMessage(forScheme),
        attempted: ['Gespeicherte API-Schlüssel entschlüsseln bzw. speichern'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'API-Schlüssel unter „Modelle“ erneut eingeben. Bleibt der Fehler bestehen, NOVA neu starten. Lokale Modelle (Ollama) funktionieren weiterhin.',
        details: `Schema: ${forScheme}, Ursache: ${reason}`,
        dedupeKey: 'secret-store-unavailable',
      });
    } catch (e) {
      log.warn('Fehlerbericht zum Schlüsselspeicher fehlgeschlagen', { error: errorMessage(e) });
    }
  };

  const reportUnreadable = (): void => {
    if (unreadable.size === 0) return;
    try {
      core.errors.report({
        code: 'SECRET_STORE',
        severity: 'warning',
        title: 'Gespeicherte API-Schlüssel nicht lesbar',
        whatHappened: `${unreadable.size === 1 ? 'Ein gespeicherter API-Schlüssel kann' : `${unreadable.size} gespeicherte API-Schlüssel können`} nicht entschlüsselt werden (z. B. nach einem Wechsel des Windows-Kontos oder PCs).`,
        attempted: ['Schlüssel mit dem Schlüsselspeicher des Betriebssystems entschlüsseln'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Die betroffenen API-Schlüssel unter „Modelle“ erneut eingeben.',
        details: null,
        dedupeKey: 'secret-store-unreadable',
      });
    } catch (e) {
      log.warn('Fehlerbericht zum Schlüsselspeicher fehlgeschlagen', { error: errorMessage(e) });
    }
  };

  const reportInsecure = (): void => {
    if (scheme !== 'aes-local' || insecureReported) return;
    insecureReported = true;
    try {
      core.errors.report({
        code: 'SECRET_STORE',
        severity: 'warning',
        title: 'Schlüsselspeicher eingeschränkt sicher',
        whatHappened:
          'Auf diesem System steht kein Schlüsselspeicher des Betriebssystems zur Verfügung. API-Schlüssel werden mit einem lokalen Schlüssel im Datenordner verschlüsselt. Wer den Datenordner lesen kann, kann sie entschlüsseln.',
        attempted: ['Schlüsselspeicher des Betriebssystems gesucht'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Für mehr Sicherheit einen Schlüsselbund (Secret Service, z. B. GNOME Keyring) einrichten oder keine Cloud-Schlüssel hinterlegen.',
        details: null,
        dedupeKey: 'secret-store-insecure',
      });
    } catch (e) {
      log.warn('Fehlerbericht zum Schlüsselspeicher fehlgeschlagen', { error: errorMessage(e) });
    }
  };

  /** Linux: decide libsecret vs aes-local with a real round trip (once). */
  const ensureScheme = async (): Promise<void> => {
    if (probed) return;
    probed = true;
    if (scheme !== 'libsecret') return;
    const ok = await libsecretProbe(runTool);
    if (!ok) {
      log.warn('secret-tool ist vorhanden, aber kein Schlüsselbund nutzbar – lokaler Schlüssel wird verwendet');
      scheme = 'aes-local';
    }
  };

  const remember = (id: string, value: string): void => {
    cache.set(id, value);
    unreadable.delete(id);
    registerSecret(value);
  };

  const rowOf = (id: string): SecretRow | undefined => core.db.get<SecretRow>('SELECT id, scheme, ciphertext FROM secrets WHERE id = ?', [id]);

  const upsertRow = (id: string, rowScheme: SecretScheme, ciphertext: string): void => {
    core.db.run(
      'INSERT INTO secrets(id, scheme, ciphertext, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET scheme = excluded.scheme, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at',
      [id, rowScheme, ciphertext, core.clock.now()],
    );
  };

  /** Decrypts rows; returns values per id (null = unreadable). Throws only for a total DPAPI batch failure. */
  const decryptRows = async (rows: SecretRow[]): Promise<Map<string, string | null>> => {
    const out = new Map<string, string | null>();
    const dpapiRows = rows.filter((r) => r.scheme === 'dpapi');
    if (dpapiRows.length > 0) {
      if (scheme !== 'dpapi') {
        for (const r of dpapiRows) out.set(r.id, null);
      } else {
        let results;
        try {
          results = await runDpapiBatch(
            powershell,
            dpapiRows.map((r) => ({ op: 'unprotect' as const, id: r.id, data: r.ciphertext })),
          );
        } catch (e) {
          throw storeError('dpapi', errorMessage(e), e);
        }
        for (const r of dpapiRows) {
          const res = results.get(r.id);
          if (res?.ok && typeof res.data === 'string') out.set(r.id, Buffer.from(res.data, 'base64').toString('utf8'));
          else {
            log.warn('DPAPI-Eintrag nicht entschlüsselbar', { id: r.id, error: res?.error ?? 'unknown' });
            out.set(r.id, null);
          }
        }
      }
    }
    const aesRows = rows.filter((r) => r.scheme === 'aes-local');
    if (aesRows.length > 0) {
      const key = existsSync(keyFile) ? loadOrCreateKey(keyFile, platform) : null;
      for (const r of aesRows) {
        const value = key && key.ok ? aesDecrypt(key.key, r.id, r.ciphertext) : null;
        if (value === null) log.warn('Lokal verschlüsselter Eintrag nicht lesbar', { id: r.id, reason: key ? (key.ok ? 'auth' : key.reason) : 'no-key' });
        out.set(r.id, value);
      }
    }
    for (const r of rows.filter((x) => x.scheme === 'libsecret')) {
      const v = scheme === 'libsecret' ? await libsecretLookup(runTool, r.id) : null;
      out.set(r.id, typeof v === 'string' ? v : null);
    }
    for (const r of rows.filter((x) => x.scheme === 'keychain')) {
      const v = scheme === 'keychain' ? await keychainLookup(runTool, r.id) : null;
      out.set(r.id, typeof v === 'string' ? v : null);
    }
    for (const r of rows) if (!out.has(r.id)) out.set(r.id, null); // unknown scheme
    return out;
  };

  const encryptAndStore = async (id: string, value: string): Promise<void> => {
    const previous = rowOf(id);
    switch (scheme) {
      case 'dpapi': {
        let results;
        try {
          results = await runDpapiBatch(powershell, [{ op: 'protect', id, data: Buffer.from(value, 'utf8').toString('base64') }]);
        } catch (e) {
          reportUnavailable('dpapi', errorMessage(e));
          throw storeError('dpapi', errorMessage(e), e);
        }
        const r = results.get(id);
        if (!r?.ok || typeof r.data !== 'string' || r.data.length === 0) {
          reportUnavailable('dpapi', `protect:${r?.error ?? 'unknown'}`);
          throw storeError('dpapi', `protect:${r?.error ?? 'unknown'}`);
        }
        upsertRow(id, 'dpapi', r.data);
        break;
      }
      case 'aes-local': {
        const key = loadOrCreateKey(keyFile, platform);
        if (!key.ok) {
          reportUnavailable('aes-local', key.reason);
          throw storeError('aes-local', key.reason);
        }
        upsertRow(id, 'aes-local', aesEncrypt(key.key, id, value));
        reportInsecure();
        break;
      }
      case 'libsecret': {
        if (!(await libsecretStore(runTool, id, value))) {
          reportUnavailable('libsecret', 'store');
          throw storeError('libsecret', 'store');
        }
        upsertRow(id, 'libsecret', KEYRING_MARKER);
        break;
      }
      case 'keychain': {
        if (!(await keychainStore(runTool, id, value))) {
          reportUnavailable('keychain', 'store');
          throw storeError('keychain', 'store');
        }
        upsertRow(id, 'keychain', KEYRING_MARKER);
        break;
      }
      default:
        throw new NovaError('INTERNAL', 'Unbekanntes Verfahren des Schlüsselspeichers.');
    }
    // Remove the copy in a keyring of a previous scheme (best effort; the database row now points to the new copy).
    if (previous && previous.scheme !== scheme) {
      if (previous.scheme === 'libsecret') await libsecretClear(runTool, id);
      if (previous.scheme === 'keychain') await keychainDelete(runTool, id);
    }
  };

  const store: SecretStoreImpl = {
    get scheme() {
      return scheme;
    },
    get secure() {
      return scheme !== 'aes-local';
    },

    async loadAll() {
      if (scheme === 'memory') return;
      return serial(async () => {
        await ensureScheme();
        const rows = core.db.all<SecretRow>('SELECT id, scheme, ciphertext FROM secrets ORDER BY id');
        let values: Map<string, string | null>;
        try {
          values = await decryptRows(rows);
        } catch (e) {
          const reason = e instanceof NovaError ? String((e.details as { reason?: string } | undefined)?.reason ?? e.message) : errorMessage(e);
          log.error('Schlüsselspeicher nicht verfügbar', { scheme, reason });
          reportUnavailable(scheme, reason);
          throw e;
        }
        for (const [id, value] of values) {
          if (value === null) unreadable.add(id);
          else remember(id, value);
        }
        reportUnreadable();
        reportInsecure();
        log.info('Schlüsselspeicher geladen', { scheme, count: rows.length, unreadable: unreadable.size });
      });
    },

    async set(id, value) {
      validateId(id);
      validateValue(value);
      if (scheme === 'memory') {
        memoryValues.set(id, value);
        registerSecret(value);
        return;
      }
      return serial(async () => {
        await ensureScheme();
        await encryptAndStore(id, value);
        remember(id, value);
        if (unreadable.size === 0) core.errors.resolveWhere({ dedupeKey: 'secret-store-unreadable' });
        core.errors.resolveWhere({ dedupeKey: 'secret-store-unavailable' });
      });
    },

    async get(id) {
      validateId(id);
      if (scheme === 'memory') return memoryValues.get(id) ?? null;
      const hit = cache.get(id);
      if (hit !== undefined) return hit;
      return serial(async () => {
        const again = cache.get(id);
        if (again !== undefined) return again;
        await ensureScheme();
        const row = rowOf(id);
        if (!row) return null;
        let values: Map<string, string | null>;
        try {
          values = await decryptRows([row]);
        } catch (e) {
          reportUnavailable(scheme, e instanceof NovaError ? String((e.details as { reason?: string } | undefined)?.reason ?? '') : errorMessage(e));
          throw e;
        }
        const value = values.get(id) ?? null;
        if (value === null) {
          unreadable.add(id);
          reportUnreadable();
          throw storeError((row.scheme as SecretScheme) ?? scheme, 'unreadable');
        }
        remember(id, value);
        return value;
      });
    },

    async delete(id) {
      validateId(id);
      if (scheme === 'memory') {
        memoryValues.delete(id);
        return;
      }
      return serial(async () => {
        const row = rowOf(id);
        if (row?.scheme === 'libsecret' && !(await libsecretClear(runTool, id))) {
          log.warn('Eintrag im Schlüsselbund konnte nicht entfernt werden', { id });
        }
        if (row?.scheme === 'keychain' && !(await keychainDelete(runTool, id))) {
          log.warn('Eintrag im Schlüsselbund konnte nicht entfernt werden', { id });
        }
        core.db.run('DELETE FROM secrets WHERE id = ?', [id]);
        cache.delete(id);
        unreadable.delete(id);
        if (unreadable.size === 0) core.errors.resolveWhere({ dedupeKey: 'secret-store-unreadable' });
      });
    },

    has(id) {
      if (scheme === 'memory') return memoryValues.has(id);
      if (cache.has(id)) return true;
      if (unreadable.has(id)) return false;
      return !!core.db.get('SELECT 1 FROM secrets WHERE id = ?', [id]);
    },

    unreadableIds() {
      return [...unreadable].sort();
    },
  };
  return store;
}
