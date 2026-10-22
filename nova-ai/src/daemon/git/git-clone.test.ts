// GitService.clone: URL rules (no network contact for rejected URLs), non-empty targets, host policy with network
// approvals (pending/denied/rule), and real clones over HTTPS from a 127.0.0.1 server with a throw-away self-signed
// certificate (git's dumb HTTP protocol): success with progress, "not found" with cleanup, and abort with cleanup.
// The HTTPS cases need the openssl CLI to create the certificate and are skipped without it. SSH clones use a fake
// `ssh` script on PATH that records its arguments (non-interactive BatchMode unless the user configured an own ssh).
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:https';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';
import { tempDir } from '../../../tests/helpers/core';
import { gitFixture, type GitFixture } from './test-support';
import { SSH_BATCH_COMMAND, createGitService } from './git-service';

// Never let a proxy from the environment take part in local test clones.
const NO_PROXY_ENV = { HTTPS_PROXY: '', https_proxy: '', HTTP_PROXY: '', http_proxy: '', ALL_PROXY: '', all_proxy: '', NO_PROXY: '*', no_proxy: '*' };

let f: GitFixture | undefined;
const servers: Server[] = [];
afterEach(async () => {
  for (const srv of servers.splice(0)) {
    srv.closeAllConnections();
    await new Promise<void>((r) => srv.close(() => r()));
  }
  f?.cleanup();
  f = undefined;
});

let certDir: { dir: string; cleanup(): void } | null = null;
let cert: { key: Buffer; cert: Buffer; certPath: string } | null = null;
beforeAll(() => {
  certDir = tempDir('nova-cert-');
  const keyPath = join(certDir.dir, 'key.pem');
  const certPath = join(certDir.dir, 'cert.pem');
  try {
    execFileSync(
      'openssl',
      ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '2', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'],
      { stdio: 'ignore', timeout: 10_000 },
    );
    cert = { key: readFileSync(keyPath), cert: readFileSync(certPath), certPath };
  } catch {
    cert = null;
  }
  return () => certDir?.cleanup();
});

function fixture(): GitFixture {
  return gitFixture({ extraEnv: { ...NO_PROXY_ENV, ...(cert ? { GIT_SSL_CAINFO: cert.certPath } : {}) } });
}

