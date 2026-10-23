// Template "backend-api" – Backend/API with Node built-ins only: node:http JSON REST API, node:sqlite storage,
// node --test tests, a tiny HTML index page and a syntax-check build.
// Key decisions: storage (src/store.mjs) and HTTP handling (src/app.mjs) are separate modules so both are testable
// in-process (store with ':memory:', API on port 0). The server binds to 127.0.0.1 and enforces the Host header
// (421). node:sqlite needs Node.js >= 22.13 (prints an "experimental" warning, which is harmless).
import type { ProjectTemplate } from '../../contracts';
import { emptyCommands } from '../config';
import { GITIGNORE_NODE, HONEST_LIMITS_DE, buildScriptSource, jsString, markdownParagraph, packageSlug, writeScaffold, type ScaffoldFiles } from './common';

const PORT = 8787;

function packageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name: packageSlug(name),
        version: '0.1.0',
        private: true,
        type: 'module',
        description: `${name} – REST-API`,
        scripts: { dev: 'node server.mjs', start: 'node server.mjs', test: 'node --test', build: 'node scripts/build.mjs' },
        engines: { node: '>=22.13' },
      },
      null,
      2,
    ) + '\n'
  );
}

const STORE_MJS = `// src/store.mjs – Datenhaltung mit SQLite (node:sqlite, in Node.js eingebaut – kein Paket nötig).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const MAX_TITLE_LENGTH = 200;

/** Fehler mit deutscher Meldung, den die API als 400 zurückgibt. */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateTitle(value) {
  if (typeof value !== 'string') throw new ValidationError('Das Feld "title" muss ein Text sein.');
  const title = value.replace(/\\s+/g, ' ').trim();
  if (!title) throw new ValidationError('Das Feld "title" darf nicht leer sein.');
  if (title.length > MAX_TITLE_LENGTH) throw new ValidationError('Das Feld "title" darf höchstens ' + MAX_TITLE_LENGTH + ' Zeichen lang sein.');
  return title;
}

function toItem(row) {
  if (!row) return null;
  return { id: Number(row.id), title: row.title, done: Number(row.done) === 1, createdAt: row.created_at };
}

/** Öffnet (oder erstellt) die Datenbank. ':memory:' = nur im Arbeitsspeicher (Tests). */
export function openStore(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(
    'CREATE TABLE IF NOT EXISTS items (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'title TEXT NOT NULL, ' +
      'done INTEGER NOT NULL DEFAULT 0, ' +
      'created_at TEXT NOT NULL)',
  );
  const listStmt = db.prepare('SELECT * FROM items ORDER BY id');
  const getStmt = db.prepare('SELECT * FROM items WHERE id = ?');
  const insertStmt = db.prepare('INSERT INTO items (title, done, created_at) VALUES (?, 0, ?)');
  const updateStmt = db.prepare('UPDATE items SET title = ?, done = ? WHERE id = ?');
  const deleteStmt = db.prepare('DELETE FROM items WHERE id = ?');

  return {
    list() {
      return listStmt.all().map(toItem);
    },
    get(id) {
      return toItem(getStmt.get(id));
    },
    create(title) {
      const result = insertStmt.run(validateTitle(title), new Date().toISOString());
      return toItem(getStmt.get(Number(result.lastInsertRowid)));
    },
    update(id, patch) {
      const current = toItem(getStmt.get(id));
      if (!current) return null;
      const title = patch.title === undefined ? current.title : validateTitle(patch.title);
      if (patch.done !== undefined && typeof patch.done !== 'boolean') throw new ValidationError('Das Feld "done" muss true oder false sein.');
      const done = patch.done === undefined ? current.done : patch.done;
      updateStmt.run(title, done ? 1 : 0, id);
      return toItem(getStmt.get(id));
    },
    remove(id) {
      return Number(deleteStmt.run(id).changes) > 0;
    },
    close() {
      db.close();
    },
  };
}
`;

