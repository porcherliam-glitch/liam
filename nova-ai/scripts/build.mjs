// Build script: bundles main, preload and daemon with esbuild and the renderer with Vite.
// Usage: node scripts/build.mjs [--only main|preload|daemon|renderer] [--watch] [--dev]
import { build, context } from 'esbuild';
import { build as viteBuild } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const watch = args.includes('--watch');
const dev = args.includes('--dev');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'warning',
  alias: { '@shared': resolve(root, 'src/shared') },
  define: {
    __NOVA_VERSION__: JSON.stringify(pkg.version),
    __NOVA_DEV__: JSON.stringify(dev),
  },
};

const targets = {
  // The daemon is fully self-contained (all npm deps bundled) so it can run with
  // ELECTRON_RUN_AS_NODE=1 from an unpacked location without node_modules.
  daemon: {
    ...common,
    entryPoints: [resolve(root, 'src/daemon/index.ts')],
    outfile: resolve(root, 'out/daemon/index.cjs'),
    external: [],
  },
  main: {
    ...common,
    entryPoints: [resolve(root, 'src/main/index.ts')],
    outfile: resolve(root, 'out/main/index.cjs'),
    external: ['electron'],
  },
  preload: {
    ...common,
    entryPoints: [resolve(root, 'src/preload/index.ts')],
    outfile: resolve(root, 'out/preload/index.cjs'),
    external: ['electron'],
    target: 'chrome130',
  },
};

async function buildNode(name) {
  const cfg = targets[name];
  if (watch) {
    const ctx = await context(cfg);
    await ctx.watch();
    console.log(`[build] watching ${name}`);
    return;
  }
  await build(cfg);
  console.log(`[build] ${name} ok`);
}

async function buildRenderer() {
  await viteBuild({ configFile: resolve(root, 'vite.renderer.config.ts'), logLevel: 'warn' });
  console.log('[build] renderer ok');
}

const names = only ? [only] : ['daemon', 'main', 'preload', 'renderer'];
for (const name of names) {
  if (name === 'renderer') {
    if (!watch) await buildRenderer();
  } else {
    await buildNode(name);
  }
}
