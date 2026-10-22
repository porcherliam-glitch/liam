// Template "web-game" – Browserspiel without any dependency: canvas game loop in ES modules, pure game logic tested
// with `node --test`, a static dev server (server.mjs, Host check 421) and a syntax-check/copy build into dist/.
// Key decisions: game rules live in src/game.js without DOM access (deterministic RNG) so agents can test them;
// rendering/input live in src/main.js. Preview kind browser-dev-server (server.mjs prints its URL).
import type { ProjectTemplate } from '../../contracts';
import { emptyCommands } from '../config';
import { GITIGNORE_NODE, HONEST_LIMITS_DE, buildScriptSource, htmlEscape, markdownParagraph, packageSlug, staticDevServerSource, staticDevServerTestSource, writeScaffold, type ScaffoldFiles } from './common';

const PORT = 5174;

function packageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name: packageSlug(name),
        version: '0.1.0',
        private: true,
        type: 'module',
        description: `${name} – Browserspiel`,
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
    <main>
      <h1>${htmlEscape(name)}</h1>
      <p class="hud">Punkte: <strong id="score">0</strong> · Rekord: <strong id="highscore">0</strong></p>
      <canvas id="game" width="640" height="400" aria-label="Spielfeld"></canvas>
      <p class="help">Steuerung: Pfeiltasten oder WASD. Sammle die gelben Sterne und weiche den roten Gegnern aus. Neustart mit Leertaste oder Enter.</p>
    </main>
    <script type="module" src="src/main.js"></script>
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
  place-items: center;
}
main {
  text-align: center;
  padding: 1rem;
}
h1 {
  margin: 0 0 0.5rem;
  font-size: 1.6rem;
  color: #a78bfa;
}
canvas {
  max-width: 100%;
  border: 2px solid #4c3d8f;
  border-radius: 8px;
  background: #0f0f1a;
}
.hud,
.help {
  color: #b9b9cc;
}
`;

const GAME_JS = `// src/game.js – Spiellogik ohne Browser-Abhängigkeiten (dadurch mit "node --test" prüfbar).
export const WIDTH = 640;
export const HEIGHT = 400;
export const PLAYER_SIZE = 24;
export const STAR_SIZE = 16;
export const ENEMY_SIZE = 20;
/** Pixel pro Sekunde. */
export const PLAYER_SPEED = 220;
/** Alle so viele Sterne kommt ein Gegner dazu. */
export const ENEMY_EVERY = 5;

/** Kleiner deterministischer Zufallsgenerator (mulberry32): gleicher Startwert = gleiches Spiel. */
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Achsenparallele Rechtecke (Position = linke obere Ecke). */
export function overlaps(a, sizeA, b, sizeB) {
  return a.x < b.x + sizeB && a.x + sizeA > b.x && a.y < b.y + sizeB && a.y + sizeA > b.y;
}

function randomPosition(random, size) {
  return { x: Math.floor(random() * (WIDTH - size)), y: Math.floor(random() * (HEIGHT - size)) };
}

function withVelocity(pos, random) {
  const angle = random() * Math.PI * 2;
  const speed = 90 + random() * 60;
  return { x: pos.x, y: pos.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

/** Neuer Gegner mit mindestens 150 Pixel Abstand zum Spieler. */
export function spawnEnemy(random, player) {
  for (let i = 0; i < 20; i++) {
    const pos = randomPosition(random, ENEMY_SIZE);
    if (Math.hypot(pos.x - player.x, pos.y - player.y) >= 150) return withVelocity(pos, random);
  }
  const corner = {
    x: player.x < WIDTH / 2 ? WIDTH - ENEMY_SIZE : 0,
    y: player.y < HEIGHT / 2 ? HEIGHT - ENEMY_SIZE : 0,
  };
  return withVelocity(corner, random);
}

/** Bewegt einen Gegner und lässt ihn an den Rändern abprallen. */
export function moveEnemy(enemy, dt) {
  let x = enemy.x + enemy.vx * dt;
  let y = enemy.y + enemy.vy * dt;
  let vx = enemy.vx;
  let vy = enemy.vy;
  const maxX = WIDTH - ENEMY_SIZE;
  const maxY = HEIGHT - ENEMY_SIZE;
  if (x < 0) {
    x = -x;
    vx = Math.abs(vx);
  } else if (x > maxX) {
    x = 2 * maxX - x;
    vx = -Math.abs(vx);
  }
  if (y < 0) {
    y = -y;
    vy = Math.abs(vy);
  } else if (y > maxY) {
    y = 2 * maxY - y;
    vy = -Math.abs(vy);
  }
  return { x: clamp(x, 0, maxX), y: clamp(y, 0, maxY), vx, vy };
}

export function createGame(seed = Date.now()) {
  const random = createRandom(seed);
  return {
    random,
    player: { x: WIDTH / 2 - PLAYER_SIZE / 2, y: HEIGHT / 2 - PLAYER_SIZE / 2 },
    star: randomPosition(random, STAR_SIZE),
    enemies: [],
    score: 0,
    elapsed: 0,
    gameOver: false,
  };
}

/**
 * Ein Simulationsschritt. input = { up, down, left, right } (true/false), dt in Sekunden.
 * Gibt einen NEUEN Zustand zurück (der alte bleibt unverändert).
 */
export function step(state, input, dt) {
  if (state.gameOver) return state;
  const delta = clamp(dt, 0, 0.1); // große Zeitsprünge (Tab im Hintergrund) begrenzen
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx !== 0 && dy !== 0) {
    dx *= Math.SQRT1_2;
    dy *= Math.SQRT1_2;
  }
  const player = {
    x: clamp(state.player.x + dx * PLAYER_SPEED * delta, 0, WIDTH - PLAYER_SIZE),
    y: clamp(state.player.y + dy * PLAYER_SPEED * delta, 0, HEIGHT - PLAYER_SIZE),
  };
  let enemies = state.enemies.map((enemy) => moveEnemy(enemy, delta));
  let star = state.star;
  let score = state.score;
  if (overlaps(player, PLAYER_SIZE, star, STAR_SIZE)) {
    score += 1;
    star = randomPosition(state.random, STAR_SIZE);
    if (score % ENEMY_EVERY === 0) enemies = enemies.concat([spawnEnemy(state.random, player)]);
  }
  const gameOver = enemies.some((enemy) => overlaps(player, PLAYER_SIZE, enemy, ENEMY_SIZE));
  return { random: state.random, player, star, enemies, score, elapsed: state.elapsed + delta, gameOver };
}

/** Neues Spiel nach "Game over". */
export function restart(state) {
  return createGame(Math.floor(state.random() * 2147483647));
}
`;

const MAIN_JS = `// src/main.js – Darstellung (Canvas), Eingabe (Tastatur) und Spielschleife im Browser.
import { createGame, step, restart, WIDTH, HEIGHT, PLAYER_SIZE, STAR_SIZE, ENEMY_SIZE } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highscoreEl = document.getElementById('highscore');
canvas.width = WIDTH;
canvas.height = HEIGHT;

const keys = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };

