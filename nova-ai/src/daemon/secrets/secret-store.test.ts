import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { redactString, _clearRegisteredSecrets } from '../core/redact';
import { NovaError } from '../core/errors';
import { createSecretStore, type SecretStoreOptions } from './secret-store';
import {
  DPAPI_ENTROPY_PREFIX,
  DPAPI_POWERSHELL,
  DPAPI_POWERSHELL_ARGS,
  DPAPI_RESULT_MARKER,
  buildDpapiStdin,
  parseDpapiOutput,
  type PowerShellStdinRunner,
} from './dpapi';
import { aesDecrypt, aesEncrypt, loadOrCreateKey } from './aes-local';
import type { ToolRunner } from './os-keyring';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
  _clearRegisteredSecrets();
});

function setup(opts: SecretStoreOptions) {
  t = createTestCore();
  const s = makeServices(t.core);
  return { core: t.core, store: createSecretStore(s, opts) };
}

// ------------------------------------------------------------------------------------------------ fake DPAPI runner

interface PsCall {
  file: string;
  args: readonly string[];
  stdin: string;
}

/** Simulates powershell.exe executing the DPAPI script: decodes the embedded request and answers like the script. */
function fakeDpapi(opts: { fail?: 'exit' | 'marker' | 'garbage' | 'throw'; corruptIds?: string[] } = {}) {
  const calls: PsCall[] = [];
  const runner: PowerShellStdinRunner = async (file, args, stdin) => {
    calls.push({ file, args, stdin });
    if (opts.fail === 'throw') throw Object.assign(new Error('spawn powershell.exe ENOENT'), { code: 'ENOENT' });
    if (opts.fail === 'exit') return { code: 1, stdout: '', stderr: 'boom' };
    if (opts.fail === 'marker') return { code: 2, stdout: 'NOVA-DPAPI-ERROR:FileNotFoundException\r\n', stderr: '' };
    if (opts.fail === 'garbage') return { code: 0, stdout: 'hello\r\n', stderr: '' };
    const m = /FromBase64String\('([A-Za-z0-9+/=]+)'\)\)\|ConvertFrom-Json/.exec(stdin);
    if (!m) throw new Error('payload not found');
    const req = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as { items: Array<{ op: string; id: string; data: string }> };
    const out = req.items.map((it) => {
      const entropy = DPAPI_ENTROPY_PREFIX + it.id;
      if (it.op === 'protect') {
        const blob = Buffer.from(JSON.stringify({ e: entropy, d: it.data }), 'utf8').toString('base64');
        return { id: it.id, ok: true, data: blob };
      }
      if (opts.corruptIds?.includes(it.id)) return { id: it.id, ok: false, error: 'CryptographicException' };
      try {
        const parsed = JSON.parse(Buffer.from(it.data, 'base64').toString('utf8')) as { e: string; d: string };
        if (parsed.e !== entropy) return { id: it.id, ok: false, error: 'CryptographicException' };
        return { id: it.id, ok: true, data: parsed.d };
      } catch {
        return { id: it.id, ok: false, error: 'FormatException' };
      }
    });
    return { code: 0, stdout: `${DPAPI_RESULT_MARKER}${JSON.stringify(out)}\r\n`, stderr: '' };
  };
  return { runner, calls };
}