/** Static HTTPS server for a bare repository (dumb HTTP protocol). `stall` never answers. */
async function serveRepo(bareParent: string, opts: { stall?: boolean } = {}): Promise<string> {
  const srv = createServer({ key: cert!.key, cert: cert!.cert }, (req, res) => {
    if (opts.stall) return; // never respond
    const url = new URL(req.url ?? '/', 'https://127.0.0.1');
    const file = normalize(join(bareParent, decodeURIComponent(url.pathname)));
    if (!file.startsWith(bareParent) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(readFileSync(file));
  });
  servers.push(srv);
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  return `https://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}

function bareRepo(fx: GitFixture): string {
  const src = fx.repo('src', { files: { 'README.md': '# Hallo\n', 'src/main.js': 'console.log(1);\n' } });
  const parent = join(fx.dir, 'served');
  mkdirSync(parent);
  fx.sh(fx.dir, 'clone', '-q', '--bare', src, join(parent, 'repo.git'));
  fx.sh(join(parent, 'repo.git'), 'update-server-info');
  return parent;
}

describe('clone – validation and host policy (no network)', () => {
  it('rejects every URL that is not https://, ssh:// or git@host: before contacting anything', async () => {
    f = fixture();
    const target = join(f.dir, 'target');
    for (const url of ['file:///etc', 'http://example.com/x.git', 'ext::sh -c touch% /tmp/pwned', '-uhttps://x', 'git@host:-oProxyCommand=x', 'https://user:secret@github.com/x/y.git', 'https://github.com/x y.git', ' https://github.com/x.git']) {
      await expect(f.git.clone(url, target)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    expect(f.approvals.requests).toHaveLength(0);
    expect(existsSync(target)).toBe(false);
  });

  it('refuses non-empty or relative targets', async () => {
    f = fixture();
    const target = join(f.dir, 'full');
    mkdirSync(target);
    writeFileSync(join(target, 'x.txt'), 'x');
    await expect(f.git.clone('https://github.com/a/b.git', target)).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('nicht leer') });
    await expect(f.git.clone('https://github.com/a/b.git', 'relative/dir')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('asks for a network approval for hosts that are not allowed (pending → APPROVAL_REQUIRED)', async () => {
    f = fixture();
    await expect(f.git.clone('https://code.example.invalid/team/app.git', join(f.dir, 't1'))).rejects.toMatchObject({
      code: 'APPROVAL_REQUIRED',
      details: { approvalId: expect.any(String), host: 'code.example.invalid' },
    });
    expect(f.approvals.requests[0]).toMatchObject({ kind: 'network', subject: 'code.example.invalid', projectId: null });
    await expect(f.git.clone('git@other.example.invalid:team/app.git', join(f.dir, 't2'))).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    expect(f.approvals.requests[1].subject).toBe('other.example.invalid');
    expect(existsSync(join(f.dir, 't1'))).toBe(false);
  });

  it('a denied approval → NETWORK_BLOCKED and the denial is acknowledged so it can be requested again', async () => {
    f = fixture();
    f.approvals.answer = 'denied';
    await expect(f.git.clone('ssh://git@code.example.invalid/team/app.git', join(f.dir, 't'))).rejects.toMatchObject({ code: 'NETWORK_BLOCKED' });
    expect(f.approvals.acknowledged).toHaveLength(1);
  });

  it('an approval rule lets the clone proceed (here it then fails to connect → GIT_ERROR, target removed)', async () => {
    f = fixture();
    f.approvals.answer = 'rule';
    const target = join(f.dir, 't');
    await expect(f.git.clone('https://[::ffff:7f00:1]:1/x.git', target)).rejects.toMatchObject({ code: 'GIT_ERROR' });
    expect(f.approvals.requests[0].subject).toBe('::ffff:7f00:1');
    expect(existsSync(target)).toBe(false);
  });

  it('allowed hosts from the settings need no approval', async () => {
    f = fixture();
    f.t.core.settings.update({ network: { allowedHosts: ['*.example.invalid'] } });
    // A host outside the list still needs an approval …
    await expect(f.git.clone('https://[::ffff:7f00:1]:1/x.git', join(f.dir, 'a'))).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });
    const before = f.approvals.requests.length;
    // … a host matching "*.example.invalid" does not; the (impossible) connection fails afterwards.
    await expect(f.git.clone('https://git.example.invalid:1/x.git', join(f.dir, 'b'))).rejects.toMatchObject({ code: 'GIT_ERROR' });
    expect(f.approvals.requests.length).toBe(before);
  });
});

/** Writes an executable fake ssh into `bin` that logs its arguments to `log` and fails like a rejected key. */
function fakeSsh(bin: string, name: string, log: string): string {
  mkdirSync(bin, { recursive: true });
  const file = join(bin, name);
  writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' "${name}" "$@" > '${log}'\necho 'git@127.0.0.1: Permission denied (publickey).' >&2\nexit 255\n`);
  chmodSync(file, 0o755);
  return file;
}