// localStorage ist in einer abgeschotteten Vorschau evtl. nicht verfügbar – dann gilt der Rekord nur bis zum Neuladen.
function readHighscore() {
  try {
    return Number(window.localStorage.getItem('highscore')) || 0;
  } catch {
    return 0;
  }
}
function writeHighscore(value) {
  try {
    window.localStorage.setItem('highscore', String(value));
  } catch {
    /* nicht verfügbar */
  }
}

let state = createGame();
let highscore = readHighscore();

window.addEventListener('keydown', (event) => {
  const key = KEYMAP[event.code];
  if (key) {
    keys[key] = true;
    event.preventDefault();
  }
  if ((event.code === 'Space' || event.code === 'Enter') && state.gameOver) state = restart(state);
});
window.addEventListener('keyup', (event) => {
  const key = KEYMAP[event.code];
  if (key) keys[key] = false;
});
window.addEventListener('blur', () => {
  keys.up = keys.down = keys.left = keys.right = false;
});

function draw() {
  ctx.fillStyle = '#0f0f1a';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(state.star.x, state.star.y, STAR_SIZE, STAR_SIZE);
  ctx.fillStyle = '#ef4444';
  for (const enemy of state.enemies) ctx.fillRect(enemy.x, enemy.y, ENEMY_SIZE, ENEMY_SIZE);
  ctx.fillStyle = '#a78bfa';
  ctx.fillRect(state.player.x, state.player.y, PLAYER_SIZE, PLAYER_SIZE);
  if (state.gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game over – ' + state.score + ' Punkte', WIDTH / 2, HEIGHT / 2);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Leertaste oder Enter für ein neues Spiel', WIDTH / 2, HEIGHT / 2 + 32);
  }
  scoreEl.textContent = String(state.score);
  highscoreEl.textContent = String(highscore);
}

let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  state = step(state, keys, dt);
  if (state.score > highscore) {
    highscore = state.score;
    writeHighscore(highscore);
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
`;

const GAME_TEST = `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, restart, moveEnemy, overlaps, WIDTH, HEIGHT, PLAYER_SIZE, PLAYER_SPEED, ENEMY_EVERY, ENEMY_SIZE } from '../src/game.js';

const idle = { up: false, down: false, left: false, right: false };

test('gleicher Startwert ergibt das gleiche Spiel', () => {
  assert.deepEqual(createGame(42).star, createGame(42).star);
});

test('der Spieler bewegt sich und bleibt im Spielfeld', () => {
  // Stern in die Ecke oben links legen, damit unterwegs nichts eingesammelt wird.
  let state = { ...createGame(1), star: { x: 0, y: 0 } };
  const startX = state.player.x;
  state = step(state, { ...idle, right: true }, 0.1);
  assert.ok(Math.abs(state.player.x - (startX + PLAYER_SPEED * 0.1)) < 1e-9);
  for (let i = 0; i < 100; i++) state = step(state, { ...idle, right: true, down: true }, 0.1);
  assert.equal(state.player.x, WIDTH - PLAYER_SIZE);
  assert.equal(state.player.y, HEIGHT - PLAYER_SIZE);
});

