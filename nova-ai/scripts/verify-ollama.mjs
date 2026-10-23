// Real end-to-end check against a locally running Ollama (run on the Windows PC, not in CI):
//   npm run verify:ollama -- [--model qwen2.5-coder:7b] [--keep]
// Starts a private daemon (temporary data dir), creates a project from the "web-app" template,
// lets the coder agent implement a small function + test with the real model, runs the tests and
// prints an honest report. Exit code 0 only if the task is done AND verification passed.
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const keep = args.includes('--keep');

const dataDir = mkdtempSync(join(tmpdir(), 'nova-verify-'));
const endpoint =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\nova-verify-${createHash('sha256').update(dataDir).digest('hex').slice(0, 12)}`
    : join(dataDir, 'daemon.sock');

function log(msg) {
  process.stdout.write(`[verify] ${msg}\n`);
}

function rpc(method, params = {}) {
  const token = readFileSync(join(dataDir, 'daemon.token'), 'utf8').trim();
  const body = JSON.stringify({ id: String(Date.now()), method, params });
  return new Promise((resolvePromise, reject) => {
    const req = http.request(
      { socketPath: endpoint, path: '/rpc', method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.ok) resolvePromise(json.result);
            else reject(new Error(`${method}: ${json.error?.code} ${json.error?.message}`));
          } catch (e) {
            reject(new Error(`${method}: invalid response ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDaemon() {
  for (let i = 0; i < 100; i++) {
    if (existsSync(join(dataDir, 'daemon.token'))) {
      try {
        await rpc('daemon.status');
        return;
      } catch {
        /* not ready */
      }
    }
    await sleep(200);
  }
  throw new Error('Der Hintergrunddienst hat nicht geantwortet.');
}

const daemonEntry = join(root, 'out', 'daemon', 'index.cjs');
if (!existsSync(daemonEntry)) {
  console.error('out/daemon/index.cjs fehlt – zuerst "npm run build" ausführen.');
  process.exit(2);
}
const daemon = spawn(process.execPath, [daemonEntry, '--data-dir', dataDir, '--endpoint', endpoint, '--foreground'], {
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
});

let exitCode = 1;
try {
  await waitForDaemon();
  log(`Hintergrunddienst läuft (Daten: ${dataDir})`);

  const status = await rpc('ollama.status');
  log(`Ollama: ${status.message}`);
  if (!status.running) throw new Error('Ollama läuft nicht. Bitte Ollama starten und erneut versuchen.');

  const models = await rpc('ollama.models');
  if (models.length === 0) throw new Error('Kein Ollama-Modell installiert. Beispiel: "ollama pull qwen2.5-coder:7b".');
  const wanted = argValue('--model');
  const model = wanted ? models.find((m) => m.id === wanted) : models.find((m) => m.capabilities.includes('tools')) ?? models[0];
  if (!model) throw new Error(`Modell ${wanted} ist nicht installiert. Installiert: ${models.map((m) => m.id).join(', ')}`);
  log(`Verwende Modell ${model.id} (Werkzeuge: ${model.capabilities.includes('tools') ? 'ja' : 'nein – JSON-Protokoll'})`);
  await rpc('models.setSelection', { defaultModel: { providerId: model.providerId, modelId: model.id }, fallbacks: [] });

  const projectDir = join(dataDir, 'projekt');
  const created = await rpc('projects.create', { mode: 'template', templateId: 'web-app', name: 'NOVA Selbsttest', description: '', path: projectDir, planNow: false });
  const project = created.project;
  log(`Projekt angelegt: ${project.path}`);
  await rpc('projects.update', { id: project.id, config: { reviewChanges: false } });

  const task = await rpc('tasks.create', {
    projectId: project.id,
    title: 'Funktion add mit Test ergänzen',
    description:
      'Lege die Datei src/math.js an. Sie soll `export function add(a, b) { return a + b; }` enthalten. ' +
      'Lege außerdem tests/math.test.mjs an, das mit node:test und node:assert prüft, dass add(2, 3) gleich 5 ist. ' +
      'Führe danach die Tests des Projekts aus und beende die Aufgabe erst, wenn sie bestehen.',
    kind: 'code',
    priority: 2,
  });
  await rpc('projects.setWork', { id: project.id, enabled: true });
  await rpc('work.start', {});
  log(`Aufgabe gestartet: ${task.title}`);

  const deadline = Date.now() + 20 * 60_000;
  let current = task;
  let lastStepId = 0;
  while (Date.now() < deadline) {
    await sleep(2000);
    current = await rpc('tasks.get', { id: task.id });
    const runs = await rpc('agents.runs', { taskId: task.id, limit: 5 });
    for (const run of runs) {
      const steps = await rpc('agents.steps', { runId: run.id, afterId: lastStepId, limit: 200 });
      for (const st of steps) {
        lastStepId = Math.max(lastStepId, st.id);
        log(`  [${run.role}] ${st.kind}: ${st.summary}`);
      }
    }
    if (['done', 'failed', 'blocked', 'cancelled'].includes(current.status)) break;
    if (current.status === 'waiting_approval') {
      const pending = await rpc('approvals.list', { status: 'pending' });
      log(`Wartet auf Freigabe: ${pending.map((a) => a.action).join(' | ')} – wird für diesen Test einmalig erlaubt.`);
      for (const a of pending) await rpc('approvals.decide', { id: a.id, decision: 'approve', scope: 'once' });
    }
  }

  log(`Status: ${current.status}${current.blocker ? ` – ${current.blocker}` : ''}`);
  log(`Ergebnis: ${current.result ?? '-'}`);
  log(`Prüfung: ${current.verification.status} ${current.verification.checks.map((c) => `${c.name}=${c.status}`).join(', ')}`);
  const mathExists = existsSync(join(project.path, 'src', 'math.js'));
  log(`src/math.js vorhanden: ${mathExists ? 'ja' : 'nein'}`);
  const checks = await rpc('checks.list', { projectId: project.id, limit: 5 });
  for (const c of checks) log(`Prüflauf ${c.kind}: ${c.status} (bestanden ${c.passed ?? '?'}, fehlgeschlagen ${c.failed ?? '?'})`);
  const usage = await rpc('budget.usage', { limit: 1000 });
  const tokens = usage.reduce((a, u) => a + u.inputTokens + u.outputTokens, 0);
  log(`Modellaufrufe: ${usage.length}, Tokens gesamt: ${tokens}`);

  exitCode = current.status === 'done' && current.verification.status === 'passed' && mathExists ? 0 : 1;
  log(exitCode === 0 ? 'ERFOLG: Der Agent hat die Aufgabe mit echtem Modell erledigt und die Tests bestanden.' : 'NICHT BESTANDEN – siehe Ausgabe oben.');
} catch (e) {
  log(`FEHLER: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  try {
    await rpc('daemon.shutdown', { reason: 'verify-ollama' });
  } catch {
    daemon.kill();
  }
  await sleep(1500);
  if (!keep) rmSync(dataDir, { recursive: true, force: true });
  else log(`Daten behalten: ${dataDir}`);
  process.exit(exitCode);
}