function appMjs(name: string): string {
  return `// src/app.mjs – HTTP-Schnittstelle (REST, JSON) auf Basis von node:http.
//   GET    /                 kleine Übersichtsseite
//   GET    /api/health       Status
//   GET    /api/items        alle Einträge
//   POST   /api/items        neuer Eintrag   { "title": "..." }
//   GET    /api/items/:id    ein Eintrag
//   PATCH  /api/items/:id    ändern          { "title"?: "...", "done"?: true }
//   DELETE /api/items/:id    löschen
import { createServer } from 'node:http';
import { ValidationError } from './store.mjs';

const APP_NAME = ${jsString(name)};
const MAX_BODY_BYTES = 1024 * 1024;

const BASE_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function sendJson(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function indexPage() {
  return (
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + escapeHtml(APP_NAME) + '</title>' +
    '<style>body{font-family:system-ui,sans-serif;background:#0b0b14;color:#e6e6f0;max-width:720px;margin:2rem auto;padding:0 1rem}' +
    'code{background:#1d1d36;padding:.1rem .3rem;border-radius:4px}h1{color:#a78bfa}li{margin:.3rem 0}</style></head><body>' +
    '<h1>' + escapeHtml(APP_NAME) + '</h1><p>Die API läuft. Verfügbare Endpunkte:</p><ul>' +
    '<li><code>GET /api/health</code></li><li><code>GET /api/items</code></li><li><code>POST /api/items</code> mit <code>{"title":"..."}</code></li>' +
    '<li><code>GET /api/items/:id</code></li><li><code>PATCH /api/items/:id</code></li><li><code>DELETE /api/items/:id</code></li></ul>' +
    '<p><a href="/api/items" style="color:#93c5fd">Alle Einträge als JSON ansehen</a></p></body></html>'
  );
}

/** Nur 127.0.0.1, localhost und [::1] mit dem eigenen Port sind erlaubt (Schutz vor DNS-Rebinding). */
export function isAllowedHost(hostHeader, port) {
  const host = String(hostHeader || '').toLowerCase();
  return host === '127.0.0.1:' + port || host === 'localhost:' + port || host === '[::1]:' + port;
}

function readJson(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) return reject(Object.assign(new Error('Die Anfrage ist zu groß.'), { status: 413 }));
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) return resolvePromise({});
      try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('kein Objekt');
        resolvePromise(data);
      } catch {
        reject(Object.assign(new Error('Ungültiges JSON im Anfragekörper.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function parseId(text) {
  const id = Number(text);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Erstellt den HTTP-Server (noch nicht gestartet). */
export function createApiServer({ store }) {
  const server = createServer(async (req, res) => {
    try {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      if (!isAllowedHost(req.headers.host, port)) return sendError(res, 421, 'Falscher Host-Header.');
      const url = new URL(req.url || '/', 'http://127.0.0.1:' + port);
      const path = url.pathname.replace(/\\/+$/, '') || '/';
      const method = req.method || 'GET';

      if (path === '/') {
        if (method !== 'GET' && method !== 'HEAD') return sendError(res, 405, 'Methode nicht erlaubt.');
        const body = indexPage();
        res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
        return res.end(method === 'HEAD' ? undefined : body);
      }
      if (path === '/api/health') {
        if (method !== 'GET') return sendError(res, 405, 'Methode nicht erlaubt.');
        return sendJson(res, 200, { ok: true });
      }
      if (path === '/api/items') {
        if (method === 'GET') return sendJson(res, 200, store.list());
        if (method === 'POST') {
          const body = await readJson(req);
          return sendJson(res, 201, store.create(body.title));
        }
        return sendError(res, 405, 'Methode nicht erlaubt.');
      }
      const match = /^\\/api\\/items\\/([^/]+)$/.exec(path);
      if (match) {
        const id = parseId(match[1]);
        if (id === null) return sendError(res, 400, 'Ungültige ID.');
        if (method === 'GET') {
          const item = store.get(id);
          return item ? sendJson(res, 200, item) : sendError(res, 404, 'Eintrag nicht gefunden.');
        }
        if (method === 'PATCH') {
          const body = await readJson(req);
          const item = store.update(id, { title: body.title, done: body.done });
          return item ? sendJson(res, 200, item) : sendError(res, 404, 'Eintrag nicht gefunden.');
        }
        if (method === 'DELETE') {
          if (!store.remove(id)) return sendError(res, 404, 'Eintrag nicht gefunden.');
          res.writeHead(204, BASE_HEADERS);
          return res.end();
        }
        return sendError(res, 405, 'Methode nicht erlaubt.');
      }
      return sendError(res, 404, 'Unbekannter Pfad.');
    } catch (err) {
      if (err instanceof ValidationError) return sendError(res, 400, err.message);
      if (err && typeof err.status === 'number') return sendError(res, err.status, err.message);
      console.error(err);
      if (!res.headersSent) return sendError(res, 500, 'Interner Fehler.');
      res.destroy();
    }
  });
  return server;
}
`;
}

