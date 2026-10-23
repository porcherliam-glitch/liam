// Template "web-app" – Webanwendung without any dependency: static single-page app (task list with filters and
// localStorage persistence), pure logic tested with `node --test`, static dev server (server.mjs, Host check 421)
// and a syntax-check/copy build into dist/.
// Key decisions: all state transitions are pure functions in src/todos.js (testable without a browser);
// src/app.js only renders and wires DOM events. Preview kind browser-dev-server.
import type { ProjectTemplate } from '../../contracts';
import { emptyCommands } from '../config';
import { GITIGNORE_NODE, HONEST_LIMITS_DE, buildScriptSource, htmlEscape, markdownParagraph, packageSlug, staticDevServerSource, staticDevServerTestSource, writeScaffold, type ScaffoldFiles } from './common';

const PORT = 5175;

function packageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name: packageSlug(name),
        version: '0.1.0',
        private: true,
        type: 'module',
        description: `${name} – Webanwendung`,
        scripts: { dev: 'node server.mjs', start: 'node server.mjs', test: 'node --test', build: 'node scripts/build.mjs' },
        engines: { node: '>=20' },
      },
      null,
      2,
    ) + '\n'
  );
}

function indexHtml(name: string): string {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${htmlEscape(name)}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main class="card">
      <h1>${htmlEscape(name)}</h1>
      <form id="new-todo" autocomplete="off">
        <label class="visually-hidden" for="title">Neue Aufgabe</label>
        <input id="title" name="title" maxlength="200" placeholder="Was ist zu tun?" required />
        <button type="submit">Hinzufügen</button>
      </form>
      <p id="error" class="error" role="alert" hidden></p>
      <nav class="filters" aria-label="Filter">
        <button type="button" data-filter="all" aria-pressed="true">Alle</button>
        <button type="button" data-filter="open" aria-pressed="false">Offen</button>
        <button type="button" data-filter="done" aria-pressed="false">Erledigt</button>
      </nav>
      <ul id="list" class="list"></ul>
      <footer class="footer">
        <span id="count">0 offen</span>
        <button type="button" id="clear-done">Erledigte entfernen</button>
      </footer>
    </main>
    <script type="module" src="src/app.js"></script>
  </body>
</html>
`;
}

const STYLES = `:root {
  color-scheme: dark;
  font-family: system-ui, 'Segoe UI', sans-serif;
  background: #0b0b14;
  color: #e6e6f0;
}
body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: start center;
  padding-top: 8vh;
}
.card {
  width: min(560px, 92vw);
  background: #14142a;
  border: 1px solid #2c2c52;
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
}
h1 {
  margin: 0 0 1rem;
  color: #a78bfa;
  font-size: 1.5rem;
}
form {
  display: flex;
  gap: 0.5rem;
}
input {
  flex: 1;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid #3a3a66;
  background: #0f0f1f;
  color: inherit;
}
button {
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  border: 1px solid #4c3d8f;
  background: #2a2350;
  color: inherit;
  cursor: pointer;
}
button[aria-pressed='true'] {
  background: #5b45c6;
}
.filters {
  display: flex;
  gap: 0.4rem;
  margin: 1rem 0 0.5rem;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.list li {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem 0;
  border-bottom: 1px solid #23233f;
}
.list li.done span {
  text-decoration: line-through;
  color: #8a8aa8;
}
.list li span {
  flex: 1;
  overflow-wrap: anywhere;
}
.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.8rem;
  color: #b9b9cc;
}
.error {
  color: #f87171;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
`;

const TODOS_JS = `// src/todos.js – Logik der Aufgabenliste ohne Browser-Abhängigkeiten (mit "node --test" prüfbar).
// Alle Funktionen sind "rein": sie verändern die übergebene Liste nicht, sondern geben eine neue zurück.

export const MAX_TITLE_LENGTH = 200;
export const FILTERS = ['all', 'open', 'done'];

let counter = 0;
function makeId(now) {
  counter = (counter + 1) % 1000000;
  return now.toString(36) + '-' + counter.toString(36);
}

/** Prüft und bereinigt einen Titel. Wirft einen Fehler mit deutscher Meldung. */
export function normalizeTitle(title) {
  const value = String(title == null ? '' : title).replace(/\\s+/g, ' ').trim();
  if (!value) throw new Error('Bitte einen Titel eingeben.');
  if (value.length > MAX_TITLE_LENGTH) throw new Error('Der Titel darf höchstens ' + MAX_TITLE_LENGTH + ' Zeichen lang sein.');
  return value;
}

export function addTodo(list, title, now = Date.now()) {
  const todo = { id: makeId(now), title: normalizeTitle(title), done: false, createdAt: now };
  return list.concat([todo]);
}

export function toggleTodo(list, id) {
  return list.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));
}

