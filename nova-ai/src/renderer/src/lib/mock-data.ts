// Coherent German demo data for the in-memory mock bridge (lib/mock-bridge.ts).
// Three projects ("Pixel-Abenteuer", "Aetherfall", "Rezept-API") with tasks in every status, agent runs
// with step feeds, approvals, checks, models, budget, resources, errors, memory, files and logs.
// Everything is created relative to `now`, so relative times always look plausible.
import type {
  AgentRoleInfo,
  AgentRun,
  AgentStep,
  Approval,
  ApprovalRule,
  BackupInfo,
  ChangeRecord,
  Checkpoint,
  CheckRun,
  DaemonStatus,
  GitCommit,
  IntegrationStatus,
  LogEntry,
  MemoryEntry,
  ModelInfo,
  OllamaPull,
  OllamaRunningModel,
  OllamaStatus,
  PreviewStatus,
  ProcessInfo,
  Project,
  ProjectConfig,
  ProjectTemplateInfo,
  ProviderConfig,
  ProviderHealth,
  ResourceSnapshot,
  Task,
  TerminalSession,
  UsageRecord,
  Verification,
  WorkCycleState,
} from '@shared/schemas';
import type { NovaErrorInfo } from '@shared/errors';
import { defaultSettings, type Settings } from '@shared/settings';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
export const GB = 1024 ** 3;
export const MB = 1024 ** 2;

export const PIXEL = 'prj_pixel';
export const AETHER = 'prj_aether';
export const REZEPT = 'prj_rezept';
export const OLLAMA = 'ollama';
export const OPENROUTER = 'prov_openrouter';

export interface MockDb {
  now: number;
  projects: Project[];
  tasks: Task[];
  runs: AgentRun[];
  steps: AgentStep[];
  approvals: Approval[];
  rules: ApprovalRule[];
  providers: ProviderConfig[];
  providerHealth: ProviderHealth[];
  apiKeys: Record<string, boolean>;
  models: ModelInfo[];
  ollama: OllamaStatus;
  pulls: OllamaPull[];
  ollamaRunning: OllamaRunningModel[];
  usage: UsageRecord[];
  paidPaused: boolean;
  pausedReason: string | null;
  resources: ResourceSnapshot;
  resourceHistory: ResourceSnapshot[];
  errors: NovaErrorInfo[];
  memory: MemoryEntry[];
  /** projectId -> path -> content */
  files: Record<string, Record<string, string>>;
  /** projectId -> path -> content before the first NOVA change */
  originals: Record<string, Record<string, string>>;
  binaryFiles: Set<string>;
  changes: ChangeRecord[];
  checkpoints: Checkpoint[];
  checks: CheckRun[];
  processes: ProcessInfo[];
  processOutput: Record<string, string>;
  terminals: TerminalSession[];
  previews: Record<string, PreviewStatus>;
  integrations: IntegrationStatus[];
  logs: LogEntry[];
  settings: Settings;
  backups: BackupInfo[];
  templates: ProjectTemplateInfo[];
  roles: AgentRoleInfo[];
  commits: Record<string, GitCommit[]>;
  gitRepos: Record<string, boolean>;
  workState: WorkCycleState;
  daemon: DaemonStatus;
  autostart: boolean;
  nextStepId: number;
  nextChangeId: number;
  counter: number;
}

const unverified: Verification = { status: 'not_run', checks: [] };
const noChecks: Verification = { status: 'unavailable', checks: [] };

function config(partial: Partial<ProjectConfig> & Pick<ProjectConfig, 'commands' | 'preview'>): ProjectConfig {
  return {
    allowedCommands: [],
    testAfterChange: true,
    reviewChanges: true,
    autoCommit: true,
    monthlyBudgetUsd: null,
    conventions: '',
    ...partial,
  };
}

/** FNV-1a based pseudo hash (stand-in for sha256 in the demo). */
export function mockHash(text: string): string {
  let out = '';
  for (let seed = 0; seed < 4; seed++) {
    let h = 0x811c9dc5 ^ (seed * 0x9e3779b1);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    out += (h >>> 0).toString(16).padStart(8, '0');
  }
  return out;
}

export function languageOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    md: 'markdown',
    html: 'html',
    css: 'css',
    cs: 'csharp',
    py: 'python',
    yml: 'yaml',
    yaml: 'yaml',
    sql: 'sql',
    txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

// ---------------------------------------------------------------------------
// File contents
// ---------------------------------------------------------------------------

const PIXEL_FILES: Record<string, string> = {
  'package.json': `{
  "name": "pixel-abenteuer",
  "version": "0.3.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5174",
    "build": "tsc && vite build",
    "test": "vitest run",
    "lint": "eslint src tests"
  },
  "dependencies": {
    "phaser": "^3.80.1"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.4"
  }
}
`,
  'index.html': `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <title>Pixel-Abenteuer</title>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,
  'vite.config.ts': `import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174, host: '127.0.0.1' },
  build: { target: 'es2022' },
});
`,
  'README.md': `# Pixel-Abenteuer

Ein kleines 2D-Jump-'n'-Run im Browser.

- \`npm run dev\` startet das Spiel unter http://127.0.0.1:5174/
- \`npm test\` führt die Tests aus
- Pfeiltasten: laufen, Leertaste: springen
`,
  'src/main.ts': `import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 800,
  height: 450,
  pixelArt: true,
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 900 }, fixedStep: true } },
  scene: [MenuScene, GameScene],
});
`,
  'src/scenes/MenuScene.ts': `import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    this.add.text(400, 180, 'Pixel-Abenteuer', { fontSize: '32px' }).setOrigin(0.5);
    this.add.text(400, 260, 'Leertaste zum Starten', { fontSize: '16px' }).setOrigin(0.5);
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.start('game'));
  }
}
`,
  'src/scenes/GameScene.ts': `import Phaser from 'phaser';
import { Player } from '../game/player';

export class GameScene extends Phaser.Scene {
  private player!: Player;

  constructor() {
    super('game');
  }

  create(): void {
    const platforms = this.physics.add.staticGroup();
    platforms.create(400, 440, 'ground').setScale(2).refreshBody();
    platforms.create(600, 300, 'platform');
    platforms.create(150, 220, 'platform');

    this.player = new Player(this, 100, 300);
    this.physics.add.collider(this.player.sprite, platforms);
  }

  update(_time: number, delta: number): void {
    this.player.update(delta);
  }
}
`,
  'src/game/player.ts': `import Phaser from 'phaser';
import { clampToPlatform } from './physics';

export const MOVE_SPEED = 180;
export const JUMP_VELOCITY = -420;

export class Player {
  readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private readonly keys: Phaser.Types.Input.Keyboard.CursorKeys;
  private coyoteMs = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.sprite(x, y, 'hero');
    this.sprite.setCollideWorldBounds(true);
    this.keys = scene.input.keyboard!.createCursorKeys();
  }

  update(deltaMs: number): void {
    const body = this.sprite.body;
    const left = this.keys.left?.isDown ?? false;
    const right = this.keys.right?.isDown ?? false;

    body.setVelocityX(left === right ? 0 : left ? -MOVE_SPEED : MOVE_SPEED);

    // Short "coyote time" so a jump still works right after leaving a platform edge.
    this.coyoteMs = body.blocked.down ? 120 : Math.max(0, this.coyoteMs - deltaMs);
    if ((this.keys.space?.isDown || this.keys.up?.isDown) && this.coyoteMs > 0) {
      body.setVelocityY(JUMP_VELOCITY);
      this.coyoteMs = 0;
    }

    clampToPlatform(body);
  }
}
`,
  'src/game/physics.ts': `import type Phaser from 'phaser';

/** Keeps the player on top of a platform when standing exactly on its edge. */
export function clampToPlatform(body: Phaser.Physics.Arcade.Body): void {
  if (!body.blocked.down) return;
  const edge = Math.round(body.right);
  if (edge > 400 && body.velocity.x > 0) {
    body.x = 400 - body.width;
  }
}
`,
  'tests/player.test.ts': `import { describe, expect, it } from 'vitest';
import { simulate } from './helpers/simulate';

describe('Spieler', () => {
  it('läuft mit den Pfeiltasten', () => {
    const result = simulate({ keys: ['right'], ms: 500 });
    expect(result.x).toBeGreaterThan(160);
  });

  it('springt nur vom Boden aus', () => {
    const result = simulate({ keys: ['space'], ms: 100, airborne: true });
    expect(result.velocityY).toBe(0);
  });

  it('bleibt an der rechten Plattformkante stehen', () => {
    const result = simulate({ start: { x: 380, y: 300 }, keys: ['right'], ms: 300 });
    expect(result.x).toBeLessThanOrEqual(400);
  });
});
`,
  'public/assets/tiles.png': '',
};

const REZEPT_FILES: Record<string, string> = {
  'package.json': `{
  "name": "rezept-api",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p .",
    "start": "node dist/server.js",
    "test": "vitest run",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "better-sqlite3": "^11.5.0",
    "express": "^4.21.1"
  }
}
`,
  'README.md': `# Rezept-API

REST-API für eine Rezeptsammlung.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | /api/recipes?q=… | Rezepte suchen |
| POST | /api/recipes | Rezept anlegen |
| GET | /api/shopping-list | Einkaufszettel |
`,
  'src/server.ts': `import express from 'express';
import { recipesRouter } from './routes/recipes';

const app = express();
app.use(express.json());
app.use('/api/recipes', recipesRouter);

app.listen(3000, '127.0.0.1', () => {
  console.log('Rezept-API läuft auf http://127.0.0.1:3000');
});
`,
  'src/routes/recipes.ts': `import { Router } from 'express';
import { db } from '../db/database';

export const recipesRouter = Router();

recipesRouter.get('/', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const rows = q
    ? db.prepare('SELECT * FROM recipes WHERE title LIKE ? ORDER BY title').all(\`%\${q}%\`)
    : db.prepare('SELECT * FROM recipes ORDER BY created_at DESC LIMIT 50').all();
  res.json(rows);
});

recipesRouter.post('/', (req, res) => {
  const { title, ingredients } = req.body ?? {};
  if (!title) return res.status(400).json({ error: 'Titel fehlt' });
  const info = db.prepare('INSERT INTO recipes (title, ingredients) VALUES (?, ?)').run(title, JSON.stringify(ingredients ?? []));
  res.status(201).json({ id: info.lastInsertRowid });
});
`,
  'src/db/database.ts': `import Database from 'better-sqlite3';

export const db = new Database(process.env.DB_PATH ?? 'data/recipes.sqlite');
db.pragma('journal_mode = WAL');
`,
  'src/db/migrations/004_shopping.ts': `import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(\`
    CREATE TABLE IF NOT EXISTS shopping_items (
      id INTEGER PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      name TEXT NOT NULL,
      amount TEXT
    )
  \`);
}
`,
  'legacy/old-api.js': `// Alte Version der API (vor dem Umbau auf TypeScript). Wird nicht mehr verwendet.
module.exports = require('./server-v1');
`,
  'tests/search.test.ts': `import { describe, expect, it } from 'vitest';
import request from './helpers/request';

describe('Rezeptsuche', () => {
  it('findet Rezepte über den Titel', async () => {
    const res = await request.get('/api/recipes?q=suppe');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
`,
};