const SERVER_MJS = `// server.mjs – startet die API.
// Start: node server.mjs   (Port über PORT, sonst ${PORT}; Datenbankdatei über DB_FILE, sonst data/app.db)
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './src/store.mjs';
import { createApiServer } from './src/app.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_PORT = ${PORT};

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

/** Startet Datenbank und Server. options: { port, dbFile } (Tests: port 0, dbFile ':memory:'). */
export async function startServer(options = {}) {
  const dbFile = options.dbFile || process.env.DB_FILE || resolve(ROOT, 'data', 'app.db');
  const fromEnv = process.env.PORT !== undefined && process.env.PORT !== '';
  const explicit = options.port !== undefined;
  const firstPort = explicit ? options.port : fromEnv ? Number(process.env.PORT) : DEFAULT_PORT;
  if (!Number.isInteger(firstPort) || firstPort < 0 || firstPort > 65535) throw new Error('Ungültiger Port: ' + firstPort);
  const store = openStore(dbFile);
  const attempts = explicit || fromEnv || firstPort === 0 ? 1 : 20;
  for (let i = 0; i < attempts; i++) {
    const server = createApiServer({ store });
    try {
      const port = await listen(server, firstPort + i);
      server.on('close', () => store.close());
      return { server, store, port, url: 'http://127.0.0.1:' + port + '/' };
    } catch (err) {
      if (err.code !== 'EADDRINUSE' || i === attempts - 1) {
        store.close();
        throw err;
      }
    }
  }
  store.close();
  throw new Error('Kein freier Port gefunden.');
}

function isMain() {
  if (!process.argv[1]) return false;
  const self = fileURLToPath(import.meta.url);
  const started = resolve(process.argv[1]);
  return process.platform === 'win32' ? self.toLowerCase() === started.toLowerCase() : self === started;
}

if (isMain()) {
  startServer()
    .then(({ url, server }) => {
      console.log('API läuft: ' + url);
      console.log('Beenden mit Strg+C.');
      const stop = () => server.close(() => process.exit(0));
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
    })
    .catch((err) => {
      console.error('Der Server konnte nicht starten: ' + err.message);
      process.exit(1);
    });
}
`;

const STORE_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore, ValidationError } from '../src/store.mjs';

test('Einträge anlegen, lesen, ändern und löschen', () => {
  const store = openStore(':memory:');
  try {
    const item = store.create('  Erster   Eintrag ');
    assert.equal(item.title, 'Erster Eintrag');
    assert.equal(item.done, false);
    assert.deepEqual(store.get(item.id), item);
    const updated = store.update(item.id, { done: true });
    assert.equal(updated.done, true);
    assert.equal(updated.title, 'Erster Eintrag');
    assert.equal(store.list().length, 1);
    assert.equal(store.remove(item.id), true);
    assert.equal(store.remove(item.id), false);
    assert.equal(store.get(item.id), null);
  } finally {
    store.close();
  }
});

test('ungültige Eingaben werden abgelehnt', () => {
  const store = openStore(':memory:');
  try {
    assert.throws(() => store.create(''), ValidationError);
    assert.throws(() => store.create(42), ValidationError);
    const item = store.create('ok');
    assert.throws(() => store.update(item.id, { done: 'ja' }), ValidationError);
    assert.equal(store.update(999, { done: true }), null);
  } finally {
    store.close();
  }
});
`;

const API_TEST = `import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { startServer } from '../server.mjs';

let ctx;
before(async () => {
  ctx = await startServer({ port: 0, dbFile: ':memory:' });
});
after(() => new Promise((resolvePromise) => ctx.server.close(resolvePromise)));

