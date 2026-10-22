// Shared building blocks for the built-in project templates.
// Key decisions:
// - Templates are "copy-free and offline": every file is generated from strings in this source tree (the daemon is a
//   single bundle, so no asset files). Nothing is downloaded or installed at scaffold time.
// - writeScaffold() creates files with flag 'wx' (never overwrites anything) and, if anything fails midway, removes
//   exactly the files and folders it created itself – the target folder is left as it was.
// - C#/solution/batch files get CRLF line endings (Visual Studio conventions, SPEC §6.3), everything else LF.
// - The generated JavaScript avoids template literals so it can be embedded here without escaping.
import { mkdirSync, rmdirSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { normalizeText } from '../template-choice';

export type ScaffoldFiles = Record<string, string>;

const CRLF_EXT = /\.(bat|cmd|sln|csproj|cs|ps1|xaml|props|targets)$/i;

export function withEol(relPath: string, content: string): string {
  const lf = content.replace(/\r\n/g, '\n');
  return CRLF_EXT.test(relPath) ? lf.replace(/\n/g, '\r\n') : lf;
}

/**
 * Writes all files below `dir` (relative paths with forward slashes). Never overwrites (flag 'wx'). On failure, the
 * files and folders created by this call are removed again and the error is rethrown.
 */
export function writeScaffold(dir: string, files: ScaffoldFiles): string[] {
  const createdFiles: string[] = [];
  const createdDirs: string[] = [];
  const ensureDir = (d: string) => {
    if (existsSync(d)) return;
    ensureDir(dirname(d));
    mkdirSync(d);
    createdDirs.push(d);
  };
  try {
    for (const [rel, content] of Object.entries(files)) {
      if (rel.startsWith('/') || rel.split('/').some((seg) => seg === '..' || seg === '' || seg === '.')) {
        throw new Error(`Ungültiger Vorlagenpfad: ${rel}`);
      }
      const abs = join(dir, ...rel.split('/'));
      if (!abs.startsWith(dir.endsWith(sep) ? dir : dir + sep)) throw new Error(`Ungültiger Vorlagenpfad: ${rel}`);
      ensureDir(dirname(abs));
      writeFileSync(abs, withEol(rel, content), { flag: 'wx' });
      createdFiles.push(abs);
    }
  } catch (e) {
    for (const f of createdFiles.reverse()) {
      try {
        unlinkSync(f);
      } catch {
        /* best effort */
      }
    }
    for (const d of createdDirs.reverse()) {
      try {
        rmdirSync(d);
      } catch {
        /* not empty or gone */
      }
    }
    throw e;
  }
  return Object.keys(files);
}

/** npm-compatible package name ("Mein Spiel!" → "mein-spiel"). */
export function packageSlug(name: string): string {
  const slug = normalizeText(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'nova-projekt';
}

/** C# identifier in PascalCase ("mein tolles Spiel" → "MeinTollesSpiel"). */
export function csharpIdentifier(name: string, fallback = 'NovaApp'): string {
  const words = normalizeText(name)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let id = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  if (!id) id = fallback;
  if (/^[0-9]/.test(id)) id = `${fallback}${id}`;
  return id.slice(0, 60);
}

/** Escapes text for XML attribute/element content. */
export function xmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** Escapes text for HTML element content. */
export function htmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escapes a value for a single-quoted JavaScript string literal. */
export function jsString(text: string): string {
  return `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n').replace(/[\u2028\u2029]/g, ' ')}'`;
}

/** Escapes a value for a C# regular string literal. */
export function csString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

/** Makes a single Markdown-safe line (descriptions can be long multi-line text). */
export function markdownParagraph(text: string): string {
  return text.replace(/\r\n/g, '\n').trim();
}

export const HONEST_LIMITS_DE = [
  '- NOVA fragt vor bekannten riskanten Befehlen nach. Projektcode, Tests und Build-Skripte, die ein Agent geschrieben hat, laufen jedoch mit den Rechten des Windows-Kontos und können technisch nicht eingeschränkt werden.',
  '- Ein Netzwerk-Verbot in NOVA gilt nur für bekannte Befehle (z. B. `npm install`). Programme und Tests, die selbst Verbindungen aufbauen, kann NOVA nicht blockieren.',
  '- Wiederherstellungspunkte von NOVA decken Änderungen ab, die NOVA selbst vorgenommen hat. Für alles andere ist Git (oder eine eigene Sicherung) zuständig.',
].join('\n');

export const GITIGNORE_COMMON = ['# Geheimnisse gehören nie ins Repository', '.env', '.env.*', '!.env.example', '*.pem', '*.key', '', '# Betriebssystem', '.DS_Store', 'Thumbs.db', 'desktop.ini', ''].join('\n');

export const GITIGNORE_NODE = [GITIGNORE_COMMON, '# Node.js', 'node_modules/', 'dist/', 'coverage/', '*.log', 'npm-debug.log*', ''].join('\n');

/** Static zero-dependency dev server (Host check 421, loopback only, no hidden files, prints its URL). */
export function staticDevServerSource(defaultPort: number): string {
  return `// server.mjs – kleiner Entwicklungsserver ohne Abhängigkeiten (nur Node.js).
// Start: node server.mjs   (Port über die Umgebungsvariable PORT, sonst ${defaultPort}; ist er belegt, wird der nächste freie genommen)
// Sicherheit: lauscht nur auf 127.0.0.1, beantwortet nur Anfragen mit passendem Host-Header (sonst 421),
// liefert keine versteckten Dateien (.env, .git …) und nichts außerhalb des Projektordners aus.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PORT = ${defaultPort};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

/** Nur 127.0.0.1, localhost und [::1] mit dem eigenen Port sind erlaubt (Schutz vor DNS-Rebinding). */
export function isAllowedHost(hostHeader, port) {
  const host = String(hostHeader || '').toLowerCase();
  return host === '127.0.0.1:' + port || host === 'localhost:' + port || host === '[::1]:' + port;
}

/** Ordnet einen URL-Pfad einer Datei im Projektordner zu – oder null (versteckte Dateien, "..", außerhalb). */
export async function resolveFile(root, urlPath) {
  const pathname = String(urlPath || '/').split('?')[0].split('#')[0];
  if (!pathname.startsWith('/') || pathname.includes('\\\\') || pathname.includes('\\0')) return null;
  const segments = [];
  for (const raw of pathname.split('/')) {
    if (raw === '') continue;
    let seg;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (seg === '.' || seg === '..' || seg.startsWith('.') || /[\\\\/:\\0]/.test(seg)) return null;
    segments.push(seg);
  }
  const rootReal = await realpath(root);
  let target = join(rootReal, ...segments);
  let info;
  try {
    info = await stat(target);
  } catch {
    return null;
  }
  if (info.isDirectory()) {
    if (!pathname.endsWith('/')) return { redirect: pathname + '/' };
    target = join(target, 'index.html');
    try {
      info = await stat(target);
    } catch {
      return null;
    }
  }
  if (!info.isFile()) return null;
  const real = await realpath(target);
  const prefix = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
  if (!real.startsWith(prefix)) return null;
  return { file: real, size: info.size };
}

export function createDevServer(options) {
  const root = (options && options.root) || ROOT;
  const server = createServer(async (req, res) => {
    try {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      if (!isAllowedHost(req.headers.host, port)) {
        send(res, 421, 'Falscher Host-Header. Bitte http://127.0.0.1:' + port + '/ verwenden.');
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        send(res, 405, 'Nur GET und HEAD sind erlaubt.');
        return;
      }
      const found = await resolveFile(root, req.url);
      if (!found) {
        send(res, 404, 'Nicht gefunden.');
        return;
      }
      if (found.redirect) {
        res.writeHead(301, { Location: found.redirect, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[extname(found.file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': found.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(found.file)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch {
      if (!res.headersSent) send(res, 500, 'Interner Fehler.');
      else res.destroy();
    }
  });
  return server;
}

function listen(server, port) {
  return new Promise((resolvePromise, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolvePromise(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

/** Startet den Server. options.port (Tests: 0 = zufälliger freier Port), sonst PORT oder DEFAULT_PORT. */
export async function startDevServer(options) {
  const fromEnv = process.env.PORT !== undefined && process.env.PORT !== '';
  const explicit = options && options.port !== undefined;
  const firstPort = explicit ? options.port : fromEnv ? Number(process.env.PORT) : DEFAULT_PORT;
  if (!Number.isInteger(firstPort) || firstPort < 0 || firstPort > 65535) throw new Error('Ungültiger Port: ' + firstPort);
  const attempts = explicit || fromEnv || firstPort === 0 ? 1 : 20;
  for (let i = 0; i < attempts; i++) {
    const server = createDevServer(options);
    try {
      const port = await listen(server, firstPort + i);
      return { server, port, url: 'http://127.0.0.1:' + port + '/' };
    } catch (err) {
      if (err.code !== 'EADDRINUSE' || i === attempts - 1) throw err;
    }
  }
  throw new Error('Kein freier Port gefunden.');
}

function isMain() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  const started = resolve(process.argv[1]);
  return process.platform === 'win32' ? self.toLowerCase() === started.toLowerCase() : self === started;
}

if (isMain()) {
  startDevServer()
    .then(({ url }) => {
      console.log('Entwicklungsserver läuft: ' + url);
      console.log('Beenden mit Strg+C.');
    })
    .catch((err) => {
      console.error('Der Server konnte nicht starten: ' + err.message);
      process.exit(1);
    });
}
`;
}

/** Test for the static dev server (runs with node --test). */
export function staticDevServerTestSource(): string {
  return `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startDevServer } from '../server.mjs';

function get(port, path, host) {
  return new Promise((resolvePromise, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers: { host: host || '127.0.0.1:' + port } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolvePromise({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('liefert index.html mit sicheren Kopfzeilen aus', async () => {
  const { server, port } = await startDevServer({ port: 0 });
  try {
    const res = await get(port, '/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\\/html/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.match(res.body, /<html/i);
  } finally {
    server.close();
  }
});

test('lehnt fremde Host-Header mit 421 ab', async () => {
  const { server, port } = await startDevServer({ port: 0 });
  try {
    const res = await get(port, '/', 'evil.example:' + port);
    assert.equal(res.status, 421);
  } finally {
    server.close();
  }
});

test('liefert keine versteckten Dateien und nichts außerhalb des Ordners', async () => {
  const { server, port } = await startDevServer({ port: 0 });
  try {
    assert.equal((await get(port, '/%2e%2e/%2e%2e/etc/passwd')).status, 404);
    assert.equal((await get(port, '/.gitignore')).status, 404);
    assert.equal((await get(port, '/gibt-es-nicht.html')).status, 404);
  } finally {
    server.close();
  }
});
`;
}

/** Zero-dependency "build": syntax check of all scripts (+ optional copy of the site into dist/). */
export function buildScriptSource(opts: { copyToDist: boolean }): string {
  const copy = opts.copyToDist
    ? `
const DIST = join(ROOT, 'dist');
const ENTRIES = ['index.html', 'styles.css', 'src', 'assets'];
rmSync(DIST, { recursive: true, force: true }); // dist/ ist ein reiner Ausgabeordner
mkdirSync(DIST, { recursive: true });
for (const entry of ENTRIES) {
  const from = join(ROOT, entry);
  if (existsSync(from)) cpSync(from, join(DIST, entry), { recursive: true });
}
console.log('Build erfolgreich: ' + scripts.length + ' Skripte geprüft, Ausgabe in dist/');
`
    : `
console.log('Build erfolgreich: ' + scripts.length + ' Skripte ohne Syntaxfehler.');
`;
  return `// scripts/build.mjs – Build ohne Abhängigkeiten: prüft die Syntax aller JavaScript-Dateien (node --check)${
    opts.copyToDist ? '\n// und kopiert die fertige Webseite nach dist/ (diesen Ordner kann jeder statische Webserver ausliefern).' : '.'
  }
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'data']);

function collectScripts(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectScripts(full, out);
    else if (entry.isFile() && ['.js', '.mjs', '.cjs'].includes(extname(entry.name))) out.push(full);
  }
  return out;
}

const scripts = collectScripts(ROOT, []);
let failed = 0;
for (const file of scripts) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    failed++;
    process.stderr.write(String((err && err.stderr) || (err && err.message) || err) + '\\n');
  }
}
if (failed > 0) {
  console.error('Build fehlgeschlagen: ' + failed + ' Datei(en) mit Syntaxfehlern.');
  process.exit(1);
}
${copy}`;
}