test('diagonal ist der Spieler nicht schneller', () => {
  const state = createGame(1);
  const next = step(state, { ...idle, right: true, down: true }, 0.1);
  const distance = Math.hypot(next.player.x - state.player.x, next.player.y - state.player.y);
  assert.ok(Math.abs(distance - PLAYER_SPEED * 0.1) < 1e-9);
});

test('ein Stern bringt einen Punkt und erscheint neu', () => {
  const state = createGame(7);
  const onPlayer = { ...state, star: { x: state.player.x, y: state.player.y } };
  const next = step(onPlayer, idle, 0.016);
  assert.equal(next.score, 1);
  assert.notDeepEqual(next.star, onPlayer.star);
});

test('alle paar Sterne kommt ein Gegner mit Abstand dazu', () => {
  let state = createGame(3);
  state = { ...state, score: ENEMY_EVERY - 1, star: { x: state.player.x, y: state.player.y } };
  state = step(state, idle, 0.016);
  assert.equal(state.enemies.length, 1);
  assert.equal(overlaps(state.player, PLAYER_SIZE, state.enemies[0], ENEMY_SIZE), false);
});

test('Berührung mit einem Gegner beendet das Spiel', () => {
  const state = createGame(5);
  const enemy = { x: state.player.x, y: state.player.y, vx: 0, vy: 0 };
  const next = step({ ...state, enemies: [enemy] }, idle, 0.016);
  assert.equal(next.gameOver, true);
  assert.equal(step(next, { ...idle, left: true }, 0.1), next);
  const fresh = restart(next);
  assert.equal(fresh.gameOver, false);
  assert.equal(fresh.score, 0);
});

test('Gegner prallen am Rand ab', () => {
  const moved = moveEnemy({ x: 2, y: 100, vx: -100, vy: 0 }, 0.1);
  assert.ok(moved.x >= 0);
  assert.ok(moved.vx > 0);
});
`;

function readme(name: string, description: string): string {
  return `# ${name}

${description ? markdownParagraph(description) + '\n\n' : ''}Ein Browserspiel ohne zusätzliche Pakete: HTML, CSS und JavaScript (ES-Module) mit einer Canvas-Spielschleife.
Angelegt mit NOVA AI aus der Vorlage „Browserspiel“.

## Voraussetzungen

- [Node.js](https://nodejs.org) ab Version 20 (für den Entwicklungsserver und die Tests). Weitere Pakete werden nicht benötigt.

## Starten

\`\`\`
node server.mjs
\`\`\`

Der Server zeigt seine Adresse an (Standard: http://127.0.0.1:${PORT}/, ist der Port belegt, wird der nächste freie genommen).
In NOVA erscheint das Spiel in der Vorschau des Studios und lädt nach Änderungen neu.

## Tests

\`\`\`
node --test
\`\`\`

Die Spielregeln stehen in \`src/game.js\` und sind ohne Browser testbar (\`tests/game.test.mjs\`).
\`tests/server.test.mjs\` prüft den Entwicklungsserver.

## Build

\`\`\`
node scripts/build.mjs
\`\`\`

Prüft die Syntax aller Skripte und kopiert das fertige Spiel nach \`dist/\`. Diesen Ordner kann jeder statische Webserver ausliefern.

## Aufbau

- \`index.html\`, \`styles.css\` – Seite und Aussehen
- \`src/game.js\` – Spiellogik (Bewegung, Sterne, Gegner, Punkte)
- \`src/main.js\` – Zeichnen, Tastatur, Spielschleife
- \`server.mjs\` – kleiner Entwicklungsserver (nur 127.0.0.1)

## Grenzen (ehrlich)

- Der Entwicklungsserver ist nur für die Entwicklung gedacht, nicht für den Betrieb im Internet.
- In der abgeschotteten NOVA-Vorschau ist \`localStorage\` evtl. nicht verfügbar; der Rekord gilt dann nur bis zum Neuladen.
${HONEST_LIMITS_DE}
`;
}

export function createWebGameTemplate(): ProjectTemplate {
  return {
    info: {
      id: 'web-game',
      name: 'Browserspiel',
      description: 'Spiel für den Browser mit HTML, CSS und JavaScript (Canvas) – ohne zusätzliche Pakete, mit Tests und Live-Vorschau.',
      kind: 'web',
      technologies: ['HTML', 'CSS', 'JavaScript', 'Canvas'],
      requiredTools: ['node'],
      previewKind: 'browser-dev-server',
    },
    async scaffold(dir, opts) {
      const files: ScaffoldFiles = {
        'package.json': packageJson(opts.name),
        'index.html': indexHtml(opts.name),
        'styles.css': STYLES,
        'src/game.js': GAME_JS,
        'src/main.js': MAIN_JS,
        'tests/game.test.mjs': GAME_TEST,
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
          conventions: 'Spiellogik in src/game.js ohne DOM-Zugriffe halten und mit node --test (tests/*.test.mjs) prüfen. Keine npm-Pakete ohne Rückfrage hinzufügen.',
        },
        notes: [],
      };
    },
  };
}
