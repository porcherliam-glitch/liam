#!/usr/bin/env node
// Runs every *.test.mjs in this folder sequentially (each file exports `default: async () => ({passed, failed, failures})`
// or runs itself on import and exports nothing). Exit code 1 if any test fails.
//
// Usage: node deadzone/tests/run.mjs [filterSubstring]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const files = fs.readdirSync(here).filter(f => f.endsWith('.test.mjs') && f.includes(filter)).sort();
let passed = 0, failed = 0; const failures = [];
for (const f of files) {
  console.log(`\n== ${f}`);
  const t0 = Date.now();
  try {
    const mod = await import(pathToFileURL(path.join(here, f)).href);
    if (typeof mod.default === 'function') {
      const r = await mod.default();
      passed += r.passed || 0; failed += r.failed || 0;
      for (const x of r.failures || []) failures.push({ file: f, ...x });
    }
  } catch (e) {
    failed++;
    failures.push({ file: f, name: '(import)', error: e && e.stack ? e.stack : String(e) });
    console.log(`  FAIL ${f}: ${e && e.message ? e.message : e}`);
  }
  console.log(`   (${Date.now() - t0} ms)`);
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const x of failures) console.log(`- ${x.file} :: ${x.name}\n  ${String(x.error).split('\n').slice(0, 6).join('\n  ')}`);
}
process.exit(failed ? 1 : 0);