describe('DPAPI script', () => {
  it('is a single ASCII line with base64 payload and never contains the plaintext', () => {
    const secret = 'sk-ant-api03-ÄÖÜ-supersecretvalue-1234567890';
    const stdin = buildDpapiStdin([{ op: 'protect', id: 'provider:anthropic', data: Buffer.from(secret, 'utf8').toString('base64') }]);
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]*\r\n\r\n$/.test(stdin)).toBe(true);
    expect(stdin.trimEnd().split(/\r?\n/)).toHaveLength(1);
    expect(stdin).not.toContain(secret);
    expect(stdin).not.toContain('supersecret');
    expect(stdin).toContain('ProtectedData]::Protect');
    expect(stdin).toContain('CurrentUser');
    expect(stdin).toContain(`'${DPAPI_ENTROPY_PREFIX}'+[string]$it.id`);
    expect(stdin).toContain('Add-Type -AssemblyName System.Security');
  });

  it('parses results and rejects broken output without echoing stdout', () => {
    const ok = parseDpapiOutput({ code: 0, stdout: `noise\r\n${DPAPI_RESULT_MARKER}[{"id":"a","ok":true,"data":"QQ=="}]\r\n`, stderr: '' });
    expect(ok).toEqual({ ok: true, items: [{ id: 'a', ok: true, data: 'QQ==', error: undefined }] });
    const single = parseDpapiOutput({ code: 0, stdout: `${DPAPI_RESULT_MARKER}{"id":"a","ok":false,"error":"CryptographicException"}`, stderr: '' });
    expect(single.ok && single.items[0].error).toBe('CryptographicException');
    expect(parseDpapiOutput({ code: 2, stdout: 'NOVA-DPAPI-ERROR:Foo Bar\r\n', stderr: '' })).toEqual({ ok: false, reason: 'powershell:FooBar' });
    expect(parseDpapiOutput({ code: 0, stdout: 'plain secret text', stderr: '' })).toEqual({ ok: false, reason: 'no-result' });
    expect(parseDpapiOutput({ code: 1, stdout: '', stderr: '' })).toEqual({ ok: false, reason: 'exit:1' });
    expect(parseDpapiOutput({ code: null, stdout: '', stderr: '', timedOut: true })).toEqual({ ok: false, reason: 'timeout' });
    expect(parseDpapiOutput({ code: 0, stdout: `${DPAPI_RESULT_MARKER}{oops`, stderr: '' })).toEqual({ ok: false, reason: 'bad-json' });
  });
});