describe.skipIf(process.platform === 'win32' || !!process.env.GIT_SSH_COMMAND || !!process.env.GIT_SSH)('clone over ssh (fake ssh on PATH)', () => {
  /** Fixture plus a GitService whose PATH starts with a bin folder holding the fake `ssh`. */
  function sshFixture(extraEnv: Record<string, string> = {}) {
    f = gitFixture({ extraEnv: NO_PROXY_ENV });
    const bin = join(f.dir, 'bin');
    const log = join(f.dir, 'ssh.log');
    fakeSsh(bin, 'ssh', log);
    const git = createGitService(f.s, { gitPath: 'git', extraEnv: { ...f.env, PATH: `${bin}:${process.env.PATH ?? ''}`, ...extraEnv } });
    return { fx: f, git, bin, log };
  }

  it('runs ssh non-interactively (BatchMode) and maps a rejected key to a German sign-in error', async () => {
    const { fx, git, log } = sshFixture();
    const target = join(fx.dir, 'ssh-target');
    await expect(git.clone('ssh://git@127.0.0.1/team/app.git', target)).rejects.toMatchObject({ code: 'GIT_ERROR', message: expect.stringContaining('Anmeldung') });
    const args = readFileSync(log, 'utf8').split('\n');
    expect(args[0]).toBe('ssh');
    expect(args).toContain('BatchMode=yes');
    expect(args).toContain('ConnectTimeout=30');
    expect(args.some((a) => a.includes('git-upload-pack'))).toBe(true);
    expect(existsSync(target)).toBe(false);
    expect(SSH_BATCH_COMMAND).toContain('BatchMode=yes');
  });

  it('respects an ssh command the user configured (core.sshCommand or GIT_SSH_COMMAND)', async () => {
    const { fx, git, bin, log } = sshFixture();
    const own = fakeSsh(bin, 'own-ssh', log);
    fx.sh(fx.dir, 'config', '--global', 'core.sshCommand', own);
    await expect(git.clone('git@127.0.0.1:team/app.git', join(fx.dir, 't1'))).rejects.toMatchObject({ code: 'GIT_ERROR' });
    let args = readFileSync(log, 'utf8').split('\n');
    expect(args[0]).toBe('own-ssh');
    expect(args).not.toContain('BatchMode=yes');

    fx.sh(fx.dir, 'config', '--global', '--unset', 'core.sshCommand');
    const viaEnv = createGitService(fx.s, { gitPath: 'git', extraEnv: { ...fx.env, PATH: `${bin}:${process.env.PATH ?? ''}`, GIT_SSH_COMMAND: own } });
    await expect(viaEnv.clone('git@127.0.0.1:team/app.git', join(fx.dir, 't2'))).rejects.toMatchObject({ code: 'GIT_ERROR' });
    args = readFileSync(log, 'utf8').split('\n');
    expect(args[0]).toBe('own-ssh');
    expect(args).not.toContain('BatchMode=yes');
  });
});

describe.skipIf(!existsSync('/usr/bin/openssl') && !existsSync('/usr/local/bin/openssl'))('clone over HTTPS from 127.0.0.1', () => {
  it('clones a repository, reports progress and leaves a working repository', async () => {
    if (!cert) return;
    f = fixture();
    const base = await serveRepo(bareRepo(f));
    const target = join(f.dir, 'imported');
    const progress: (number | null)[] = [];
    await f.git.clone(`${base}/repo.git`, target, undefined, (p) => progress.push(p));
    expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('# Hallo\n');
    expect(await f.git.isRepo(target)).toBe(true);
    expect((await f.git.log(target, 5)).map((c) => c.subject)).toEqual(['Initial commit']);
    expect(progress[0]).toBe(0);
    expect(progress[progress.length - 1]).toBe(100);
  });

  it('maps a missing repository to a German GIT_ERROR and empties a pre-existing empty target', async () => {
    if (!cert) return;
    f = fixture();
    const base = await serveRepo(bareRepo(f));
    const target = join(f.dir, 'empty-target');
    mkdirSync(target);
    await expect(f.git.clone(`${base}/missing.git`, target)).rejects.toMatchObject({ code: 'GIT_ERROR', message: expect.stringContaining('nicht gefunden') });
    expect(existsSync(target)).toBe(true);
    expect(readdirSync(target)).toEqual([]);
  });

  it('abort kills the clone and removes the partial target (CANCELLED)', async () => {
    if (!cert) return;
    f = fixture();
    const base = await serveRepo(join(f.dir), { stall: true });
    const target = join(f.dir, 'aborted');
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 300);
    const started = Date.now();
    await expect(f.git.clone(`${base}/repo.git`, target, controller.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(Date.now() - started).toBeLessThan(4000);
    expect(existsSync(target)).toBe(false);
  });
});
