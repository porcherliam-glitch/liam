// Smoke test of an INSTALLED NOVA AI on real Windows (run by .github/workflows/nova-ai-windows.yml after a silent
// NSIS install). Plain Node, no dependencies.
//   1. Starts the installed background service directly (same exe with ELECTRON_RUN_AS_NODE) and talks to it over
//      its authenticated named pipe: status, DPAPI secret store, tool detection, resources, wrong token, shutdown.
//   2. Starts the installed app (UI + supervisor) and checks that it brings up its own service, then stops both the
//      way the installer does (--stop-daemon).
// Usage: node scripts/smoke-installed.mjs "<install dir>" "<work dir>"   Exit code 0 = all checks passed.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';

const [installDir, workDir] = process.argv.slice(2);
if (!installDir || !workDir) {
  console.error('Usage: node scripts/smoke-installed.mjs "<install dir>" "<work dir>"');
  process.exit(2);
}
const exe = join(installDir, 'NOVA AI.exe');
const daemonScript = join(installDir, 'resources', 'app.asar.unpacked', 'out', 'daemon', 'index.cjs');
mkdirSync(workDir, { recursive: true });

const failures = [];
function check(ok, message) {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const until = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < until) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(250);
  }
  throw new Error(`Timeout: ${label}${last ? ` (${last.message})` : ''}`);
}

function request(endpoint, token, method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ id: '1', method, params });
    const req = http.request(
      { socketPath: endpoint, path: '/rpc', method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            /* non-JSON answer (e.g. 401 text) */
          }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.setTimeout(30_000, () => req.destroy(new Error(`RPC ${method} timed out`)));
    req.on('error', reject);
    req.end(body);
  });
}

async function rpc(conn, method, params = {}) {
  const res = await request(conn.endpoint, conn.token, method, params);
  if (res.status !== 200 || !res.json?.ok) throw new Error(`${method}: HTTP ${res.status} ${JSON.stringify(res.json?.error ?? res.json)}`);
  return res.json.result;
}

async function connect(dataDir, timeoutMs) {
  return waitFor(
    async () => {
      const lockPath = join(dataDir, 'daemon.lock');
      const tokenPath = join(dataDir, 'daemon.token');
      if (!existsSync(lockPath) || !existsSync(tokenPath)) return null;
      const conn = { endpoint: JSON.parse(readFileSync(lockPath, 'utf8')).endpoint, token: readFileSync(tokenPath, 'utf8').trim() };
      await rpc(conn, 'daemon.status');
      return conn;
    },
    timeoutMs,
    `service in ${dataDir} ready`,
  );
}

function exited(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve(child.exitCode);
    const t = setTimeout(() => resolve(null), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(t);
      resolve(code);
    });
  });
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function partService() {
  console.log('--- 1. Hintergrunddienst direkt');
  check(existsSync(exe), `Programm installiert: ${exe}`);
  check(existsSync(daemonScript), 'Dienst-Skript liegt entpackt neben app.asar');
  const dataDir = join(workDir, 'service-data');
  let output = '';
  const child = spawn(exe, [daemonScript, '--data-dir', dataDir, '--foreground'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', (c) => (output += c));
  child.stderr.on('data', (c) => (output += c));
  try {
    const conn = await connect(dataDir, 90_000);
    check(conn.endpoint.startsWith('\\\\.\\pipe\\'), `Kanal ist eine Named Pipe (${conn.endpoint})`);
    const status = await rpc(conn, 'daemon.status');
    check(status.platform === 'win32', `Plattform ${status.platform}`);
    check(status.secretStore.scheme === 'dpapi' && status.secretStore.secure, `Schlüsselspeicher ${JSON.stringify(status.secretStore)}`);
    check(status.methods.length > 100, `${status.methods.length} RPC-Methoden registriert`);

    const integrations = await rpc(conn, 'integrations.list', { refresh: true });
    const found = Object.fromEntries(integrations.map((i) => [i.id, i]));
    console.log(`     Werkzeuge: ${integrations.map((i) => `${i.id}=${i.available ? (i.version ?? 'ja') : 'nein'}`).join(', ')}`);
    for (const id of ['git', 'node', 'npm', 'powershell']) check(found[id]?.available === true, `Werkzeug erkannt: ${id}`);

    const snap = await rpc(conn, 'resources.snapshot');
    check(snap.cpu.cores > 0 && snap.memory.totalBytes > 0, `Ressourcen: ${snap.cpu.cores} Kerne, ${Math.round(snap.memory.totalBytes / 2 ** 30)} GB RAM`);

    const wrong = await request(conn.endpoint, 'falsches-token', 'daemon.status', {});
    check(wrong.status === 401, `Falsches Token abgelehnt (HTTP ${wrong.status})`);

    await rpc(conn, 'daemon.shutdown', { reason: 'smoke test' });
    const code = await exited(child, 40_000);
    check(code === 0, `Dienst sauber beendet (Exit-Code ${code})`);
    check(!/Zeitlimit/.test(output), 'Keine Zeitüberschreitung beim Herunterfahren');
  } finally {
    if (child.exitCode === null) child.kill();
    writeFileSync(join(workDir, 'service-output.log'), output);
  }
}

async function partApp() {
  console.log('--- 2. App mit Dienst-Aufsicht');
  const dataDir = join(workDir, 'app-data');
  const app = spawn(exe, ['--data-dir', dataDir], { stdio: 'ignore', windowsHide: false });
  try {
    const conn = await connect(dataDir, 120_000);
    const status = await rpc(conn, 'daemon.status');
    check(status.state === 'running' || status.state === 'paused', `App hat ihren Dienst gestartet (Zustand ${status.state}, PID ${status.pid})`);
    const stopper = spawn(exe, ['--stop-daemon', '--data-dir', dataDir], { stdio: 'ignore' });
    const stopCode = await exited(stopper, 60_000);
    check(stopCode !== null, `--stop-daemon beendet sich (Exit-Code ${stopCode})`);
    await waitFor(async () => !pidAlive(status.pid), 30_000, 'service process gone').then(
      () => check(true, 'Dienst nach --stop-daemon beendet'),
      () => check(false, 'Dienst nach --stop-daemon beendet'),
    );
    const appCode = await exited(app, 30_000);
    check(appCode !== null, `Oberfläche nach --stop-daemon beendet (Exit-Code ${appCode})`);
  } finally {
    if (app.exitCode === null) app.kill();
  }
}

try {
  await partService();
  await partApp();
} catch (e) {
  check(false, `Unerwarteter Fehler: ${e.stack ?? e}`);
}
console.log(failures.length === 0 ? 'Alle Prüfungen bestanden.' : `${failures.length} Prüfung(en) fehlgeschlagen.`);
process.exit(failures.length === 0 ? 0 : 1);