describe('SecretStore – Windows DPAPI path (fake PowerShell)', () => {
  it('chooses dpapi on win32, sends script + data only via stdin and caches values', async () => {
    const ps = fakeDpapi();
    const { store, core } = setup({ platform: 'win32', powershell: ps.runner });
    expect(store.scheme).toBe('dpapi');
    expect(store.secure).toBe(true);
    const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
    await store.set('provider:openai', key);
    expect(ps.calls).toHaveLength(1);
    const call = ps.calls[0];
    expect(call.file).toBe(DPAPI_POWERSHELL);
    expect(call.args).toEqual(DPAPI_POWERSHELL_ARGS);
    expect([...call.args]).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-']);
    expect(call.args.join(' ')).not.toContain(key);
    expect(call.stdin).not.toContain(key);
    const row = core.db.get<{ scheme: string; ciphertext: string }>('SELECT scheme, ciphertext FROM secrets WHERE id = ?', ['provider:openai']);
    expect(row?.scheme).toBe('dpapi');
    expect(row?.ciphertext).not.toContain(key);
    expect(store.has('provider:openai')).toBe(true);
    expect(await store.get('provider:openai')).toBe(key);
    expect(ps.calls).toHaveLength(1); // served from cache
    expect(redactString(`header ${key}`)).toBe('header [GEHEIM]');
  });

  it('loadAll decrypts every row in ONE PowerShell batch and registers values with the redactor', async () => {
    const ps = fakeDpapi();
    const first = setup({ platform: 'win32', powershell: ps.runner });
    await first.store.set('provider:a', 'value-aaaaaaaaaaaa');
    await first.store.set('provider:b', 'value-bbbbbbbbbbbb');
    await first.store.set('provider:c', 'value-cccccccccccc');
    _clearRegisteredSecrets();
    // A second store on the same database = daemon restart.
    const ps2 = fakeDpapi();
    const store2 = createSecretStore(makeServices(first.core), { platform: 'win32', powershell: ps2.runner });
    await store2.loadAll();
    expect(ps2.calls).toHaveLength(1);
    const req = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(ps2.calls[0].stdin)!;
    const items = (JSON.parse(Buffer.from(req[1], 'base64').toString('utf8')) as { items: Array<{ op: string; id: string }> }).items;
    expect(items.map((i) => `${i.op}:${i.id}`)).toEqual(['unprotect:provider:a', 'unprotect:provider:b', 'unprotect:provider:c']);
    expect(await store2.get('provider:b')).toBe('value-bbbbbbbbbbbb');
    expect(ps2.calls).toHaveLength(1);
    expect(redactString('x value-cccccccccccc y')).toBe('x [GEHEIM] y');
  });

  it('loadAll without rows does not start PowerShell', async () => {
    const ps = fakeDpapi({ fail: 'throw' });
    const { store } = setup({ platform: 'win32', powershell: ps.runner });
    await store.loadAll();
    expect(ps.calls).toHaveLength(0);
  });

  it('a failing PowerShell is SECRET_STORE with the exact German message, an error report and no fallback', async () => {
    for (const fail of ['throw', 'exit', 'marker', 'garbage'] as const) {
      const ps = fakeDpapi({ fail });
      const { store, core } = setup({ platform: 'win32', powershell: ps.runner });
      const err = await store.set('provider:x', 'value-xxxxxxxxxx').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NovaError);
      expect((err as NovaError).code).toBe('SECRET_STORE');
      expect((err as NovaError).message).toBe('Der Windows-Schlüsselspeicher ist nicht verfügbar. API-Schlüssel bitte erneut eingeben.');
      expect(JSON.stringify((err as NovaError).details)).not.toContain('value-xxxxxxxxxx');
      expect(store.scheme).toBe('dpapi');
      expect(store.has('provider:x')).toBe(false);
      expect(core.db.get('SELECT 1 FROM secrets')).toBeUndefined();
      const reports = core.errors.list();
      expect(reports.some((r) => r.code === 'SECRET_STORE' && r.severity === 'blocker')).toBe(true);
      t?.cleanup();
      t = null;
    }
  });

  it('loadAll failure throws SECRET_STORE and keeps rows; get() retries later', async () => {
    const ok = fakeDpapi();
    const first = setup({ platform: 'win32', powershell: ok.runner });
    await first.store.set('provider:a', 'value-aaaaaaaaaaaa');
    let broken = true;
    const flaky: PowerShellStdinRunner = (file, args, stdin, timeout) =>
      broken ? Promise.resolve({ code: 1, stdout: '', stderr: '' }) : ok.runner(file, args, stdin, timeout);
    const store2 = createSecretStore(makeServices(first.core), { platform: 'win32', powershell: flaky });
    await expect(store2.loadAll()).rejects.toMatchObject({ code: 'SECRET_STORE' });
    expect(store2.has('provider:a')).toBe(true);
    expect(first.core.errors.list().find((e) => e.code === 'SECRET_STORE')?.title).toBe('Schlüsselspeicher nicht verfügbar');
    broken = false;
    expect(await store2.get('provider:a')).toBe('value-aaaaaaaaaaaa');
  });

  it('unreadable entries are kept, has() is false, get() throws and a warning asks to re-enter the key', async () => {
    const ok = fakeDpapi();
    const first = setup({ platform: 'win32', powershell: ok.runner });
    await first.store.set('provider:a', 'value-aaaaaaaaaaaa');
    await first.store.set('provider:b', 'value-bbbbbbbbbbbb');
    const ps2 = fakeDpapi({ corruptIds: ['provider:b'] });
    const store2 = createSecretStore(makeServices(first.core), { platform: 'win32', powershell: ps2.runner });
    await store2.loadAll();
    expect(store2.has('provider:a')).toBe(true);
    expect(store2.has('provider:b')).toBe(false);
    expect(store2.unreadableIds()).toEqual(['provider:b']);
    await expect(store2.get('provider:b')).rejects.toMatchObject({ code: 'SECRET_STORE' });
    expect(first.core.db.get('SELECT 1 FROM secrets WHERE id = ?', ['provider:b'])).toBeDefined();
    const warn = first.core.errors.list().find((e) => e.title === 'Gespeicherte API-Schlüssel nicht lesbar');
    expect(warn?.severity).toBe('warning');
    // Re-entering fixes it and resolves the warning.
    const fresh = fakeDpapi();
    const store3 = createSecretStore(makeServices(first.core), { platform: 'win32', powershell: fresh.runner });
    await store3.set('provider:b', 'value-new-bbbbbbbbb');
    expect(await store3.get('provider:b')).toBe('value-new-bbbbbbbbb');
  });

  it('entropy binds the ciphertext to its id', async () => {
    const ps = fakeDpapi();
    const { store, core } = setup({ platform: 'win32', powershell: ps.runner });
    await store.set('provider:a', 'value-aaaaaaaaaaaa');
    const row = core.db.get<{ ciphertext: string }>('SELECT ciphertext FROM secrets WHERE id = ?', ['provider:a'])!;
    core.db.run("INSERT INTO secrets(id, scheme, ciphertext, updated_at) VALUES ('provider:z', 'dpapi', ?, 0)", [row.ciphertext]);
    const store2 = createSecretStore(makeServices(core), { platform: 'win32', powershell: fakeDpapi().runner });
    await store2.loadAll();
    expect(store2.has('provider:a')).toBe(true);
    expect(store2.has('provider:z')).toBe(false);
  });
});