export function renameTodo(list, id, title) {
  const value = normalizeTitle(title);
  return list.map((todo) => (todo.id === id ? { ...todo, title: value } : todo));
}

export function removeTodo(list, id) {
  return list.filter((todo) => todo.id !== id);
}

export function clearDone(list) {
  return list.filter((todo) => !todo.done);
}

export function filterTodos(list, filter) {
  if (filter === 'open') return list.filter((todo) => !todo.done);
  if (filter === 'done') return list.filter((todo) => todo.done);
  return list.slice();
}

export function countOpen(list) {
  return list.filter((todo) => !todo.done).length;
}

export function serialize(list) {
  return JSON.stringify(list);
}

/** Liest gespeicherte Daten; alles Ungültige wird verworfen (beschädigte Daten führen nie zum Absturz). */
export function deserialize(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((t) => t && typeof t === 'object' && typeof t.id === 'string' && typeof t.title === 'string' && t.title.trim() !== '')
    .map((t) => ({
      id: t.id,
      title: t.title.slice(0, MAX_TITLE_LENGTH),
      done: t.done === true,
      createdAt: typeof t.createdAt === 'number' ? t.createdAt : 0,
    }));
}
`;

const APP_JS = `// src/app.js – Oberfläche: zeichnet die Liste und verbindet Formular, Filter und Schaltflächen mit src/todos.js.
import { addTodo, toggleTodo, removeTodo, clearDone, filterTodos, countOpen, serialize, deserialize } from './todos.js';

const STORAGE_KEY = 'todos';
const form = document.getElementById('new-todo');
const input = document.getElementById('title');
const listEl = document.getElementById('list');
const countEl = document.getElementById('count');
const errorEl = document.getElementById('error');
const clearButton = document.getElementById('clear-done');
const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));

// localStorage kann in einer abgeschotteten Vorschau fehlen – dann bleiben die Daten nur bis zum Neuladen erhalten.
function load() {
  try {
    return deserialize(window.localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
function save(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(list));
  } catch {
    /* nicht verfügbar */
  }
}

let todos = load();
let filter = 'all';

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

function update(next) {
  todos = next;
  save(todos);
  render();
}

function render() {
  listEl.replaceChildren();
  for (const todo of filterTodos(todos, filter)) {
    const item = document.createElement('li');
    if (todo.done) item.classList.add('done');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = todo.done;
    checkbox.setAttribute('aria-label', 'Erledigt: ' + todo.title);
    checkbox.addEventListener('change', () => update(toggleTodo(todos, todo.id)));
    const text = document.createElement('span');
    text.textContent = todo.title;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Löschen';
    remove.addEventListener('click', () => update(removeTodo(todos, todo.id)));
    item.append(checkbox, text, remove);
    listEl.append(item);
  }
  const open = countOpen(todos);
  countEl.textContent = open === 1 ? '1 offen' : open + ' offen';
  for (const button of filterButtons) button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    update(addTodo(todos, input.value));
    input.value = '';
    showError('');
  } catch (err) {
    showError(err.message);
  }
});
clearButton.addEventListener('click', () => update(clearDone(todos)));
for (const button of filterButtons) {
  button.addEventListener('click', () => {
    filter = button.dataset.filter;
    render();
  });
}

render();
`;

const TODOS_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addTodo, toggleTodo, renameTodo, removeTodo, clearDone, filterTodos, countOpen, serialize, deserialize, normalizeTitle, MAX_TITLE_LENGTH } from '../src/todos.js';

test('neue Aufgaben werden angehängt und bereinigt', () => {
  const list = addTodo([], '  Milch   kaufen ', 1000);
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Milch kaufen');
  assert.equal(list[0].done, false);
});

test('leere oder zu lange Titel werden abgelehnt', () => {
  assert.throws(() => normalizeTitle('   '), /Titel/);
  assert.throws(() => normalizeTitle('x'.repeat(MAX_TITLE_LENGTH + 1)), /höchstens/);
});

test('abhaken, umbenennen, filtern und zählen', () => {
  let list = addTodo(addTodo([], 'A', 1), 'B', 2);
  const [a, b] = list;
  list = toggleTodo(list, a.id);
  assert.equal(countOpen(list), 1);
  assert.deepEqual(filterTodos(list, 'done').map((t) => t.title), ['A']);
  assert.deepEqual(filterTodos(list, 'open').map((t) => t.title), ['B']);
  assert.equal(filterTodos(list, 'all').length, 2);
  list = renameTodo(list, b.id, 'B2');
  assert.equal(list[1].title, 'B2');
});

test('die Funktionen verändern die Eingabe nicht', () => {
  const list = Object.freeze(addTodo([], 'A', 1));
  toggleTodo(list, list[0].id);
  removeTodo(list, list[0].id);
  assert.equal(list[0].done, false);
  assert.equal(list.length, 1);
});

test('Erledigte entfernen', () => {
  let list = addTodo(addTodo([], 'A', 1), 'B', 2);
  list = toggleTodo(list, list[0].id);
  assert.deepEqual(clearDone(list).map((t) => t.title), ['B']);
});

test('Speichern und Laden, beschädigte Daten werden verworfen', () => {
  const list = toggleTodo(addTodo([], 'A', 1), addTodo([], 'A', 1)[0].id);
  assert.equal(deserialize(serialize(list)).length, 1);
  assert.deepEqual(deserialize('kein json'), []);
  assert.deepEqual(deserialize('{"a":1}'), []);
  assert.deepEqual(deserialize('[{"id":1,"title":"x"},{"id":"a","title":"ok","done":"ja"}]'), [{ id: 'a', title: 'ok', done: false, createdAt: 0 }]);
});
`;

