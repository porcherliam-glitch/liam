// Real end-to-end check of the 3D-Werkstatt against a locally running ComfyUI (run on the Windows PC with an NVIDIA
// graphics card, not in CI):
//   npm run verify:comfyui -- [--text "eine Holztruhe mit Eisenbeschlägen"] [--image C:\Bilder\axt.png]
//                              [--model trellis2|pixal3d] [--quality draft|standard|high]
//                              [--engine-url http://127.0.0.1:8000] [--models-dir D:\ComfyUI\models] [--download] [--keep]
// Starts a private daemon (temporary data dir), checks ComfyUI and the installed 3D models (optionally downloads the
// missing ones – approvals are granted once for this test), runs ONE real job (text → image → 3D, or image → 3D) and
// prints an honest report. Exit code 0 only if the job ended "done" and produced a valid binary glTF (.glb).
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const keep = args.includes('--keep');
const download = args.includes('--download');

const dataDir = mkdtempSync(join(tmpdir(), 'nova-verify-3d-'));
const endpoint =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\nova-verify-3d-${createHash('sha256').update(dataDir).digest('hex').slice(0, 12)}`
    : join(dataDir, 'daemon.sock');

function log(msg) {
  process.stdout.write(`[verify-3d] ${msg}\n`);
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
          } catch {
            reject(new Error(`${method}: ungültige Antwort ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;

async function waitForDaemon() {
  for (let i = 0; i < 150; i++) {
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

async function approvePending(reason) {
  const pending = await rpc('approvals.list', { status: 'pending' });
  for (const a of pending) {
    log(`Freigabe (${reason}): ${a.action} – wird für diesen Test einmalig erlaubt.`);
    await rpc('approvals.decide', { id: a.id, decision: 'approve', scope: 'once' });
  }
}

async function downloadModel(model) {
  log(`Lade ${model.name} herunter (${gb(model.missingBytes)} fehlen) …`);
  let op = await rpc('threed.downloadModel', { id: model.id });
  let lastMessage = '';
  while (op.status === 'running') {
    await sleep(2000);
    await approvePending('Download');
    const ops = await rpc('operations.list', { activeOnly: false });
    op = ops.find((o) => o.id === op.id) ?? op;
    if (op.message && op.message !== lastMessage) {
      lastMessage = op.message;
      log(`  ${op.message}`);
    }
  }
  if (op.status !== 'done') throw new Error(`Download von ${model.name} ${op.status}: ${op.error ?? op.message ?? ''}`);
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

  const engineUrl = argValue('--engine-url');
  const modelsDir = argValue('--models-dir');
  let status = engineUrl || modelsDir ? await rpc('threed.configure', { ...(engineUrl ? { engineUrl } : {}), ...(modelsDir ? { modelsDir } : {}) }) : await rpc('threed.status', { refresh: true });
  log(`ComfyUI: ${status.message}`);
  if (!status.running) throw new Error('ComfyUI läuft nicht. Bitte ComfyUI starten (oder --engine-url angeben) und erneut versuchen.');
  if (!status.supports3d) throw new Error('Diese ComfyUI-Version kennt die TRELLIS.2-Bausteine noch nicht. Bitte ComfyUI aktualisieren.');
  log(`Version ${status.version ?? '?'}, Grafikkarte: ${status.gpu ? `${status.gpu.name}, ${status.gpu.vramTotalBytes ? gb(status.gpu.vramTotalBytes) : 'Speicher unbekannt'}` : 'keine erkannt'}, Modellordner: ${status.modelsDir ?? 'unbekannt'}`);

  const generator = argValue('--model') ?? 'trellis2';
  const quality = argValue('--quality') ?? 'draft';
  const imagePath = argValue('--image');
  const text = argValue('--text') ?? (imagePath ? undefined : 'Eine kleine Holztruhe mit Eisenbeschlägen');
  const needed = [generator, ...(imagePath ? [] : ['z_image_turbo'])];

  let models = await rpc('threed.models');
  for (const id of needed) {
    const m = models.find((x) => x.id === id);
    if (!m) throw new Error(`Unbekanntes 3D-Modell: ${id}`);
    if (!m.installed) {
      if (!download) throw new Error(`${m.name} ist nicht vollständig installiert (${gb(m.missingBytes)} fehlen). In NOVA unter „Modelle › 3D-Modelle“ herunterladen oder dieses Skript mit --download starten.`);
      await downloadModel(m);
    }
  }
  models = await rpc('threed.models');
  for (const id of needed) log(`Modell bereit: ${models.find((x) => x.id === id)?.name}`);

  const started = Date.now();
  let job = await rpc('threed.generate', imagePath ? { mode: 'image', imagePath: resolve(imagePath), model: generator, quality, name: 'nova-selbsttest' } : { mode: 'text', prompt: text, model: generator, quality, name: 'nova-selbsttest' });
  log(imagePath ? `Bild zu 3D gestartet: ${imagePath}` : `Text zu 3D gestartet: „${text}“`);
  let lastPhase = '';
  const deadline = Date.now() + 60 * 60_000;
  while (Date.now() < deadline && !['done', 'failed', 'cancelled'].includes(job.status)) {
    await sleep(2000);
    job = await rpc('threed.job', { id: job.id });
    const line = `${job.phase ?? job.status}${job.progress !== null ? ` (${Math.round(job.progress)} %)` : ''}`;
    if (line !== lastPhase) {
      lastPhase = line;
      log(`  ${line}`);
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  log(`Status: ${job.status} nach ${seconds} s${job.error ? ` – ${job.error}` : ''}`);

  let glbOk = false;
  if (job.status === 'done' && job.outputPath && existsSync(job.outputPath)) {
    const bytes = readFileSync(job.outputPath);
    const size = statSync(job.outputPath).size;
    // binary glTF header: magic "glTF", version 2, total length = file size
    glbOk = size >= 12 && bytes.subarray(0, 4).toString('latin1') === 'glTF' && bytes.readUInt32LE(4) === 2 && bytes.readUInt32LE(8) === size;
    log(`Ergebnis: ${job.outputPath} (${(size / 1024 ** 2).toFixed(2).replace('.', ',')} MB, ${glbOk ? 'gültige GLB-Datei' : 'KEINE gültige GLB-Datei'})`);
    if (job.imagePath) log(`Vorlagenbild: ${job.imagePath}`);
  }
  exitCode = job.status === 'done' && glbOk ? 0 : 1;
  log(exitCode === 0 ? 'ERFOLG: Ein echtes 3D-Modell wurde auf diesem PC erzeugt.' : 'NICHT BESTANDEN – siehe Ausgabe oben.');
  if (exitCode === 0 && !keep) log('Tipp: Mit --keep bleibt das erzeugte Modell zum Ansehen erhalten.');
} catch (e) {
  log(`FEHLER: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  try {
    await rpc('daemon.shutdown', { reason: 'verify-comfyui' });
  } catch {
    daemon.kill();
  }
  await sleep(1500);
  if (!keep) rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  else log(`Daten behalten: ${dataDir}`);
  process.exit(exitCode);
}