function call(method, path, body, host) {
  return new Promise((resolvePromise, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const headers = { host: host || '127.0.0.1:' + ctx.port };
    if (data !== undefined) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(data);
    }
    const req = request({ host: '127.0.0.1', port: ctx.port, method, path, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
        resolvePromise({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.end(data);
  });
}

test('Übersichtsseite und Status', async () => {
  const index = await call('GET', '/');
  assert.equal(index.status, 200);
  assert.match(index.headers['content-type'], /text\\/html/);
  const health = await call('GET', '/api/health');
  assert.deepEqual(health.json, { ok: true });
});

test('vollständiger Ablauf: anlegen, lesen, ändern, löschen', async () => {
  const created = await call('POST', '/api/items', { title: 'Brot kaufen' });
  assert.equal(created.status, 201);
  const id = created.json.id;
  assert.equal((await call('GET', '/api/items/' + id)).json.title, 'Brot kaufen');
  const patched = await call('PATCH', '/api/items/' + id, { done: true });
  assert.equal(patched.json.done, true);
  assert.ok((await call('GET', '/api/items')).json.some((item) => item.id === id));
  assert.equal((await call('DELETE', '/api/items/' + id)).status, 204);
  assert.equal((await call('GET', '/api/items/' + id)).status, 404);
});

test('Fehlerfälle liefern verständliche Antworten', async () => {
  assert.equal((await call('POST', '/api/items', { title: '' })).status, 400);
  assert.equal((await call('GET', '/api/items/abc')).status, 400);
  assert.equal((await call('GET', '/gibt-es-nicht')).status, 404);
  assert.equal((await call('PUT', '/api/items')).status, 405);
});

test('fremde Host-Header werden mit 421 abgelehnt', async () => {
  const res = await call('GET', '/api/items', undefined, 'evil.example:' + ctx.port);
  assert.equal(res.status, 421);
});
`;

function readme(name: string, description: string): string {
  return `# ${name}

${description ? markdownParagraph(description) + '\n\n' : ''}Eine REST-API nur mit Bordmitteln von Node.js: \`node:http\` für die Schnittstelle, \`node:sqlite\` als Datenbank und
\`node --test\` für die Tests. Es werden keine npm-Pakete benötigt. Angelegt mit NOVA AI aus der Vorlage „Backend / API“.

## Voraussetzungen

- [Node.js](https://nodejs.org) ab Version 22.13 (wegen \`node:sqlite\`).

## Starten

\`\`\`
node server.mjs
\`\`\`

Die API zeigt ihre Adresse an (Standard: http://127.0.0.1:${PORT}/, ist der Port belegt, wird der nächste freie genommen).
Die Daten liegen in \`data/app.db\` (andere Datei über die Umgebungsvariable \`DB_FILE\`).

## Endpunkte

| Methode | Pfad | Bedeutung |
|---|---|---|
| GET | \`/api/health\` | Status |
| GET | \`/api/items\` | alle Einträge |
| POST | \`/api/items\` | neuer Eintrag, Körper \`{"title":"..."}\` |
| GET | \`/api/items/:id\` | ein Eintrag |
| PATCH | \`/api/items/:id\` | ändern, Körper \`{"title"?: "...", "done"?: true}\` |
| DELETE | \`/api/items/:id\` | löschen |

## Tests

\`\`\`
node --test
\`\`\`

\`tests/store.test.mjs\` prüft die Datenhaltung, \`tests/api.test.mjs\` startet die API auf einem freien Port mit einer
Datenbank im Arbeitsspeicher und prüft alle Endpunkte.

## Build

\`\`\`
node scripts/build.mjs
\`\`\`

Prüft die Syntax aller Skripte. Ein Bündeln ist nicht nötig.

## Grenzen (ehrlich)

- \`node:sqlite\` ist in Node.js noch als „experimentell“ markiert und gibt beim Start eine Warnung aus.
- Die API lauscht nur auf 127.0.0.1 und hat keine Anmeldung. Für den Betrieb im Netz braucht es Anmeldung, HTTPS und einen Reverse-Proxy.
${HONEST_LIMITS_DE}
`;
}

export function createBackendApiTemplate(): ProjectTemplate {
  return {
    info: {
      id: 'backend-api',
      name: 'Backend / API (Node.js)',
      description: 'REST-API mit Datenbank nur mit Node.js-Bordmitteln (node:http, node:sqlite) – ohne npm-Pakete, mit Tests.',
      kind: 'backend',
      technologies: ['Node.js', 'REST', 'SQLite'],
      requiredTools: ['node'],
      previewKind: 'browser-dev-server',
    },
    async scaffold(dir, opts) {
      const files: ScaffoldFiles = {
        'package.json': packageJson(opts.name),
        'server.mjs': SERVER_MJS,
        'src/store.mjs': STORE_MJS,
        'src/app.mjs': appMjs(opts.name),
        'tests/store.test.mjs': STORE_TEST,
        'tests/api.test.mjs': API_TEST,
        'scripts/build.mjs': buildScriptSource({ copyToDist: false }),
        'README.md': readme(opts.name, opts.description),
        '.gitignore': `${GITIGNORE_NODE}\n# Lokale Datenbank\ndata/\n`,
      };
      return {
        files: writeScaffold(dir, files),
        config: {
          commands: emptyCommands({ dev: 'node server.mjs', run: 'node server.mjs', test: 'node --test', build: 'node scripts/build.mjs' }),
          preview: { kind: 'browser-dev-server', entry: null, url: null },
          artifactGlobs: [],
          conventions:
            'Nur Node.js-Bordmittel (node:http, node:sqlite, node:test). Datenzugriff in src/store.mjs, HTTP in src/app.mjs. Jede neue Route mit einem Test in tests/api.test.mjs absichern.',
        },
        notes: [],
      };
    },
  };
}