function readme(name: string, description: string): string {
  return `# ${name}

${description ? markdownParagraph(description) + '\n\n' : ''}Eine Webanwendung ohne zusätzliche Pakete: HTML, CSS und JavaScript (ES-Module). Als Startpunkt enthält sie eine
Aufgabenliste mit Filtern, die im Browser gespeichert wird. Angelegt mit NOVA AI aus der Vorlage „Webanwendung“.

## Voraussetzungen

- [Node.js](https://nodejs.org) ab Version 20 (für den Entwicklungsserver und die Tests). Weitere Pakete werden nicht benötigt.

## Starten

\`\`\`
node server.mjs
\`\`\`

Der Server zeigt seine Adresse an (Standard: http://127.0.0.1:${PORT}/, ist der Port belegt, wird der nächste freie genommen).
In NOVA erscheint die Anwendung in der Vorschau des Studios und lädt nach Änderungen neu.

## Tests

\`\`\`
node --test
\`\`\`

Die Logik steht in \`src/todos.js\` und ist ohne Browser testbar (\`tests/todos.test.mjs\`).

## Build

\`\`\`
node scripts/build.mjs
\`\`\`

Prüft die Syntax aller Skripte und kopiert die Anwendung nach \`dist/\`.

## Grenzen (ehrlich)

- Die Daten liegen nur im Browser (\`localStorage\`). Für gemeinsame Daten braucht es ein Backend (z. B. die Vorlage „Backend / API“).
- In der abgeschotteten NOVA-Vorschau ist \`localStorage\` evtl. nicht verfügbar; die Liste gilt dann nur bis zum Neuladen.
- Der Entwicklungsserver ist nur für die Entwicklung gedacht, nicht für den Betrieb im Internet.
${HONEST_LIMITS_DE}
`;
}

export function createWebAppTemplate(): ProjectTemplate {
  return {
    info: {
      id: 'web-app',
      name: 'Webanwendung',
      description: 'Webanwendung mit HTML, CSS und JavaScript – ohne zusätzliche Pakete, mit Tests und Live-Vorschau.',
      kind: 'web',
      technologies: ['HTML', 'CSS', 'JavaScript'],
      requiredTools: ['node'],
      previewKind: 'browser-dev-server',
    },
    async scaffold(dir, opts) {
      const files: ScaffoldFiles = {
        'package.json': packageJson(opts.name),
        'index.html': indexHtml(opts.name),
        'styles.css': STYLES,
        'src/todos.js': TODOS_JS,
        'src/app.js': APP_JS,
        'tests/todos.test.mjs': TODOS_TEST,
        'tests/server.test.mjs': staticDevServerTestSource(),
        'server.mjs': staticDevServerSource(PORT),
        'scripts/build.mjs': buildScriptSource({ copyToDist: true }),
        'README.md': readme(opts.name, opts.description),
        '.gitignore': GITIGNORE_NODE,
      };
      return {
        files: writeScaffold(dir, files),
        config: {
          commands: emptyCommands({ dev: 'node server.mjs', run: 'node server.mjs', test: 'node --test', build: 'node scripts/build.mjs' }),
          preview: { kind: 'browser-dev-server', entry: 'index.html', url: null },
          artifactGlobs: ['dist/**'],
          conventions: 'Logik als reine Funktionen in src/ ohne DOM-Zugriffe halten und mit node --test (tests/*.test.mjs) prüfen. Keine npm-Pakete ohne Rückfrage hinzufügen.',
        },
        notes: [],
      };
    },
  };
}