describe('SecretStore – memory scheme', () => {
  it('keeps values only in memory', async () => {
    const { store, core } = setup({ scheme: 'memory' });
    expect(store.scheme).toBe('memory');
    await store.loadAll();
    expect(store.has('a')).toBe(false);
    await store.set('a', 'memory-secret-1');
    expect(store.has('a')).toBe(true);
    expect(await store.get('a')).toBe('memory-secret-1');
    expect(core.db.get('SELECT 1 FROM secrets')).toBeUndefined();
    await store.delete('a');
    expect(await store.get('a')).toBeNull();
  });

  it('validates ids and values', async () => {
    const { store } = setup({ scheme: 'memory' });
    await expect(store.set('', 'x')).rejects.toBeInstanceOf(NovaError);
    await expect(store.set('a', '')).rejects.toBeInstanceOf(NovaError);
    await expect(store.set('a\nb', 'value')).rejects.toThrow(/Ungültige Kennung/);
  });
});

describe('SecretStore – aes-local fallback', () => {
  it('encrypts with AES-256-GCM, key file mode 0600, secure=false and reports the insecure warning', async () => {
    const { store, core } = setup({ platform: 'linux', commandExists: () => false });
    expect(store.scheme).toBe('aes-local');
    expect(store.secure).toBe(false);
    await store.set('provider:x', 'aes-secret-value-123');
    const keyPath = join(core.paths.root, 'secret.key');
    expect(existsSync(keyPath)).toBe(true);
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
    const row = core.db.get<{ scheme: string; ciphertext: string }>('SELECT scheme, ciphertext FROM secrets WHERE id = ?', ['provider:x'])!;
    expect(row.scheme).toBe('aes-local');
    expect(row.ciphertext.startsWith('v1:')).toBe(true);
    expect(row.ciphertext).not.toContain('aes-secret-value-123');
    const warn = core.errors.list().find((e) => e.title === 'Schlüsselspeicher eingeschränkt sicher');
    expect(warn?.severity).toBe('warning');
    // restart
    const store2 = createSecretStore(makeServices(core), { platform: 'linux', commandExists: () => false });
    await store2.loadAll();
    expect(await store2.get('provider:x')).toBe('aes-secret-value-123');
    expect(core.errors.list().filter((e) => e.title === 'Schlüsselspeicher eingeschränkt sicher')).toHaveLength(1);
  });

  it('detects tampering, wrong ids and never regenerates a corrupt key file', async () => {
    const { store, core } = setup({ platform: 'linux', commandExists: () => false });
    await store.set('provider:x', 'aes-secret-value-123');
    const keyPath = join(core.paths.root, 'secret.key');
    const key = loadOrCreateKey(keyPath);
    expect(key.ok).toBe(true);
    if (!key.ok) return;
    const ct = aesEncrypt(key.key, 'a', 'hello world');
    expect(aesDecrypt(key.key, 'a', ct)).toBe('hello world');
    expect(aesDecrypt(key.key, 'b', ct)).toBeNull();
    const raw = Buffer.from(ct.slice(3), 'base64');
    raw[raw.length - 1] ^= 0xff;
    expect(aesDecrypt(key.key, 'a', `v1:${raw.toString('base64')}`)).toBeNull();
    expect(aesDecrypt(key.key, 'a', 'garbage')).toBeNull();

    writeFileSync(keyPath, 'not-a-key');
    const store2 = createSecretStore(makeServices(core), { platform: 'linux', commandExists: () => false });
    await store2.loadAll();
    expect(store2.has('provider:x')).toBe(false);
    await expect(store2.set('provider:y', 'another-secret')).rejects.toMatchObject({ code: 'SECRET_STORE' });
    expect(readFileSync(keyPath, 'utf8')).toBe('not-a-key');
  });
});

