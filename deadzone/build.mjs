#!/usr/bin/env node
// Build script: concatenates deadzone/src/*.js (filename order) + style.css into template.html
// and writes the single-file game to <repo>/index.html. No runtime dependencies.
//
// Usage: node deadzone/build.mjs [--out <path>] [--check-only]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, 'src');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(here, '..', 'index.html');
const checkOnly = args.includes('--check-only');

const template = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const cssPath = path.join(srcDir, 'style.css');
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

const jsFiles = fs.readdirSync(srcDir)
  .filter(f => /^\d{2}_.*\.js$/.test(f))
  .sort((a, b) => a.localeCompare(b, 'en'));

if (jsFiles.length === 0) {
  console.error('No source files found in', srcDir);
  process.exit(1);
}

let bundle = '';
for (const f of jsFiles) {
  const code = fs.readFileSync(path.join(srcDir, f), 'utf8');
  if (/^\s*(import|export)\s/m.test(code)) {
    console.error(`${f}: import/export statements are not allowed in the single-file bundle`);
    process.exit(1);
  }
  bundle += `\n// ===== ${f} =====\n${code}\n`;
}

const js = `(() => {\n'use strict';\n${bundle}\n})();\n`;

// Syntax check of the bundle with node --check (parse only).
const tmp = path.join(os.tmpdir(), `deadzone_bundle_${process.pid}.js`);
fs.writeFileSync(tmp, js);
const chk = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
fs.unlinkSync(tmp);
if (chk.status !== 0) {
  console.error('Syntax error in bundle:\n' + chk.stderr);
  process.exit(1);
}

// Guard: the template must not reference external resources.
const external = /(src|href)\s*=\s*["']\s*(https?:)?\/\//i;
if (external.test(template)) {
  console.error('template.html references an external resource');
  process.exit(1);
}
if (/<\/script>/i.test(js)) {
  console.error('Bundle contains a literal </script> sequence; escape it (e.g. "<\\/script>")');
  process.exit(1);
}
if (/<\/style>/i.test(css)) {
  console.error('style.css contains a literal </style> sequence');
  process.exit(1);
}

const html = template
  .replace('/*__CSS__*/', () => css)
  .replace('/*__JS__*/', () => js);

if (!template.includes('/*__CSS__*/') || !template.includes('/*__JS__*/')) {
  console.error('template.html is missing the /*__CSS__*/ or /*__JS__*/ placeholder');
  process.exit(1);
}

if (!checkOnly) {
  fs.writeFileSync(outPath, html);
}
const lines = js.split('\n').length;
console.log(`${checkOnly ? 'checked' : 'built'} ${path.relative(process.cwd(), outPath)}: ` +
  `${jsFiles.length} modules, ${lines} JS lines, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