const AETHER_FILES: Record<string, string> = {
  'README.md': `# Chroniken von Aetherfall

3D-Open-World-Action-RPG in Unity 6.6 (URP). Aktuelles Ziel: der Mini-Slice mit Dorf Eichental und der vergessenen Gruft.
`,
  'Assets/_Project/Scripts/World/Portal.cs': `using UnityEngine;

namespace Aetherfall.World.Gameplay
{
    /// <summary>Loads the target world when the player enters the trigger.</summary>
    public sealed class Portal : MonoBehaviour
    {
        [SerializeField] private string targetWorldId = "gruft";
        [SerializeField] private string targetSpawnId = "entrance";

        private void OnTriggerEnter(Collider other)
        {
            if (!other.CompareTag("Player")) return;
            SceneLoader.Load(targetWorldId, targetSpawnId);
        }
    }
}
`,
  'Assets/_Project/Scripts/SaveSystem/SaveManager.cs': `using System.Collections.Generic;
using UnityEngine;

namespace Aetherfall.SaveSystem
{
    public sealed class SaveManager : MonoBehaviour
    {
        private readonly List<ISaveable> saveables = new();

        public void Register(ISaveable saveable) => saveables.Add(saveable);
        public void Unregister(ISaveable saveable) => saveables.Remove(saveable);
    }
}
`,
  'ProjectSettings/ProjectVersion.txt': `m_EditorVersion: 6000.6.5f1
`,
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function createMockDb(now: number = Date.now()): MockDb {
  const ago = (ms: number) => now - ms;

  const projects: Project[] = [
    {
      id: PIXEL,
      name: 'Pixel-Abenteuer',
      description: "Ein kleines 2D-Jump-'n'-Run im Browser mit Pixelgrafik, drei Leveln und einer Highscore-Liste.",
      path: 'C:\\Users\\Demo\\Documents\\NOVA Projekte\\Pixel-Abenteuer',
      kind: 'web',
      technologies: ['TypeScript', 'Vite', 'Phaser 3', 'Vitest'],
      status: 'active',
      templateId: 'web-game-phaser',
      config: config({
        commands: { install: 'npm install', dev: 'npm run dev', build: 'npm run build', test: 'npm test', lint: 'npm run lint', run: null },
        preview: { kind: 'browser-dev-server', entry: null, url: 'http://127.0.0.1:5174/' },
        allowedCommands: ['npx playwright test'],
        monthlyBudgetUsd: 5,
        conventions: 'TypeScript strikt, kein any. Spiellogik in src/game, Szenen in src/scenes. Texte im Spiel auf Deutsch.',
      }),
      workEnabled: true,
      gitAvailable: true,
      createdAt: ago(6 * DAY),
      updatedAt: ago(4 * MIN),
    },
    {
      id: AETHER,
      name: 'Aetherfall',
      description: '3D-Open-World-Action-RPG in Unity. Aktuell: der Mini-Slice mit Dorf Eichental und der vergessenen Gruft.',
      path: 'C:\\Users\\Demo\\Desktop\\Aetherfall',
      kind: 'unity',
      technologies: ['Unity 6.6', 'C#', 'URP', 'Input System', 'Cinemachine'],
      status: 'paused',
      templateId: null,
      config: config({
        commands: {
          install: null,
          dev: null,
          build: 'Unity.exe -batchmode -quit -projectPath . -executeMethod Aetherfall.EditorTools.Core.WindowsBuild.RunBatch',
          test: 'Unity.exe -batchmode -projectPath . -runTests -testPlatform EditMode',
          lint: null,
          run: null,
        },
        preview: { kind: 'engine-external', entry: null, url: null },
        reviewChanges: true,
        conventions: '[SerializeField] private statt öffentlicher Felder. Keine Find*-Aufrufe zur Laufzeit. Nur das neue Input System.',
      }),
      workEnabled: false,
      gitAvailable: true,
      createdAt: ago(21 * DAY),
      updatedAt: ago(26 * HOUR),
    },
    {
      id: REZEPT,
      name: 'Rezept-API',
      description: 'REST-API für eine Rezeptsammlung mit Suche, Zutatenliste und Einkaufszettel.',
      path: 'C:\\Users\\Demo\\Documents\\NOVA Projekte\\Rezept-API',
      kind: 'backend',
      technologies: ['Node.js', 'Express', 'SQLite', 'Vitest'],
      status: 'active',
      templateId: 'node-api',
      config: config({
        commands: { install: 'npm install', dev: 'npm run dev', build: 'npm run build', test: 'npm test', lint: null, run: 'npm start' },
        preview: { kind: 'browser-dev-server', entry: null, url: 'http://127.0.0.1:3000/' },
        autoCommit: false,
        conventions: 'Antworten der API immer als JSON. Fehlertexte auf Deutsch.',
      }),
      workEnabled: true,
      gitAvailable: false,
      createdAt: ago(3 * DAY),
      updatedAt: ago(2 * MIN),
    },
  ];

  const task = (t: Partial<Task> & Pick<Task, 'id' | 'projectId' | 'title' | 'kind' | 'role' | 'status'>): Task => ({
    parentId: null,
    description: '',
    priority: 1,
    dependsOn: [],
    attempts: 0,
    maxAttempts: 3,
    blocker: null,
    result: null,
    acceptance: null,
    verification: unverified,
    files: [],
    model: null,
    source: 'planner',
    createdAt: ago(2 * DAY),
    updatedAt: ago(2 * DAY),
    startedAt: null,
    finishedAt: null,
    ...t,
  });

  const passedTestsBuild: Verification = {
    status: 'passed',
    checks: [
      { name: 'Tests', status: 'passed', details: '22 von 22 Tests bestanden', checkRunId: 'crun_px_t1' },
      { name: 'Build', status: 'passed', details: null, checkRunId: 'crun_px_b1' },
    ],
  };

  const tasks: Task[] = [
    // --- Pixel-Abenteuer
    task({
      id: 'task_px1', projectId: PIXEL, title: 'Spielidee in Aufgaben zerlegen', kind: 'plan', role: 'planner', status: 'done',
      description: 'Aus der Projektbeschreibung einen Arbeitsplan mit Aufgaben, Reihenfolge und Abnahmekriterien erstellen.',
      result: '9 Aufgaben angelegt: Grundgerüst, Spielerbewegung, Level 1–3, Gegner, Highscore, Tests und Build.',
      verification: noChecks, source: 'system', model: 'ollama/qwen2.5-coder:14b', attempts: 1,
      createdAt: ago(6 * DAY), updatedAt: ago(6 * DAY - 4 * MIN), startedAt: ago(6 * DAY), finishedAt: ago(6 * DAY - 4 * MIN),
    }),
    task({
      id: 'task_px2', projectId: PIXEL, parentId: 'task_px1', title: 'Grundgerüst mit Vite und Phaser anlegen', kind: 'code', role: 'coder', status: 'done',
      description: 'Projekt mit Vite, TypeScript und Phaser 3 einrichten, Startszene und Spielszene anlegen.',
      acceptance: 'npm run dev startet das Spiel, npm test und npm run build laufen fehlerfrei.',
      result: 'Vite-Projekt mit Menü- und Spielszene angelegt. Tests und Build laufen.',
      verification: passedTestsBuild, files: ['package.json', 'index.html', 'vite.config.ts', 'src/main.ts', 'src/scenes/MenuScene.ts'],
      model: 'ollama/qwen2.5-coder:14b', attempts: 1, priority: 2,
      createdAt: ago(6 * DAY), updatedAt: ago(5 * DAY), startedAt: ago(5 * DAY + 40 * MIN), finishedAt: ago(5 * DAY),
    }),
    task({
      id: 'task_px3', projectId: PIXEL, parentId: 'task_px1', title: 'Spielerbewegung mit Tastatur und Sprung', kind: 'code', role: 'coder', status: 'running',
      description: 'Der Spieler läuft mit den Pfeiltasten und springt mit der Leertaste. Kurze Gnadenzeit nach dem Verlassen einer Kante.',
      acceptance: 'Laufen links/rechts, Sprung nur vom Boden, kein Durchfallen an Kanten. Tests für alle drei Fälle.',
      dependsOn: ['task_px2'], files: ['src/game/player.ts', 'src/scenes/GameScene.ts'], model: 'ollama/qwen2.5-coder:14b',
      attempts: 1, priority: 2, createdAt: ago(6 * DAY), updatedAt: ago(1 * MIN), startedAt: ago(6 * MIN),
    }),
    task({
      id: 'task_px4', projectId: PIXEL, parentId: 'task_px1', title: 'End-to-End-Test für das Hauptmenü', kind: 'test', role: 'tester', status: 'waiting_approval',
      description: 'Mit Playwright prüfen, dass das Hauptmenü erscheint und die Leertaste das Spiel startet.',
      blocker: 'Wartet auf Freigabe: Playwright-Browser installieren (npx playwright install chromium).',
      model: 'ollama/llama3.1:8b', attempts: 1, createdAt: ago(6 * DAY), updatedAt: ago(2 * MIN), startedAt: ago(4 * MIN),
    }),
    task({
      id: 'task_px5', projectId: PIXEL, parentId: 'task_px1', title: 'Level 2: Höhle mit beweglichen Plattformen', kind: 'code', role: 'coder', status: 'queued',
      description: 'Zweites Level mit dunkler Höhlen-Kulisse, zwei beweglichen Plattformen und einem Schalter.',
      dependsOn: ['task_px3'], createdAt: ago(6 * DAY), updatedAt: ago(6 * DAY),
    }),
    task({
      id: 'task_px6', projectId: PIXEL, parentId: 'task_px1', title: 'Highscore-Liste im Browser speichern', kind: 'code', role: 'coder', status: 'queued', priority: 0,
      description: 'Die besten 10 Ergebnisse im localStorage speichern und im Menü anzeigen.',
      createdAt: ago(6 * DAY), updatedAt: ago(6 * DAY),
    }),
    task({
      id: 'task_px7', projectId: PIXEL, title: 'Kollision an Plattformkanten korrigieren', kind: 'fix', role: 'tester', status: 'failed',
      description: 'Der Spieler fällt an der rechten Kante der mittleren Plattform durch den Boden.',
      blocker: 'Nach 3 Versuchen schlagen weiterhin 2 Tests fehl (tests/player.test.ts).',
      verification: {
        status: 'failed',
        checks: [{ name: 'Tests', status: 'failed', details: '2 von 24 Tests fehlgeschlagen', checkRunId: 'crun_px_t2' }],
      },
      files: ['src/game/physics.ts'], model: 'ollama/qwen2.5-coder:14b', attempts: 3, priority: 2, source: 'system',
      createdAt: ago(2 * HOUR), updatedAt: ago(25 * MIN), startedAt: ago(70 * MIN), finishedAt: ago(25 * MIN),
    }),
    task({
      id: 'task_px8', projectId: PIXEL, title: 'Code-Prüfung: Grundgerüst', kind: 'review', role: 'reviewer', status: 'done',
      result: 'Keine Probleme gefunden. Hinweis: Asset-Pfade später zentral ablegen.',
      verification: { status: 'passed', checks: [{ name: 'Review', status: 'passed', details: null, checkRunId: null }] },
      model: 'ollama/qwen2.5-coder:14b', attempts: 1, source: 'system',
      createdAt: ago(5 * DAY), updatedAt: ago(5 * DAY - 6 * MIN), startedAt: ago(5 * DAY), finishedAt: ago(5 * DAY - 6 * MIN),
    }),
    task({
      id: 'task_px9', projectId: PIXEL, title: 'Soundeffekte mit Howler.js einbinden', kind: 'code', role: 'coder', status: 'cancelled', priority: 0, source: 'user',
      description: 'Sprung- und Münzgeräusche abspielen.', result: 'Vom Benutzer gestoppt – Phaser bringt eigene Audio-Funktionen mit.',
      createdAt: ago(4 * DAY), updatedAt: ago(4 * DAY - HOUR), startedAt: ago(4 * DAY), finishedAt: ago(4 * DAY - HOUR),
    }),
    // --- Rezept-API
    task({
      id: 'task_rz1', projectId: REZEPT, title: 'API-Plan erstellen', kind: 'plan', role: 'planner', status: 'done',
      result: 'Plan mit 6 Aufgaben erstellt (Rezepte, Suche, Einkaufszettel, Tests, Aufräumen, Doku).',
      verification: noChecks, source: 'system', model: 'ollama/qwen2.5-coder:14b', attempts: 1,
      createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY - 3 * MIN), startedAt: ago(3 * DAY), finishedAt: ago(3 * DAY - 3 * MIN),
    }),
    task({
      id: 'task_rz2', projectId: REZEPT, parentId: 'task_rz1', title: 'Endpunkte für Rezepte (anlegen, lesen, suchen)', kind: 'code', role: 'coder', status: 'done',
      result: 'GET/POST /api/recipes umgesetzt, Suche über den Titel.',
      verification: {
        status: 'passed',
        checks: [
          { name: 'Tests', status: 'passed', details: '41 von 41 Tests bestanden', checkRunId: 'crun_rz_t1' },
          { name: 'Build', status: 'passed', details: null, checkRunId: 'crun_rz_b1' },
        ],
      },
      files: ['src/server.ts', 'src/routes/recipes.ts'], model: 'ollama/qwen2.5-coder:14b', attempts: 1,
      createdAt: ago(3 * DAY), updatedAt: ago(80 * MIN), startedAt: ago(2 * HOUR), finishedAt: ago(80 * MIN),
    }),
    task({
      id: 'task_rz3', projectId: REZEPT, parentId: 'task_rz1', title: 'Tests für die Suche schreiben und ausführen', kind: 'test', role: 'tester', status: 'running',
      description: 'Suche nach Titel, leere Suche und Sonderzeichen testen.',
      dependsOn: ['task_rz2'], files: ['tests/search.test.ts'], model: 'ollama/llama3.1:8b', attempts: 1,
      createdAt: ago(3 * DAY), updatedAt: ago(30_000), startedAt: ago(3 * MIN),
    }),
    task({
      id: 'task_rz4', projectId: REZEPT, parentId: 'task_rz1', title: 'Datenbank-Migration für den Einkaufszettel', kind: 'code', role: 'coder', status: 'blocked',
      description: 'Tabelle shopping_items anlegen und mit Rezepten verknüpfen.',
      blocker: 'Gleicher Fehler zweimal hintereinander: Die Tabelle „shopping_items“ existiert in der Testdatenbank bereits in einer alten Form. Es wird eine Entscheidung gebraucht, ob die Testdatenbank zurückgesetzt werden darf.',
      files: ['src/db/migrations/004_shopping.ts'], model: 'ollama/qwen2.5-coder:14b', attempts: 2, priority: 2,
      createdAt: ago(3 * DAY), updatedAt: ago(35 * MIN), startedAt: ago(55 * MIN),
    }),
    task({
      id: 'task_rz5', projectId: REZEPT, parentId: 'task_rz1', title: 'Altes Verzeichnis legacy/ entfernen', kind: 'code', role: 'coder', status: 'waiting_approval',
      description: 'Die alte JavaScript-Version wird nicht mehr gebraucht. Importe prüfen und den Ordner entfernen.',
      blocker: 'Wartet auf Freigabe: Ordner legacy/ löschen (12 Dateien).', model: 'ollama/qwen2.5-coder:14b', attempts: 1, priority: 0,
      createdAt: ago(3 * DAY), updatedAt: ago(9 * MIN), startedAt: ago(12 * MIN),
    }),
    task({
      id: 'task_rz6', projectId: REZEPT, title: 'Einkaufszettel als PDF exportieren', kind: 'code', role: 'coder', status: 'paused', source: 'user',
      description: 'Endpunkt GET /api/shopping-list.pdf, der den Einkaufszettel als druckbares PDF liefert.',
      model: 'ollama/qwen2.5-coder:14b', attempts: 1, createdAt: ago(1 * DAY), updatedAt: ago(40 * MIN), startedAt: ago(50 * MIN),
    }),
    task({
      id: 'task_rz7', projectId: REZEPT, parentId: 'task_rz1', title: 'README mit Startanleitung schreiben', kind: 'custom', role: 'coder', status: 'queued', priority: 0,
      createdAt: ago(3 * DAY), updatedAt: ago(3 * DAY),
    }),
    // --- Aetherfall
    task({
      id: 'task_ae1', projectId: AETHER, title: 'Portal zwischen Dorf und Gruft verbinden', kind: 'code', role: 'coder', status: 'interrupted', priority: 2, source: 'user',
      description: 'Portal im Dorf Eichental lädt die Gruft über die Welt-ID; Lebenspunkte werden mitgenommen.',
      blocker: 'Der Hintergrunddienst wurde während der Arbeit beendet. Die Aufgabe kann sicher fortgesetzt werden.',
      files: ['Assets/_Project/Scripts/World/Portal.cs'], model: 'ollama/qwen2.5-coder:14b', attempts: 1,
      createdAt: ago(2 * DAY), updatedAt: ago(26 * HOUR), startedAt: ago(27 * HOUR),
    }),
    task({
      id: 'task_ae2', projectId: AETHER, title: 'EditMode-Tests für das Speichersystem', kind: 'test', role: 'tester', status: 'done',
      result: '12 neue Tests für Speichern, Laden und Migration. Alle bestanden.',
      verification: { status: 'passed', checks: [{ name: 'Tests', status: 'passed', details: '2159 bestanden, 2 übersprungen', checkRunId: 'crun_ae_t1' }] },
      files: ['Assets/_Project/Scripts/SaveSystem/SaveManager.cs'], model: 'ollama/qwen2.5-coder:14b', attempts: 1,
      createdAt: ago(3 * DAY), updatedAt: ago(28 * HOUR), startedAt: ago(29 * HOUR), finishedAt: ago(28 * HOUR),
    }),
    task({
      id: 'task_ae3', projectId: AETHER, title: 'Bossbalken im HUD anzeigen', kind: 'code', role: 'coder', status: 'queued', priority: 2, source: 'user',
      acceptance: 'Beim Kampf gegen den Wachenden Ritter erscheint oben ein Lebensbalken mit Namen.',
      createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY),
    }),
    task({
      id: 'task_ae4', projectId: AETHER, title: 'Wolf-Rudelverhalten verbessern', kind: 'code', role: 'coder', status: 'paused', source: 'user',
      description: 'Wölfe sollen sich beim Angriff verteilen und nicht alle gleichzeitig zuschlagen.',
      attempts: 1, createdAt: ago(2 * DAY), updatedAt: ago(30 * HOUR), startedAt: ago(31 * HOUR),
    }),
  ];

  const run = (r: Partial<AgentRun> & Pick<AgentRun, 'id' | 'taskId' | 'projectId' | 'role' | 'status' | 'startedAt'>): AgentRun => ({
    providerId: OLLAMA,
    modelId: 'qwen2.5-coder:14b',
    stepCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    lastAction: null,
    blocker: null,
    files: [],
    pendingApprovalId: null,
    error: null,
    updatedAt: r.startedAt,
    endedAt: null,
    ...r,
  });

  const runs: AgentRun[] = [
    run({
      id: 'run_px3', taskId: 'task_px3', projectId: PIXEL, role: 'coder', status: 'running', startedAt: ago(6 * MIN), updatedAt: ago(20_000),
      stepCount: 14, inputTokens: 18_420, outputTokens: 3_210, lastAction: 'Schreibt src/game/player.ts', files: ['src/game/player.ts', 'src/scenes/GameScene.ts'],
    }),
    run({
      id: 'run_rz3', taskId: 'task_rz3', projectId: REZEPT, role: 'tester', status: 'running', startedAt: ago(3 * MIN), updatedAt: ago(15_000),
      modelId: 'llama3.1:8b', stepCount: 8, inputTokens: 9_870, outputTokens: 1_460, lastAction: 'Führt „npm test -- search“ aus', files: ['tests/search.test.ts'],
    }),
    run({
      id: 'run_px4', taskId: 'task_px4', projectId: PIXEL, role: 'tester', status: 'waiting_approval', startedAt: ago(4 * MIN), updatedAt: ago(2 * MIN),
      modelId: 'llama3.1:8b', stepCount: 5, inputTokens: 4_310, outputTokens: 620, lastAction: 'Wartet auf Freigabe: npx playwright install chromium',
      pendingApprovalId: 'apr_px_cmd',
    }),
    run({
      id: 'run_rz5', taskId: 'task_rz5', projectId: REZEPT, role: 'coder', status: 'waiting_approval', startedAt: ago(12 * MIN), updatedAt: ago(9 * MIN),
      stepCount: 6, inputTokens: 5_120, outputTokens: 540, lastAction: 'Wartet auf Freigabe: legacy/ löschen', pendingApprovalId: 'apr_rz_del',
    }),
    run({
      id: 'run_rz6', taskId: 'task_rz6', projectId: REZEPT, role: 'coder', status: 'paused', startedAt: ago(50 * MIN), updatedAt: ago(40 * MIN),
      stepCount: 9, inputTokens: 11_200, outputTokens: 2_050, lastAction: 'Pausiert nach: Paket pdfkit geprüft', files: ['src/routes/shopping.ts'],
    }),
    run({
      id: 'run_rz4', taskId: 'task_rz4', projectId: REZEPT, role: 'coder', status: 'blocked', startedAt: ago(55 * MIN), updatedAt: ago(35 * MIN), endedAt: ago(35 * MIN),
      stepCount: 21, inputTokens: 26_400, outputTokens: 4_900, lastAction: 'Migration zweimal mit gleichem Fehler abgebrochen',
      blocker: 'Testdatenbank enthält eine alte Tabelle „shopping_items“.', files: ['src/db/migrations/004_shopping.ts'],
    }),
    run({
      id: 'run_px7', taskId: 'task_px7', projectId: PIXEL, role: 'tester', status: 'failed', startedAt: ago(70 * MIN), updatedAt: ago(25 * MIN), endedAt: ago(25 * MIN),
      stepCount: 32, inputTokens: 41_800, outputTokens: 7_300, lastAction: 'Tests ausgeführt: 2 fehlgeschlagen', files: ['src/game/physics.ts'],
      error: 'Gleicher Testfehler nach 3 Versuchen.',
    }),
    run({
      id: 'run_px2', taskId: 'task_px2', projectId: PIXEL, role: 'coder', status: 'done', startedAt: ago(5 * DAY + 40 * MIN), updatedAt: ago(5 * DAY), endedAt: ago(5 * DAY),
      stepCount: 27, inputTokens: 35_100, outputTokens: 9_800, lastAction: 'Aufgabe abgeschlossen', files: ['package.json', 'index.html', 'vite.config.ts', 'src/main.ts', 'src/scenes/MenuScene.ts'],
    }),
    run({
      id: 'run_px8', taskId: 'task_px8', projectId: PIXEL, role: 'reviewer', status: 'done', startedAt: ago(5 * DAY), updatedAt: ago(5 * DAY - 6 * MIN), endedAt: ago(5 * DAY - 6 * MIN),
      stepCount: 6, inputTokens: 12_900, outputTokens: 880, lastAction: 'Prüfung abgeschlossen: keine Probleme',
    }),
    run({
      id: 'run_ae1', taskId: 'task_ae1', projectId: AETHER, role: 'coder', status: 'interrupted', startedAt: ago(27 * HOUR), updatedAt: ago(26 * HOUR), endedAt: ago(26 * HOUR),
      stepCount: 11, inputTokens: 14_700, outputTokens: 2_300, lastAction: 'Liest Assets/_Project/Scripts/World/Portal.cs', files: ['Assets/_Project/Scripts/World/Portal.cs'],
    }),
    run({
      id: 'run_rz2', taskId: 'task_rz2', projectId: REZEPT, role: 'coder', status: 'done', startedAt: ago(2 * HOUR), updatedAt: ago(80 * MIN), endedAt: ago(80 * MIN),
      stepCount: 19, inputTokens: 22_000, outputTokens: 5_400, lastAction: 'Aufgabe abgeschlossen', files: ['src/server.ts', 'src/routes/recipes.ts'],
    }),
    run({
      id: 'run_px1', taskId: 'task_px1', projectId: PIXEL, role: 'planner', status: 'done', startedAt: ago(6 * DAY), updatedAt: ago(6 * DAY - 4 * MIN), endedAt: ago(6 * DAY - 4 * MIN),
      stepCount: 4, inputTokens: 3_900, outputTokens: 2_100, lastAction: '9 Aufgaben angelegt',
    }),
  ];

  let stepId = 1;
  const steps: AgentStep[] = [];
  const addSteps = (r: AgentRun, items: Array<[AgentStep['kind'], string, unknown?]>, spanMs: number) => {
    const startTs = r.startedAt;
    items.forEach(([kind, summary, data], i) => {
      steps.push({
        id: stepId++,
        runId: r.id,
        taskId: r.taskId,
        projectId: r.projectId,
        ts: startTs + Math.round((spanMs * (i + 1)) / (items.length + 1)),
        kind,
        summary,
        data: data ?? null,
      });
    });
  };
  const runById = (id: string) => runs.find((r) => r.id === id)!;

  addSteps(
    runById('run_px3'),
    [
      ['status', 'Aufgabe übernommen: Spielerbewegung mit Tastatur und Sprung'],
      ['thought', 'Plan: Player-Klasse mit Bewegung, Sprung und Gnadenzeit; danach Tests ergänzen.'],
      ['tool_call', 'Liest src/scenes/GameScene.ts', { tool: 'read_file', path: 'src/scenes/GameScene.ts' }],
      ['tool_result', 'Datei gelesen (24 Zeilen)'],
      ['tool_call', 'Liest src/game/physics.ts', { tool: 'read_file', path: 'src/game/physics.ts' }],
      ['tool_result', 'Datei gelesen (11 Zeilen)'],
      ['model_call', 'Modell erzeugt die Player-Klasse', { model: 'qwen2.5-coder:14b', inputTokens: 6120, outputTokens: 1480 }],
      ['tool_call', 'Schreibt src/game/player.ts', { tool: 'write_file', path: 'src/game/player.ts', bytes: 1420 }],
      ['tool_result', 'Datei geschrieben (+38 Zeilen)'],
      ['tool_call', 'Ändert src/scenes/GameScene.ts', { tool: 'edit_file', path: 'src/scenes/GameScene.ts' }],
      ['tool_result', 'Änderung übernommen (+4 −2 Zeilen)'],
      ['tool_call', 'Führt „npm test“ aus', { tool: 'run_command', command: 'npm test' }],
      ['tool_result', '22 von 22 Tests bestanden (8,4 Sek.)'],
      ['tool_call', 'Schreibt src/game/player.ts', { tool: 'write_file', path: 'src/game/player.ts' }],
    ],
    6 * MIN - 20_000,
  );
  addSteps(
    runById('run_rz3'),
    [
      ['status', 'Aufgabe übernommen: Tests für die Suche'],
      ['tool_call', 'Liest src/routes/recipes.ts', { tool: 'read_file', path: 'src/routes/recipes.ts' }],
      ['tool_result', 'Datei gelesen (21 Zeilen)'],
      ['model_call', 'Modell entwirft drei Testfälle', { model: 'llama3.1:8b', inputTokens: 3900, outputTokens: 760 }],
      ['tool_call', 'Schreibt tests/search.test.ts', { tool: 'write_file', path: 'tests/search.test.ts' }],
      ['tool_result', 'Datei geschrieben (+14 Zeilen)'],
      ['tool_call', 'Führt „npm test -- search“ aus', { tool: 'run_command', command: 'npm test -- search' }],
      ['status', 'Wartet auf das Testergebnis …'],
    ],
    3 * MIN - 15_000,
  );
  addSteps(
    runById('run_px4'),
    [
      ['status', 'Aufgabe übernommen: End-to-End-Test für das Hauptmenü'],
      ['thought', 'Für Oberflächentests wird ein Playwright-Browser benötigt.'],
      ['tool_call', 'Prüft, ob Playwright installiert ist', { tool: 'run_command', command: 'npx playwright --version' }],
      ['tool_result', 'Playwright 1.48 gefunden, aber kein Browser installiert'],
      ['approval', 'Freigabe angefragt: npx playwright install chromium', { approvalId: 'apr_px_cmd' }],
    ],
    2 * MIN,
  );
  addSteps(
    runById('run_rz5'),
    [
      ['status', 'Aufgabe übernommen: Altes Verzeichnis legacy/ entfernen'],
      ['tool_call', 'Sucht nach Importen aus legacy/', { tool: 'search', query: "from '../legacy" }],
      ['tool_result', 'Keine Verwendung gefunden'],
      ['approval', 'Freigabe angefragt: Ordner legacy/ löschen', { approvalId: 'apr_rz_del' }],
    ],
    3 * MIN,
  );
  addSteps(
    runById('run_rz4'),
    [
      ['status', 'Aufgabe übernommen: Datenbank-Migration für den Einkaufszettel'],
      ['tool_call', 'Schreibt src/db/migrations/004_shopping.ts', { tool: 'write_file' }],
      ['tool_call', 'Führt „npm run db:migrate“ aus', { tool: 'run_command', command: 'npm run db:migrate' }],
      ['error', 'Migration fehlgeschlagen: NOT NULL constraint failed: shopping_items.recipe_id', { exitCode: 1 }],
      ['thought', 'Strategie wechseln: Tabelle nur anlegen, wenn sie noch nicht existiert.'],
      ['tool_call', 'Führt „npm run db:migrate“ erneut aus', { tool: 'run_command', command: 'npm run db:migrate' }],
      ['error', 'Gleicher Fehler wie zuvor – Aufgabe wird blockiert', { exitCode: 1 }],
    ],
    20 * MIN,
  );
  addSteps(
    runById('run_px7'),
    [
      ['status', 'Aufgabe übernommen: Kollision an Plattformkanten korrigieren'],
      ['tool_call', 'Ändert src/game/physics.ts (Versuch 1)', { tool: 'edit_file' }],
      ['tool_result', 'Tests: 2 fehlgeschlagen'],
      ['tool_call', 'Ändert src/game/physics.ts (Versuch 2)', { tool: 'edit_file' }],
      ['tool_result', 'Tests: 2 fehlgeschlagen'],
      ['tool_call', 'Ändert src/game/physics.ts (Versuch 3)', { tool: 'edit_file' }],
      ['error', 'Gleicher Testfehler nach 3 Versuchen – Aufgabe fehlgeschlagen'],
    ],
    45 * MIN,
  );
  addSteps(
    runById('run_rz6'),
    [
      ['status', 'Aufgabe übernommen: Einkaufszettel als PDF exportieren'],
      ['tool_call', 'Prüft das Paket pdfkit', { tool: 'run_command', command: 'npm view pdfkit version' }],
      ['status', 'Vom Benutzer pausiert'],
    ],
    10 * MIN,
  );
  for (const id of ['run_px2', 'run_px8', 'run_ae1', 'run_rz2', 'run_px1']) {
    const r = runById(id);
    addSteps(
      r,
      [
        ['status', 'Aufgabe übernommen'],
        ['model_call', 'Modellaufruf', { model: r.modelId }],
        [r.status === 'interrupted' ? 'error' : 'status', r.lastAction ?? 'Fertig'],
      ],
      (r.endedAt ?? now) - r.startedAt,
    );
  }

  const approvals: Approval[] = [
    {
      id: 'apr_px_cmd',
      projectId: PIXEL,
      taskId: 'task_px4',
      runId: 'run_px4',
      kind: 'command',
      fingerprint: 'command:prj_pixel:npx playwright install chromium',
      title: 'Playwright-Browser installieren',
      action: 'Befehl im Projektordner ausführen:\nnpx playwright install chromium',
      consequences:
        'Lädt den Chromium-Browser für automatische Oberflächentests herunter (ca. 150 MB) und legt ihn im Benutzerordner ab. Am System wird sonst nichts verändert.',
      details: { command: 'npx playwright install chromium', cwd: projects[0].path },
      status: 'pending',
      scope: null,
      createdAt: ago(2 * MIN),
      decidedAt: null,
    },
    {
      id: 'apr_rz_del',
      projectId: REZEPT,
      taskId: 'task_rz5',
      runId: 'run_rz5',
      kind: 'delete',
      fingerprint: 'delete:prj_rezept:legacy/',
      title: 'Ordner legacy/ löschen',
      action: 'Ordner im Projekt löschen:\nlegacy/  (12 Dateien, 48 KB)',
      consequences:
        'Die Dateien werden aus dem Projekt entfernt. Vorher legt NOVA einen Wiederherstellungspunkt an, die Löschung lässt sich also rückgängig machen. Dateien außerhalb des Projekts sind nicht betroffen.',
      details: { paths: ['legacy/'], fileCount: 12 },
      status: 'pending',
      scope: null,
      createdAt: ago(9 * MIN),
      decidedAt: null,
    },
    {
      id: 'apr_h1',
      projectId: REZEPT,
      taskId: 'task_rz2',
      runId: 'run_rz2',
      kind: 'command',
      fingerprint: 'command:prj_rezept:npm run db:migrate',
      title: 'Datenbank-Migration ausführen',
      action: 'Befehl im Projektordner ausführen:\nnpm run db:migrate',
      consequences: 'Ändert die Struktur der lokalen Projektdatenbank in data/.',
      details: { command: 'npm run db:migrate' },
      status: 'approved',
      scope: 'always',
      createdAt: ago(2 * DAY + 10 * MIN),
      decidedAt: ago(2 * DAY),
    },
    {
      id: 'apr_h2',
      projectId: PIXEL,
      taskId: 'task_px2',
      runId: 'run_px2',
      kind: 'network',
      fingerprint: 'network:*:cdn.jsdelivr.net',
      title: 'Zugriff auf cdn.jsdelivr.net',
      action: 'Internetadresse abrufen:\nhttps://cdn.jsdelivr.net/npm/phaser@3.80.1/types/phaser.d.ts',
      consequences: 'Lädt Typdefinitionen von Phaser herunter. Es werden keine Projektdaten gesendet.',
      details: { host: 'cdn.jsdelivr.net' },
      status: 'approved',
      scope: 'always',
      createdAt: ago(5 * DAY + 30 * MIN),
      decidedAt: ago(5 * DAY + 28 * MIN),
    },
    {
      id: 'apr_h3',
      projectId: PIXEL,
      taskId: 'task_px2',
      runId: 'run_px2',
      kind: 'publish',
      fingerprint: 'publish:prj_pixel:git push origin main',
      title: 'Änderungen hochladen (git push)',
      action: 'Befehl ausführen:\ngit push origin main',
      consequences: 'Überträgt die lokalen Commits an das entfernte Repository. Andere mit Zugriff sehen danach den Code.',
      details: { command: 'git push origin main' },
      status: 'denied',
      scope: 'once',
      createdAt: ago(5 * DAY + 5 * MIN),
      decidedAt: ago(5 * DAY + 2 * MIN),
    },
    {
      id: 'apr_h4',
      projectId: AETHER,
      taskId: 'task_ae1',
      runId: 'run_ae1',
      kind: 'paid_model',
      fingerprint: 'paid_model:prj_aether:prov_openrouter/qwen/qwen3-coder',
      title: 'Kostenpflichtiges Modell verwenden',
      action: 'Modell nutzen:\nQwen3 Coder über OpenRouter (geschätzt 0,22 $ / 0,95 $ je 1 Mio. Tokens)',
      consequences: 'Es entstehen Kosten auf dem OpenRouter-Konto. Projektinhalte werden an den Anbieter gesendet.',
      details: { providerId: OPENROUTER, modelId: 'qwen/qwen3-coder' },
      status: 'expired',
      scope: null,
      createdAt: ago(28 * HOUR),
      decidedAt: ago(26 * HOUR),
    },
    {
      id: 'apr_h5',
      projectId: AETHER,
      taskId: 'task_ae2',
      runId: null,
      kind: 'command',
      fingerprint: 'command:prj_aether:Unity.exe -batchmode -runTests',
      title: 'Unity-Tests im Hintergrund ausführen',
      action: 'Befehl im Projektordner ausführen:\nUnity.exe -batchmode -projectPath . -runTests -testPlatform EditMode',
      consequences: 'Startet Unity ohne Fenster und führt die EditMode-Tests aus (dauert einige Minuten).',
      details: {},
      status: 'approved',
      scope: 'once',
      createdAt: ago(29 * HOUR + 5 * MIN),
      decidedAt: ago(29 * HOUR),
    },
  ];

  const rules: ApprovalRule[] = [
    {
      id: 'rule_1',
      projectId: REZEPT,
      kind: 'command',
      fingerprint: 'command:prj_rezept:npm run db:migrate',
      description: 'Befehl „npm run db:migrate“ im Projekt Rezept-API',
      createdAt: ago(2 * DAY),
    },
    {
      id: 'rule_2',
      projectId: null,
      kind: 'network',
      fingerprint: 'network:*:cdn.jsdelivr.net',
      description: 'Zugriff auf cdn.jsdelivr.net (alle Projekte)',
      createdAt: ago(5 * DAY + 28 * MIN),
    },
  ];

  const providers: ProviderConfig[] = [
    {
      id: OLLAMA, type: 'ollama', name: 'Ollama (lokal)', baseUrl: 'http://127.0.0.1:11434', enabled: true, paid: false, approved: true,
      hasApiKey: false, options: {}, createdAt: ago(21 * DAY), updatedAt: ago(21 * DAY),
    },
    {
      id: OPENROUTER, type: 'openai_compatible', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', enabled: true, paid: true, approved: false,
      hasApiKey: true, options: {}, createdAt: ago(10 * DAY), updatedAt: ago(26 * HOUR),
    },
  ];

  const providerHealth: ProviderHealth[] = [
    { providerId: OLLAMA, status: 'ok', message: 'Ollama läuft (Version 0.12.6).', version: '0.12.6', checkedAt: ago(20_000), latencyMs: 4 },
    {
      providerId: OPENROUTER, status: 'ok', message: 'Erreichbar. Die kostenpflichtige Nutzung ist noch nicht freigegeben.', version: null,
      checkedAt: ago(3 * MIN), latencyMs: 182,
    },
  ];

  const models: ModelInfo[] = [
    {
      providerId: OLLAMA, id: 'qwen2.5-coder:14b', displayName: 'Qwen2.5 Coder 14B', local: true, paid: false, sizeBytes: 9_001_683_200,
      parameterSize: '14.8B', quantization: 'Q4_K_M', family: 'qwen2', contextLength: 32_768, capabilities: ['completion', 'tools', 'insert'],
      pricing: null, modifiedAt: ago(12 * DAY),
    },
    {
      providerId: OLLAMA, id: 'llama3.1:8b', displayName: 'Llama 3.1 8B', local: true, paid: false, sizeBytes: 4_920_753_328,
      parameterSize: '8.0B', quantization: 'Q4_K_M', family: 'llama', contextLength: 131_072, capabilities: ['completion', 'tools'],
      pricing: null, modifiedAt: ago(15 * DAY),
    },
    {
      providerId: OLLAMA, id: 'nomic-embed-text:latest', displayName: 'Nomic Embed Text', local: true, paid: false, sizeBytes: 274_302_450,
      parameterSize: '137M', quantization: 'F16', family: 'nomic-bert', contextLength: 2_048, capabilities: ['embedding'],
      pricing: null, modifiedAt: ago(15 * DAY),
    },
    {
      providerId: OPENROUTER, id: 'qwen/qwen3-coder', displayName: 'Qwen3 Coder', local: false, paid: true, sizeBytes: null,
      parameterSize: null, quantization: null, family: 'qwen3', contextLength: 262_144, capabilities: ['completion', 'tools'],
      pricing: { inputPerMTokUsd: 0.22, outputPerMTokUsd: 0.95, estimated: true }, modifiedAt: null,
    },
    {
      providerId: OPENROUTER, id: 'deepseek/deepseek-chat-v3.1', displayName: 'DeepSeek Chat V3.1', local: false, paid: true, sizeBytes: null,
      parameterSize: null, quantization: null, family: 'deepseek', contextLength: 163_840, capabilities: ['completion', 'tools'],
      pricing: null, modifiedAt: null,
    },
  ];

  const ollamaRunning: OllamaRunningModel[] = [
    { model: 'qwen2.5-coder:14b', sizeBytes: 10_522_394_624, vramBytes: 10_522_394_624, expiresAt: new Date(now + 4 * MIN).toISOString(), contextLength: 16_384 },
    { model: 'llama3.1:8b', sizeBytes: 6_012_954_214, vramBytes: 4_617_089_843, expiresAt: new Date(now + 3 * MIN).toISOString(), contextLength: 16_384 },
  ];

  const usage: UsageRecord[] = [];
  const usageRow = (i: number, ts: number, providerId: string, modelId: string, projectId: string, taskId: string, runId: string | null, inT: number, outT: number, durationMs: number, costUsd: number, paid: boolean): UsageRecord => ({
    id: `use_${i}`, ts, providerId, modelId, projectId, taskId, runId, inputTokens: inT, outputTokens: outT, durationMs, costUsd, costEstimated: paid, paid,
  });
  let ui = 1;
  // Local calls today.
  for (let i = 0; i < 18; i++) {
    const r = runs[i % 4];
    usage.push(
      usageRow(ui++, ago((i + 1) * 7 * MIN), OLLAMA, r.modelId ?? 'qwen2.5-coder:14b', r.projectId, r.taskId, r.id, 6_000 + ((i * 1_731) % 9_000), 900 + ((i * 377) % 1_600), 18_000 + ((i * 4_100) % 40_000), 0, false),
    );
  }
  // Paid calls from two days ago (provider approval was withdrawn afterwards).
  usage.push(usageRow(ui++, ago(2 * DAY + 3 * HOUR), OPENROUTER, 'qwen/qwen3-coder', PIXEL, 'task_px2', 'run_px2', 1_210_000, 230_000, 412_000, 0.48, true));
  usage.push(usageRow(ui++, ago(2 * DAY + 2 * HOUR), OPENROUTER, 'qwen/qwen3-coder', PIXEL, 'task_px2', 'run_px2', 1_640_000, 410_000, 530_000, 0.75, true));
  usage.push(usageRow(ui++, ago(2 * DAY + HOUR), OPENROUTER, 'qwen/qwen3-coder', PIXEL, 'task_px8', 'run_px8', 410_000, 52_000, 98_000, 0.14, true));

  const resources: ResourceSnapshot = {
    ts: now,
    cpu: { percent: 34, cores: 16, model: 'AMD Ryzen 7 5800X 8-Core Processor' },
    memory: { totalBytes: 32 * GB, usedBytes: 19.8 * GB, freeBytes: 12.2 * GB },
    disks: [
      { path: 'C:\\', totalBytes: 931.5 * GB, freeBytes: 412.3 * GB },
      { path: 'D:\\', totalBytes: 1863 * GB, freeBytes: 1290 * GB },
    ],
    gpus: [
      {
        name: 'NVIDIA GeForce RTX 4080',
        vendor: 'nvidia',
        utilPercent: 63,
        vramTotalBytes: 16 * GB,
        vramUsedBytes: 14.6 * GB,
        source: 'nvidia-smi',
        estimated: false,
      },
    ],
    gpuNote: null,
    ollamaLoaded: ollamaRunning,
    daemon: { rssBytes: 182 * MB, cpuPercent: 1.8 },
    childProcesses: 3,
  };
  const resourceHistory: ResourceSnapshot[] = [];
  for (let i = 30; i >= 1; i--) {
    const wobble = Math.sin(i / 3) * 8;
    resourceHistory.push({
      ...resources,
      ts: now - i * 20_000,
      cpu: { ...resources.cpu, percent: Math.round(32 + wobble) },
      memory: { ...resources.memory, usedBytes: resources.memory.usedBytes + wobble * 50 * MB, freeBytes: resources.memory.freeBytes - wobble * 50 * MB },
    });
  }

  const errors: NovaErrorInfo[] = [
    {
      id: 'err_px_repeat',
      code: 'REPEATED_FAILURE',
      severity: 'blocker',
      title: 'Gleicher Testfehler nach 3 Versuchen',
      whatHappened:
        'Die Aufgabe „Kollision an Plattformkanten korrigieren“ wurde dreimal geändert, aber dieselben 2 Tests schlagen weiter fehl. Der Spieler fällt an der rechten Plattformkante weiterhin durch den Boden.',
      projectId: PIXEL,
      taskId: 'task_px7',
      attempted: [
        'Kollisionsabfrage auf die Grenzen der Hitbox umgestellt',
        'Feste Zeitschritte für die Physik eingeschaltet',
        'Plattform-Hitboxen um 1 Pixel vergrößert',
      ],
      projectSafe: true,
      autoFixable: false,
      userAction:
        'Die Aufgabe genauer beschreiben (z. B. „Spieler bleibt an Kanten stehen und rutscht nicht durch“) und dann „Wiederholen“ wählen – oder die Aufgabe einem stärkeren Modell zuweisen.',
      details:
        'FAIL tests/player.test.ts > Spieler > bleibt an der rechten Plattformkante stehen\nAssertionError: expected 412 to be less than or equal to 400\n ❯ tests/player.test.ts:48:31\n\nFAIL tests/player.test.ts > Spieler > Sprung von der Kante\n ❯ tests/player.test.ts:63:5',
      createdAt: ago(25 * MIN),
      resolvedAt: null,
    },
    {
      id: 'err_rz_migration',
      code: 'COMMAND_FAILED',
      severity: 'blocker',
      title: 'Datenbank-Migration schlägt fehl',
      whatHappened:
        'Die Migration für den Einkaufszettel bricht zweimal mit demselben Fehler ab. Die Tabelle „shopping_items“ existiert in der Testdatenbank bereits in einer alten Form.',
      projectId: REZEPT,
      taskId: 'task_rz4',
      attempted: ['Migration erneut ausgeführt', 'Migration mit „IF NOT EXISTS“ umgeschrieben'],
      projectSafe: true,
      autoFixable: false,
      userAction: 'Entscheiden, ob die Testdatenbank „data/test.sqlite“ zurückgesetzt werden darf. Echte Daten sind davon nicht betroffen.',
      details:
        'SqliteError: NOT NULL constraint failed: shopping_items.recipe_id\n    at Migration.up (src/db/migrations/004_shopping.ts:17:9)\n    at runMigrations (src/db/migrate.ts:22:5)',
      createdAt: ago(35 * MIN),
      resolvedAt: null,
    },
    {
      id: 'err_vram',
      code: 'RESOURCE_LIMIT',
      severity: 'warning',
      title: 'Weniger parallele Agenten wegen Grafikspeicher',
      whatHappened: 'Der Grafikspeicher ist zu 91 % belegt. NOVA startet deshalb vorübergehend höchstens 2 statt 3 Agenten gleichzeitig.',
      projectId: null,
      taskId: null,
      attempted: ['Parallelität automatisch von 3 auf 2 gesenkt'],
      projectSafe: true,
      autoFixable: true,
      userAction: null,
      details: 'VRAM 14,6 GB von 16,0 GB belegt (Quelle: nvidia-smi)',
      createdAt: ago(14 * MIN),
      resolvedAt: null,
    },
    {
      id: 'err_ae_interrupted',
      code: 'INTERRUPTED',
      severity: 'retryable',
      title: 'Aufgabe wurde unterbrochen',
      whatHappened: 'Der Hintergrunddienst wurde beendet, während an „Portal zwischen Dorf und Gruft verbinden“ gearbeitet wurde.',
      projectId: AETHER,
      taskId: 'task_ae1',
      attempted: ['Zustand der Aufgabe gesichert', 'Geänderte Dateien geprüft – alle vollständig geschrieben'],
      projectSafe: true,
      autoFixable: true,
      userAction: 'Die Arbeit am Projekt ist ausgeschaltet. Zum Fortsetzen die Arbeit für Aetherfall wieder einschalten.',
      details: 'Recovery: run_ae1 status=interrupted, last step 11, no partial writes detected',
      createdAt: ago(26 * HOUR),
      resolvedAt: null,
    },
    {
      id: 'err_ollama_old',
      code: 'OLLAMA_UNREACHABLE',
      severity: 'retryable',
      title: 'Ollama war kurz nicht erreichbar',
      whatHappened: 'Ollama hat 20 Sekunden lang nicht geantwortet. NOVA hat gewartet und es erneut versucht.',
      projectId: null,
      taskId: null,
      attempted: ['3 Wiederholungen im Abstand von 5 Sekunden'],
      projectSafe: true,
      autoFixable: true,
      userAction: null,
      details: 'connect ECONNREFUSED 127.0.0.1:11434',
      createdAt: ago(2 * HOUR),
      resolvedAt: ago(2 * HOUR - MIN),
    },
  ];

  const mem = (m: Partial<MemoryEntry> & Pick<MemoryEntry, 'id' | 'projectId' | 'kind' | 'title' | 'content'>): MemoryEntry => ({
    tags: [],
    source: 'agent',
    shareable: false,
    taskId: null,
    createdAt: ago(3 * DAY),
    updatedAt: ago(3 * DAY),
    ...m,
  });
  const memory: MemoryEntry[] = [
    mem({ id: 'mem_1', projectId: PIXEL, kind: 'goal', title: 'Spielziel', content: 'Drei Level mit steigender Schwierigkeit, am Ende ein Schatz. Spielzeit etwa 10 Minuten.', source: 'user', createdAt: ago(6 * DAY), updatedAt: ago(6 * DAY) }),
    mem({ id: 'mem_2', projectId: PIXEL, kind: 'decision', title: 'Phaser 3 statt eigener Engine', content: 'Phaser bringt Arcade-Physik, Tastatur und Audio mit. Das spart viel Code.', tags: ['phaser', 'architektur'], taskId: 'task_px1' }),
    mem({ id: 'mem_3', projectId: PIXEL, kind: 'convention', title: 'Ordnerstruktur', content: 'Spiellogik in src/game, Szenen in src/scenes, Tests in tests/.', source: 'user' }),
    mem({ id: 'mem_4', projectId: PIXEL, kind: 'bug', title: 'Spieler fällt an Plattformkante durch', content: 'Tritt nur an der rechten Kante auf, wenn der Spieler mit voller Geschwindigkeit läuft.', tags: ['physik'], taskId: 'task_px7', createdAt: ago(2 * HOUR), updatedAt: ago(25 * MIN) }),
    mem({ id: 'mem_5', projectId: PIXEL, kind: 'attempt', title: 'Hitbox vergrößern hat nicht geholfen', content: 'Plattform-Hitboxen um 1 Pixel vergrößert – Tests schlagen weiter fehl.', taskId: 'task_px7', createdAt: ago(30 * MIN), updatedAt: ago(30 * MIN) }),
    mem({ id: 'mem_6', projectId: PIXEL, kind: 'next_step', title: 'Nach der Bewegung: Level 2', content: 'Sobald die Spielerbewegung geprüft ist, Level 2 (Höhle) beginnen.', taskId: 'task_px3', createdAt: ago(5 * MIN), updatedAt: ago(5 * MIN) }),
    mem({ id: 'mem_7', projectId: REZEPT, kind: 'requirement', title: 'Suche ohne Groß-/Kleinschreibung', content: '„Suppe“ und „suppe“ müssen dieselben Rezepte finden.', source: 'user', tags: ['suche'] }),
    mem({ id: 'mem_8', projectId: REZEPT, kind: 'decision', title: 'SQLite über better-sqlite3', content: 'Synchrone API, schnell genug für eine lokale Rezeptsammlung.', tags: ['datenbank'] }),
    mem({ id: 'mem_9', projectId: REZEPT, kind: 'question', title: 'Testdatenbank zurücksetzen?', content: 'Darf data/test.sqlite für die Migration gelöscht und neu angelegt werden?', taskId: 'task_rz4', createdAt: ago(35 * MIN), updatedAt: ago(35 * MIN) }),
    mem({ id: 'mem_10', projectId: AETHER, kind: 'convention', title: 'Unity-Code-Regeln', content: '[SerializeField] private statt öffentlicher Felder, keine Find*-Aufrufe zur Laufzeit, Events in OnEnable/OnDisable.', source: 'user', tags: ['unity', 'csharp'] }),
    mem({ id: 'mem_11', projectId: AETHER, kind: 'test_result', title: 'EditMode-Tests grün', content: '2159 Tests bestanden, 2 übersprungen (Allokationsmessung).', taskId: 'task_ae2', createdAt: ago(28 * HOUR), updatedAt: ago(28 * HOUR) }),
    mem({ id: 'mem_g1', projectId: null, kind: 'insight', title: 'Phaser: feste Zeitschritte für stabile Kollisionen', content: 'Mit arcade.fixedStep = true verhalten sich Kollisionen bei schwankender Bildrate deutlich stabiler.', tags: ['phaser', 'physik'], shareable: true, createdAt: ago(4 * DAY), updatedAt: ago(4 * DAY) }),
    mem({ id: 'mem_g2', projectId: null, kind: 'insight', title: 'Vitest: Fake-Timer vor dem Import aktivieren', content: 'Module, die beim Import Timer starten, brauchen vi.useFakeTimers() vor dem dynamischen Import.', tags: ['vitest', 'tests'], shareable: true, createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY) }),
    mem({ id: 'mem_g3', projectId: null, kind: 'note', title: 'Modelle mit Werkzeugen bevorzugen', content: 'Für selbstständige Agenten nur Modelle mit der Fähigkeit „Werkzeuge“ verwenden.', source: 'user', tags: ['modelle'], shareable: true, createdAt: ago(10 * DAY), updatedAt: ago(10 * DAY) }),
  ];

  const files: Record<string, Record<string, string>> = {
    [PIXEL]: { ...PIXEL_FILES },
    [REZEPT]: { ...REZEPT_FILES },
    [AETHER]: { ...AETHER_FILES },
  };
  const binaryFiles = new Set<string>([`${PIXEL}:public/assets/tiles.png`]);

  const originals: Record<string, Record<string, string>> = {
    [PIXEL]: {
      'src/game/player.ts': `import Phaser from 'phaser';

export class Player {
  readonly sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.physics.add.sprite(x, y, 'hero');
  }

  update(_deltaMs: number): void {
    // TODO: Bewegung
  }
}
`,
      'src/scenes/GameScene.ts': PIXEL_FILES['src/scenes/GameScene.ts'].replace("    this.physics.add.collider(this.player.sprite, platforms);\n", ''),
      'src/game/physics.ts': `import type Phaser from 'phaser';

export function clampToPlatform(_body: Phaser.Physics.Arcade.Body): void {}
`,
    },
    [REZEPT]: {
      'tests/search.test.ts': '',
      'src/db/migrations/004_shopping.ts': '',
    },
    [AETHER]: {
      'Assets/_Project/Scripts/World/Portal.cs': AETHER_FILES['Assets/_Project/Scripts/World/Portal.cs'].replace('            SceneLoader.Load(targetWorldId, targetSpawnId);\n', ''),
    },
  };

  let changeId = 1;
  const changes: ChangeRecord[] = [];
  const change = (projectId: string, taskId: string | null, runId: string | null, path: string, op: ChangeRecord['op'], ts: number, actor: ChangeRecord['actor'] = 'nova') => {
    changes.push({
      id: changeId++, projectId, taskId, runId, path, op,
      beforeHash: op === 'create' ? null : mockHash(`${path}:before`),
      afterHash: op === 'delete' ? null : mockHash(`${path}:${ts}`),
      actor, ts, reverted: false,
    });
  };
  for (const p of ['package.json', 'index.html', 'vite.config.ts', 'src/main.ts', 'src/scenes/MenuScene.ts']) change(PIXEL, 'task_px2', 'run_px2', p, 'create', ago(5 * DAY + 20 * MIN));
  change(PIXEL, 'task_px7', 'run_px7', 'src/game/physics.ts', 'modify', ago(50 * MIN));
  change(PIXEL, 'task_px7', 'run_px7', 'src/game/physics.ts', 'modify', ago(30 * MIN));
  change(PIXEL, null, null, 'src/game/physics.ts', 'modify', ago(20 * MIN), 'user');
  change(PIXEL, 'task_px3', 'run_px3', 'src/game/player.ts', 'modify', ago(4 * MIN));
  change(PIXEL, 'task_px3', 'run_px3', 'src/scenes/GameScene.ts', 'modify', ago(3 * MIN));
  change(PIXEL, 'task_px3', 'run_px3', 'src/game/player.ts', 'modify', ago(40_000));
  change(REZEPT, 'task_rz2', 'run_rz2', 'src/server.ts', 'create', ago(100 * MIN));
  change(REZEPT, 'task_rz2', 'run_rz2', 'src/routes/recipes.ts', 'create', ago(95 * MIN));
  change(REZEPT, 'task_rz4', 'run_rz4', 'src/db/migrations/004_shopping.ts', 'create', ago(50 * MIN));
  change(REZEPT, 'task_rz3', 'run_rz3', 'tests/search.test.ts', 'create', ago(2 * MIN));
  change(AETHER, 'task_ae1', 'run_ae1', 'Assets/_Project/Scripts/World/Portal.cs', 'modify', ago(26 * HOUR + 10 * MIN));

  const checkpoints: Checkpoint[] = [
    { id: 'chk_px1', projectId: PIXEL, taskId: 'task_px2', kind: 'pre_task', label: 'Vor „Grundgerüst mit Vite und Phaser anlegen“', gitHead: 'a1f3c09', gitCommit: null, changeCursor: 0, createdAt: ago(5 * DAY + 40 * MIN), restoredAt: null },
    { id: 'chk_px2', projectId: PIXEL, taskId: 'task_px2', kind: 'post_task', label: 'Nach „Grundgerüst mit Vite und Phaser anlegen“', gitHead: 'a1f3c09', gitCommit: '7c2e4b1', changeCursor: 5, createdAt: ago(5 * DAY), restoredAt: null },
    { id: 'chk_px3', projectId: PIXEL, taskId: null, kind: 'manual', label: 'Vor dem Umbau der Physik', gitHead: '7c2e4b1', gitCommit: null, changeCursor: 5, createdAt: ago(75 * MIN), restoredAt: null },
    { id: 'chk_px4', projectId: PIXEL, taskId: 'task_px7', kind: 'pre_task', label: 'Vor „Kollision an Plattformkanten korrigieren“', gitHead: '7c2e4b1', gitCommit: null, changeCursor: 5, createdAt: ago(70 * MIN), restoredAt: null },
    { id: 'chk_px5', projectId: PIXEL, taskId: 'task_px3', kind: 'pre_task', label: 'Vor „Spielerbewegung mit Tastatur und Sprung“', gitHead: '7c2e4b1', gitCommit: null, changeCursor: 8, createdAt: ago(6 * MIN), restoredAt: null },
    { id: 'chk_rz1', projectId: REZEPT, taskId: 'task_rz2', kind: 'pre_task', label: 'Vor „Endpunkte für Rezepte“', gitHead: null, gitCommit: null, changeCursor: 11, createdAt: ago(2 * HOUR), restoredAt: null },
    { id: 'chk_ae1', projectId: AETHER, taskId: 'task_ae1', kind: 'pre_task', label: 'Vor „Portal zwischen Dorf und Gruft verbinden“', gitHead: '46bcbd5', gitCommit: null, changeCursor: 15, createdAt: ago(27 * HOUR), restoredAt: null },
  ];

  const check = (c: Partial<CheckRun> & Pick<CheckRun, 'id' | 'projectId' | 'kind' | 'command' | 'status' | 'startedAt'>): CheckRun => ({
    taskId: null, passed: null, failed: null, skipped: null, durationMs: null, outputTail: '', failures: [], failureSignature: null, finishedAt: null, ...c,
  });
  const checks: CheckRun[] = [
    check({ id: 'crun_px_t1', projectId: PIXEL, taskId: 'task_px2', kind: 'test', command: 'npm test', status: 'passed', passed: 22, failed: 0, skipped: 0, durationMs: 8_400, startedAt: ago(5 * DAY + 3 * MIN), finishedAt: ago(5 * DAY + 3 * MIN - 8_400), outputTail: ' ✓ tests/player.test.ts (3)\n ✓ tests/menu.test.ts (19)\n\n Test Files  2 passed (2)\n      Tests  22 passed (22)\n   Duration  8.40s' }),
    check({ id: 'crun_px_b1', projectId: PIXEL, taskId: 'task_px2', kind: 'build', command: 'npm run build', status: 'passed', durationMs: 6_100, startedAt: ago(5 * DAY + 2 * MIN), finishedAt: ago(5 * DAY + 2 * MIN - 6_100), outputTail: 'vite v5.4.10 building for production...\n✓ 34 modules transformed.\ndist/index.html                  0.42 kB\ndist/assets/index-4f1c2a.js   1,148.20 kB\n✓ built in 5.92s' }),
    check({ id: 'crun_px_l1', projectId: PIXEL, taskId: 'task_px2', kind: 'lint', command: 'npm run lint', status: 'passed', durationMs: 2_300, startedAt: ago(5 * DAY + MIN), finishedAt: ago(5 * DAY + MIN - 2_300), outputTail: '✔ Keine Probleme gefunden' }),
    check({
      id: 'crun_px_t2', projectId: PIXEL, taskId: 'task_px7', kind: 'test', command: 'npm test', status: 'failed', passed: 22, failed: 2, skipped: 0, durationMs: 9_100,
      startedAt: ago(25 * MIN + 9_100), finishedAt: ago(25 * MIN),
      failures: [
        { file: 'tests/player.test.ts', line: 48, column: 31, message: 'Spieler bleibt an der rechten Plattformkante stehen: erwartet ≤ 400, erhalten 412' },
        { file: 'tests/player.test.ts', line: 63, column: 5, message: 'Sprung von der Kante: Spieler landet nicht auf der Plattform' },
      ],
      failureSignature: 'player.test.ts:48|player.test.ts:63',
      outputTail: ' ✓ tests/menu.test.ts (19)\n ❯ tests/player.test.ts (5)\n   × bleibt an der rechten Plattformkante stehen\n   × Sprung von der Kante\n\n Test Files  1 failed | 1 passed (2)\n      Tests  2 failed | 22 passed (24)',
    }),
    check({ id: 'crun_rz_t1', projectId: REZEPT, taskId: 'task_rz2', kind: 'test', command: 'npm test', status: 'passed', passed: 41, failed: 0, skipped: 0, durationMs: 3_900, startedAt: ago(82 * MIN), finishedAt: ago(82 * MIN - 3_900), outputTail: ' Test Files  6 passed (6)\n      Tests  41 passed (41)' }),
    check({ id: 'crun_rz_b1', projectId: REZEPT, taskId: 'task_rz2', kind: 'build', command: 'npm run build', status: 'passed', durationMs: 4_700, startedAt: ago(81 * MIN), finishedAt: ago(81 * MIN - 4_700), outputTail: 'tsc -p .\n(keine Ausgabe – erfolgreich)' }),
    check({ id: 'crun_rz_t2', projectId: REZEPT, taskId: 'task_rz3', kind: 'test', command: 'npm test -- search', status: 'running', startedAt: ago(40_000), outputTail: ' RUN  v2.1.4 C:/Users/Demo/Documents/NOVA Projekte/Rezept-API\n' }),
    check({ id: 'crun_ae_t1', projectId: AETHER, taskId: 'task_ae2', kind: 'test', command: 'Unity.exe -batchmode -runTests -testPlatform EditMode', status: 'passed', passed: 2159, failed: 0, skipped: 2, durationMs: 241_000, startedAt: ago(28 * HOUR + 5 * MIN), finishedAt: ago(28 * HOUR + MIN), outputTail: 'Test run completed. 2159 passed, 0 failed, 2 inconclusive.' }),
    check({
      id: 'crun_ae_b1', projectId: AETHER, taskId: 'task_ae1', kind: 'build', command: 'Unity.exe -batchmode -quit -executeMethod …WindowsBuild.RunBatch', status: 'failed', failed: 1, durationMs: 96_000,
      startedAt: ago(26 * HOUR + 4 * MIN), finishedAt: ago(26 * HOUR + 2 * MIN),
      failures: [{ file: 'Assets/_Project/Scripts/World/Portal.cs', line: 15, column: 13, message: "CS0103: Der Name 'SceneLoader' ist im aktuellen Kontext nicht vorhanden." }],
      failureSignature: 'Portal.cs:15:CS0103',
      outputTail: "Assets/_Project/Scripts/World/Portal.cs(15,13): error CS0103: The name 'SceneLoader' does not exist in the current context\nBuild failed with 1 error.",
    }),
  ];

  const processes: ProcessInfo[] = [
    { id: 'proc_px_dev', projectId: PIXEL, taskId: null, kind: 'dev_server', command: 'npm run dev', cwd: projects[0].path, pid: 21344, status: 'running', exitCode: null, url: 'http://127.0.0.1:5174/', startedAt: ago(45 * MIN), endedAt: null },
    { id: 'proc_rz_test', projectId: REZEPT, taskId: 'task_rz3', kind: 'test', command: 'npm test -- search', cwd: projects[2].path, pid: 22810, status: 'running', exitCode: null, url: null, startedAt: ago(40_000), endedAt: null },
    { id: 'proc_px_build', projectId: PIXEL, taskId: 'task_px2', kind: 'build', command: 'npm run build', cwd: projects[0].path, pid: 18200, status: 'exited', exitCode: 0, url: null, startedAt: ago(5 * DAY + 2 * MIN), endedAt: ago(5 * DAY + 2 * MIN - 6_100) },
  ];
  const processOutput: Record<string, string> = {
    proc_px_dev: '\n  VITE v5.4.10  ready in 412 ms\n\n  ➜  Local:   http://127.0.0.1:5174/\n  ➜  press h + enter to show help\n',
    proc_rz_test: ' RUN  v2.1.4 C:/Users/Demo/Documents/NOVA Projekte/Rezept-API\n\n ✓ tests/recipes.test.ts (12)\n',
    proc_px_build: checks[1].outputTail,
  };

  const previews: Record<string, PreviewStatus> = {
    [PIXEL]: { projectId: PIXEL, kind: 'browser-dev-server', state: 'running', url: 'http://127.0.0.1:5174/', processId: 'proc_px_dev', message: 'Die Vorschau läuft über den Entwicklungsserver.', reloadToken: 3 },
    [AETHER]: {
      projectId: AETHER, kind: 'engine-external', state: 'unsupported', url: null, processId: null, reloadToken: 0,
      message: 'Unity-Projekte haben keine eingebettete Live-Vorschau. NOVA kann einen Build starten; zum Spielen das Projekt im Unity-Editor öffnen.',
    },
    [REZEPT]: { projectId: REZEPT, kind: 'browser-dev-server', state: 'stopped', url: null, processId: null, message: 'Die Vorschau ist gestoppt.', reloadToken: 0 },
  };

  const integ = (i: Partial<IntegrationStatus> & Pick<IntegrationStatus, 'id' | 'name' | 'category' | 'available' | 'message'>): IntegrationStatus => ({
    version: null, path: null, manualPath: null, installHint: null, checkedAt: ago(10 * MIN), ...i,
  });
  const integrations: IntegrationStatus[] = [
    integ({ id: 'git', name: 'Git', category: 'vcs', available: true, version: '2.47.1', path: 'C:\\Program Files\\Git\\cmd\\git.exe', message: 'Git ist installiert.' }),
    integ({ id: 'node', name: 'Node.js', category: 'runtime', available: true, version: '22.14.0', path: 'C:\\Program Files\\nodejs\\node.exe', message: 'Node.js ist installiert.' }),
    integ({ id: 'npm', name: 'npm', category: 'package_manager', available: true, version: '10.9.2', path: 'C:\\Program Files\\nodejs\\npm.cmd', message: 'npm ist installiert.' }),
    integ({ id: 'python', name: 'Python', category: 'runtime', available: true, version: '3.12.7', path: 'C:\\Users\\Demo\\AppData\\Local\\Programs\\Python\\Python312\\python.exe', message: 'Python ist installiert.' }),
    integ({
      id: 'dotnet', name: '.NET SDK', category: 'runtime', available: false, message: 'Das .NET SDK wurde nicht gefunden. Es wird nur für Desktop-Anwendungen mit C# gebraucht.',
      installHint: { command: 'winget install --id Microsoft.DotNet.SDK.8 -e', url: 'https://dotnet.microsoft.com/download', requiresAdmin: false },
    }),
    integ({ id: 'powershell', name: 'PowerShell', category: 'shell', available: true, version: '7.4.6', path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe', message: 'PowerShell 7 ist installiert.' }),
    integ({ id: 'windows_terminal', name: 'Windows Terminal', category: 'shell', available: true, version: '1.21.3231', path: 'C:\\Users\\Demo\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe', message: 'Windows Terminal ist installiert.' }),
    integ({ id: 'ollama', name: 'Ollama', category: 'ai', available: true, version: '0.12.6', path: 'C:\\Users\\Demo\\AppData\\Local\\Programs\\Ollama\\ollama.exe', message: 'Ollama läuft.' }),
    integ({ id: 'unity', name: 'Unity', category: 'engine', available: true, version: '6000.6.5f1', path: 'C:\\Program Files\\Unity\\Hub\\Editor\\6000.6.5f1\\Editor\\Unity.exe', message: 'Unity 6.6 wurde über den Unity Hub gefunden.' }),
    integ({
      id: 'unreal', name: 'Unreal Engine', category: 'engine', available: false, message: 'Die Unreal Engine wurde nicht gefunden. Sie wird nur für Unreal-Projekte gebraucht.',
      installHint: { command: null, url: 'https://www.unrealengine.com/download', requiresAdmin: true },
    }),
    integ({
      id: 'godot', name: 'Godot', category: 'engine', available: false, message: 'Godot wurde nicht gefunden.',
      installHint: { command: 'winget install --id GodotEngine.GodotEngine -e', url: 'https://godotengine.org/download/windows/', requiresAdmin: false },
    }),
    integ({ id: 'vscode', name: 'Visual Studio Code', category: 'editor', available: true, version: '1.95.3', path: 'C:\\Users\\Demo\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe', message: 'VS Code ist installiert.' }),
    integ({
      id: 'playwright', name: 'Playwright', category: 'testing', available: false, version: '1.48.2', message: 'Playwright ist vorhanden, aber es ist noch kein Browser für Oberflächentests installiert.',
      installHint: { command: 'npx playwright install chromium', url: 'https://playwright.dev/docs/browsers', requiresAdmin: false },
    }),
    integ({ id: 'winget', name: 'winget', category: 'package_manager', available: true, version: '1.9.25200', path: 'C:\\Users\\Demo\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe', message: 'Der Windows-Paketmanager ist verfügbar.' }),
  ];

  const logs: LogEntry[] = buildLogs(now);

  const settings = defaultSettings();
  settings.general.projectsDir = 'C:\\Users\\Demo\\Documents\\NOVA Projekte';
  settings.agents.maxParallelAgents = 3;
  settings.budgets.dailyLimitUsd = 2;
  settings.budgets.monthlyLimitUsd = 20;
  settings.models.defaultModel = { providerId: OLLAMA, modelId: 'qwen2.5-coder:14b' };
  settings.models.fallbacks = [{ providerId: OLLAMA, modelId: 'llama3.1:8b' }];
  settings.models.roleOverrides.tester = { providerId: OLLAMA, modelId: 'llama3.1:8b' };

  const backups: BackupInfo[] = [
    { id: 'bak_1', kind: 'database', path: 'C:\\Users\\Demo\\AppData\\Roaming\\NOVA AI\\backups\\nova-2026-10-22.db', sizeBytes: 4.2 * MB, reason: 'täglich', projectId: null, createdAt: ago(7 * HOUR) },
    { id: 'bak_2', kind: 'database', path: 'C:\\Users\\Demo\\AppData\\Roaming\\NOVA AI\\backups\\nova-vor-migration-3.db', sizeBytes: 3.9 * MB, reason: 'vor Migration', projectId: null, createdAt: ago(3 * DAY) },
    { id: 'bak_3', kind: 'project_snapshot', path: 'C:\\Users\\Demo\\AppData\\Roaming\\NOVA AI\\backups\\Pixel-Abenteuer-2026-10-20', sizeBytes: 1.6 * MB, reason: 'manuell', projectId: PIXEL, createdAt: ago(2 * DAY) },
  ];

  const templates: ProjectTemplateInfo[] = [
    { id: 'web-vite-ts', name: 'Webanwendung', description: 'Moderne Webseite mit Vite und TypeScript – mit Live-Vorschau im Studio.', kind: 'web', technologies: ['TypeScript', 'Vite'], requiredTools: ['node', 'npm'], previewKind: 'browser-dev-server', missingTools: [] },
    { id: 'web-game-phaser', name: 'Browser-Spiel (2D)', description: '2D-Spiel mit Phaser 3, läuft direkt im Browser und in der Vorschau.', kind: 'web', technologies: ['TypeScript', 'Vite', 'Phaser 3'], requiredTools: ['node', 'npm'], previewKind: 'browser-dev-server', missingTools: [] },
    { id: 'node-api', name: 'REST-API (Node.js)', description: 'Server mit Express und SQLite, inklusive Tests mit Vitest.', kind: 'backend', technologies: ['Node.js', 'Express', 'SQLite'], requiredTools: ['node', 'npm'], previewKind: 'browser-dev-server', missingTools: [] },
    { id: 'python-cli', name: 'Python-Programm', description: 'Kommandozeilenprogramm in Python mit pytest.', kind: 'generic', technologies: ['Python', 'pytest'], requiredTools: ['python'], previewKind: 'desktop-run', missingTools: [] },
    { id: 'unity-urp', name: 'Unity-Projekt (3D, URP)', description: 'Leeres Unity-Projekt mit Universal Render Pipeline und Ordnerstruktur.', kind: 'unity', technologies: ['Unity 6.6', 'C#', 'URP'], requiredTools: ['unity'], previewKind: 'engine-external', missingTools: [] },
    { id: 'godot-2d', name: 'Godot-Spiel (2D)', description: '2D-Spiel mit Godot 4 und GDScript.', kind: 'godot', technologies: ['Godot 4', 'GDScript'], requiredTools: ['godot'], previewKind: 'engine-external', missingTools: ['godot'] },
    { id: 'dotnet-desktop', name: 'Desktop-Anwendung (.NET)', description: 'Windows-Programm mit WPF und C#.', kind: 'desktop', technologies: ['C#', '.NET 8', 'WPF'], requiredTools: ['dotnet'], previewKind: 'desktop-run', missingTools: ['dotnet'] },
  ];

  const roles: AgentRoleInfo[] = [
    { role: 'planner', name: 'Planer', description: 'Zerlegt Ziele in kleine, prüfbare Aufgaben, legt die Reihenfolge fest und hält den Projektplan aktuell.', tools: ['read_file', 'search', 'list_files', 'create_tasks', 'memory'], moduleId: 'agents.planner.v1' },
    { role: 'coder', name: 'Programmierer', description: 'Schreibt und ändert Code im Projektordner, führt erlaubte Befehle aus und dokumentiert seine Änderungen.', tools: ['read_file', 'write_file', 'edit_file', 'search', 'run_command', 'memory'], moduleId: 'agents.coder.v1' },
    { role: 'tester', name: 'Tester', description: 'Schreibt Tests, führt Tests und Builds aus und behebt gefundene Fehler mit begrenzten Versuchen.', tools: ['read_file', 'write_file', 'edit_file', 'run_command', 'run_checks', 'memory'], moduleId: 'agents.tester.v1' },
    { role: 'reviewer', name: 'Prüfer', description: 'Prüft Änderungen auf Fehler, Sicherheitsrisiken und Verstöße gegen die Projektregeln.', tools: ['read_file', 'search', 'git_diff', 'memory'], moduleId: 'agents.reviewer.v1' },
  ];

  const commits: Record<string, GitCommit[]> = {
    [PIXEL]: [
      { hash: '7c2e4b1d9a0f3e8b6c5d4a3b2c1d0e9f8a7b6c5d', shortHash: '7c2e4b1', author: 'NOVA AI', date: ago(5 * DAY), subject: 'NOVA: Grundgerüst mit Vite und Phaser angelegt', byNova: true },
      { hash: 'a1f3c0912b4d5e6f708192a3b4c5d6e7f8091a2b', shortHash: 'a1f3c09', author: 'Demo', date: ago(6 * DAY), subject: 'Projekt angelegt', byNova: false },
    ],
    [AETHER]: [
      { hash: '46bcbd5e0f1a2b3c4d5e6f708192a3b4c5d6e7f8', shortHash: '46bcbd5', author: 'Demo', date: ago(2 * DAY), subject: 'Sammeln: Kräuter-Sammelpunkte mit Respawn', byNova: false },
      { hash: '7b16b80a1b2c3d4e5f60718293a4b5c6d7e8f901', shortHash: '7b16b80', author: 'Demo', date: ago(3 * DAY), subject: 'Aufgabenliste: Zwischensequenzen erledigt', byNova: false },
      { hash: '9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d', shortHash: '9e8d7c6', author: 'NOVA AI', date: ago(28 * HOUR), subject: 'NOVA: EditMode-Tests für das Speichersystem', byNova: true },
    ],
    [REZEPT]: [],
  };
  commits[AETHER].sort((a, b) => b.date - a.date);

  return {
    now,
    projects,
    tasks,
    runs,
    steps,
    approvals,
    rules,
    providers,
    providerHealth,
    apiKeys: { [OPENROUTER]: true },
    models,
    ollama: {
      installed: true,
      running: true,
      baseUrl: 'http://127.0.0.1:11434',
      version: '0.12.6',
      binaryPath: 'C:\\Users\\Demo\\AppData\\Local\\Programs\\Ollama\\ollama.exe',
      message: 'Ollama läuft (Version 0.12.6).',
      checkedAt: ago(20_000),
    },
    pulls: [],
    ollamaRunning,
    usage,
    paidPaused: false,
    pausedReason: null,
    resources,
    resourceHistory,
    errors,
    memory,
    files,
    originals,
    binaryFiles,
    changes,
    checkpoints,
    checks,
    processes,
    processOutput,
    terminals: [],
    previews,
    integrations,
    logs,
    settings,
    backups,
    templates,
    roles,
    commits,
    gitRepos: { [PIXEL]: true, [AETHER]: true, [REZEPT]: false },
    workState: 'running',
    daemon: {
      state: 'running',
      version: '0.1.0',
      pid: 14872,
      instanceId: 'inst_demo',
      startedAt: ago(3 * HOUR + 12 * MIN),
      dataDir: 'C:\\Users\\Demo\\AppData\\Roaming\\NOVA AI',
      dbSchemaVersion: 3,
      work: 'running',
      activeRuns: 2,
      lastError: null,
      recovered: { tasks: 1, orphanProcesses: 0 },
      platform: 'win32',
    },
    autostart: false,
    nextStepId: stepId,
    nextChangeId: changeId,
    counter: 1,
  };
}

function buildLogs(now: number): LogEntry[] {
  const lines: Array<[number, LogEntry['level'], string, string, unknown?]> = [
    [3 * HOUR + 12 * MIN, 'info', 'daemon', 'Hintergrunddienst gestartet (Version 0.1.0, PID 14872)'],
    [3 * HOUR + 12 * MIN, 'info', 'db', 'Datenbank geöffnet (Schema-Version 3, WAL)'],
    [3 * HOUR + 11 * MIN, 'warn', 'recovery', '1 unterbrochene Aufgabe gefunden: Portal zwischen Dorf und Gruft verbinden', { taskId: 'task_ae1' }],
    [3 * HOUR + 11 * MIN, 'info', 'integrations', '14 Werkzeuge geprüft, 10 verfügbar'],
    [3 * HOUR + 10 * MIN, 'info', 'ollama', 'Ollama erreichbar (0.12.6), 3 Modelle installiert'],
    [3 * HOUR + 10 * MIN, 'debug', 'resources', 'GPU erkannt: NVIDIA GeForce RTX 4080 (16 GB, nvidia-smi)'],
    [2 * HOUR, 'warn', 'ollama', 'Ollama antwortet nicht – neuer Versuch in 5 Sekunden', { attempt: 1 }],
    [2 * HOUR - MIN, 'info', 'ollama', 'Ollama wieder erreichbar'],
    [2 * HOUR, 'info', 'scheduler', 'Aufgabe gestartet: Endpunkte für Rezepte', { taskId: 'task_rz2', runId: 'run_rz2' }],
    [95 * MIN, 'debug', 'agent.coder', 'write_file src/routes/recipes.ts (21 Zeilen)', { runId: 'run_rz2' }],
    [82 * MIN, 'info', 'checks', 'Tests bestanden: Rezept-API (41/41, 3,9 Sek.)'],
    [80 * MIN, 'info', 'scheduler', 'Aufgabe erledigt: Endpunkte für Rezepte', { taskId: 'task_rz2' }],
    [70 * MIN, 'info', 'scheduler', 'Aufgabe gestartet: Kollision an Plattformkanten korrigieren', { taskId: 'task_px7' }],
    [55 * MIN, 'info', 'scheduler', 'Aufgabe gestartet: Datenbank-Migration für den Einkaufszettel', { taskId: 'task_rz4' }],
    [45 * MIN, 'info', 'processes', 'Entwicklungsserver gestartet: npm run dev (Pixel-Abenteuer)', { pid: 21344 }],
    [40 * MIN, 'error', 'agent.coder', 'Befehl fehlgeschlagen: npm run db:migrate (Exit-Code 1)', { runId: 'run_rz4', exitCode: 1 }],
    [35 * MIN, 'error', 'agent.coder', 'Gleicher Fehler zweimal hintereinander – Aufgabe blockiert', { taskId: 'task_rz4' }],
    [25 * MIN, 'warn', 'checks', 'Tests fehlgeschlagen: Pixel-Abenteuer (2 von 24)', { checkRunId: 'crun_px_t2' }],
    [25 * MIN, 'error', 'scheduler', 'Aufgabe fehlgeschlagen nach 3 Versuchen: Kollision an Plattformkanten korrigieren', { taskId: 'task_px7' }],
    [20 * MIN, 'info', 'files', 'Externe Änderung erkannt: src/game/physics.ts (Pixel-Abenteuer)'],
    [14 * MIN, 'warn', 'resources', 'Grafikspeicher zu 91 % belegt – Parallelität auf 2 gesenkt'],
    [12 * MIN, 'info', 'scheduler', 'Aufgabe gestartet: Altes Verzeichnis legacy/ entfernen', { taskId: 'task_rz5' }],
    [9 * MIN, 'info', 'approvals', 'Freigabe angefragt: Ordner legacy/ löschen', { approvalId: 'apr_rz_del' }],
    [6 * MIN, 'info', 'scheduler', 'Aufgabe gestartet: Spielerbewegung mit Tastatur und Sprung', { taskId: 'task_px3', runId: 'run_px3' }],
    [4 * MIN, 'info', 'scheduler', 'Aufgabe gestartet: End-to-End-Test für das Hauptmenü', { taskId: 'task_px4' }],
    [3 * MIN, 'info', 'scheduler', 'Aufgabe gestartet: Tests für die Suche schreiben und ausführen', { taskId: 'task_rz3' }],
    [2 * MIN, 'info', 'approvals', 'Freigabe angefragt: Playwright-Browser installieren', { approvalId: 'apr_px_cmd' }],
    [90_000, 'debug', 'rpc', 'dashboard.summary (12 ms)'],
    [60_000, 'debug', 'agent.coder', 'model_call qwen2.5-coder:14b (6.120 → 1.480 Tokens, 21 Sek.)', { runId: 'run_px3' }],
    [40_000, 'debug', 'agent.tester', 'run_command npm test -- search', { runId: 'run_rz3' }],
    [20_000, 'debug', 'agent.coder', 'write_file src/game/player.ts (38 Zeilen)', { runId: 'run_px3' }],
  ];
  return lines.map(([agoMs, level, scope, msg, data]) => ({ ts: now - agoMs, level, scope, msg, ...(data !== undefined ? { data } : {}) })).sort((a, b) => a.ts - b.ts);
}