describe('SecretStore – libsecret (fake secret-tool)', () => {
  function fakeSecretTool(opts: { broken?: boolean } = {}) {
    const items = new Map<string, string>();
    const calls: Array<{ file: string; args: string[]; input?: string }> = [];
    const runner: ToolRunner = async (file, args, o) => {
      calls.push({ file, args, input: o.input });
      if (opts.broken) return { code: 1, stdout: '', stderr: 'Cannot autolaunch D-Bus without X11 $DISPLAY' };
      const account = args[args.indexOf('account') + 1];
      if (args[0] === 'store') {
        items.set(account, o.input ?? '');
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'lookup') {
        const v = items.get(account);
        return v === undefined ? { code: 1, stdout: '', stderr: '' } : { code: 0, stdout: v, stderr: '' };
      }
      if (args[0] === 'clear') {
        items.delete(account);
        return { code: 0, stdout: '', stderr: '' };
      }
      return { code: 2, stdout: '', stderr: '' };
    };
    return { runner, items, calls };
  }

  it('stores values via stdin (never argv) after a successful probe', async () => {
    const tool = fakeSecretTool();
    const { store, core } = setup({ platform: 'linux', commandExists: (n) => n === 'secret-tool', runTool: tool.runner });
    expect(store.scheme).toBe('libsecret');
    await store.loadAll();
    expect(store.scheme).toBe('libsecret');
    expect(tool.items.size).toBe(0); // probe item cleaned up
    await store.set('provider:x', 'keyring-secret-value');
    const storeCall = tool.calls.filter((c) => c.args[0] === 'store').pop()!;
    expect(storeCall.input).toBe('keyring-secret-value');
    expect(storeCall.args.join(' ')).not.toContain('keyring-secret-value');
    expect(core.db.get<{ scheme: string; ciphertext: string }>('SELECT scheme, ciphertext FROM secrets')).toMatchObject({ scheme: 'libsecret' });
    const store2 = createSecretStore(makeServices(core), { platform: 'linux', commandExists: () => true, runTool: tool.runner });
    await store2.loadAll();
    expect(await store2.get('provider:x')).toBe('keyring-secret-value');
    await store2.delete('provider:x');
    expect(tool.items.has('provider:x')).toBe(false);
    expect(store2.has('provider:x')).toBe(false);
  });

  it('falls back to aes-local when secret-tool exists but no keyring works', async () => {
    const tool = fakeSecretTool({ broken: true });
    const { store } = setup({ platform: 'linux', commandExists: () => true, runTool: tool.runner });
    await store.loadAll();
    expect(store.scheme).toBe('aes-local');
    expect(store.secure).toBe(false);
    await store.set('provider:x', 'fallback-secret-1');
    expect(await store.get('provider:x')).toBe('fallback-secret-1');
  });
});

describe('SecretStore – macOS keychain (fake security)', () => {
  it('uses security with service "NOVA AI" (documented argv limitation)', async () => {
    const calls: string[][] = [];
    const values = new Map<string, string>();
    const runner: ToolRunner = async (_file, args) => {
      calls.push(args);
      const account = args[args.indexOf('-a') + 1];
      if (args[0] === 'add-generic-password') {
        values.set(account, args[args.indexOf('-w') + 1]);
        return { code: 0, stdout: '', stderr: '' };
      }
      if (args[0] === 'find-generic-password') {
        const v = values.get(account);
        return v === undefined ? { code: 44, stdout: '', stderr: '' } : { code: 0, stdout: `${v}\n`, stderr: '' };
      }
      values.delete(account);
      return { code: 0, stdout: '', stderr: '' };
    };
    const { store, core } = setup({ scheme: 'keychain', platform: 'darwin', runTool: runner });
    await store.set('provider:x', 'mac-secret-value');
    expect(calls[0].slice(0, 6)).toEqual(['add-generic-password', '-U', '-s', 'NOVA AI', '-a', 'provider:x']);
    const store2 = createSecretStore(makeServices(core), { scheme: 'keychain', platform: 'darwin', runTool: runner });
    await store2.loadAll();
    expect(await store2.get('provider:x')).toBe('mac-secret-value');
    await store2.delete('provider:x');
    expect(values.size).toBe(0);
  });
});
