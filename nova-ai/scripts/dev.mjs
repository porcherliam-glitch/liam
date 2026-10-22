// Development runner: Vite dev server for the renderer, esbuild watch for main/preload/daemon, then Electron.
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const server = await createServer({ configFile: resolve(root, 'vite.renderer.config.ts') });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';

const builder = spawn(process.execPath, [resolve(root, 'scripts/build.mjs'), '--watch', '--dev'], { stdio: 'inherit', cwd: root });
await new Promise((r) => setTimeout(r, 2500));

const electronBin = require('electron');
const app = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env, NOVA_RENDERER_URL: url, NOVA_DEV: '1' },
});
app.on('exit', async (code) => {
  builder.kill();
  await server.close();
  process.exit(code ?? 0);
});
