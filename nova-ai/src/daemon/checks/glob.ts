// Minimal glob matcher (no dependency) for project.config.artifactGlobs, plus the artifact scan after builds.
// Supported syntax: `**` (any number of path segments), `*` (anything except '/'), `?` (one char except '/'),
// `{a,b}` alternatives (not nested), `[abc]` / `[!abc]` character classes. A pattern without '/' matches the file
// name at any depth (like .gitignore). Matching is case-insensitive on Windows.
// The scan never follows symlinks/junctions, starts at each pattern's static prefix directory and is bounded
// (visited entries and results) so a huge build folder cannot stall the daemon.
import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function escapeRe(ch: string): string {
  return /[.+^$()|\\/{}[\]*?]/.test(ch) ? `\\${ch}` : ch;
}

export function normalizeGlob(pattern: string): string {
  let p = pattern.trim().replace(/\\/g, '/');
  while (p.startsWith('./')) p = p.slice(2);
  p = p.replace(/^\/+/, '');
  if (p && !p.includes('/')) p = `**/${p}`;
  return p;
}

export function globToRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  const p = normalizeGlob(pattern);
  let re = '';
  let i = 0;
  let inGroup = false;
  while (i < p.length) {
    const ch = p[i];
    if (ch === '*') {
      if (p[i + 1] === '*') {
        const atSegStart = i === 0 || p[i - 1] === '/';
        const next = p[i + 2];
        if (atSegStart && next === '/') {
          re += '(?:.*/)?';
          i += 3;
          continue;
        }
        if (atSegStart && next === undefined) {
          re += '.*';
          i += 2;
          continue;
        }
        re += '.*';
        i += 2;
        continue;
      }
      re += '[^/]*';
      i++;
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      i++;
      continue;
    }
    if (ch === '{' && !inGroup) {
      inGroup = true;
      re += '(?:';
      i++;
      continue;
    }
    if (ch === '}' && inGroup) {
      inGroup = false;
      re += ')';
      i++;
      continue;
    }
    if (ch === ',' && inGroup) {
      re += '|';
      i++;
      continue;
    }
    if (ch === '[') {
      const end = p.indexOf(']', i + 1);
      if (end > i + 1) {
        let body = p.slice(i + 1, end);
        const negate = body.startsWith('!') || body.startsWith('^');
        if (negate) body = body.slice(1);
        body = body.replace(/\\/g, '\\\\').replace(/\//g, '');
        re += negate ? `[^/${body}]` : `[${body}]`;
        i = end + 1;
        continue;
      }
    }
    re += escapeRe(ch);
    i++;
  }
  if (inGroup) re += ')';
  return new RegExp(`^${re}$`, caseInsensitive ? 'i' : '');
}

export function matchesGlob(relPath: string, pattern: string, caseInsensitive: boolean): boolean {
  return globToRegExp(pattern, caseInsensitive).test(relPath.replace(/\\/g, '/'));
}

/** Directory part of a pattern before the first wildcard ("dist/**" → "dist", "**\/bin/**" → ""). */
export function globStaticPrefix(pattern: string): string {
  const segs = normalizeGlob(pattern).split('/');
  const out: string[] = [];
  for (let i = 0; i < segs.length - 1; i++) {
    if (/[*?{[]/.test(segs[i])) break;
    out.push(segs[i]);
  }
  return out.join('/');
}

const SCAN_SKIP = new Set(['node_modules', '.git', '.nova', 'Library', 'Temp', '.venv', '__pycache__']);

export interface ArtifactScanOptions {
  caseInsensitive: boolean;
  /** Only files modified at or after this time (ms). */
  sinceMs: number;
  maxResults?: number;
  maxVisited?: number;
}

/** Files below root that match one of the globs and were modified since `sinceMs`. */
export function findArtifacts(root: string, globs: string[], opts: ArtifactScanOptions): { path: string; sizeBytes: number }[] {
  const patterns = globs.map((g) => g.trim()).filter(Boolean);
  if (patterns.length === 0) return [];
  const regexes = patterns.map((g) => globToRegExp(g, opts.caseInsensitive));
  const maxResults = opts.maxResults ?? 500;
  const maxVisited = opts.maxVisited ?? 50_000;
  const results = new Map<string, number>();
  let visited = 0;
  const prefixes = [...new Set(patterns.map(globStaticPrefix))].sort((a, b) => a.length - b.length);
  const startDirs = prefixes.filter((p, idx) => !prefixes.slice(0, idx).some((q) => q === '' || p === q || p.startsWith(`${q}/`)));

  const walk = (abs: string, rel: string, explicit: boolean) => {
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return;
    }
    for (const name of entries) {
      if (visited++ >= maxVisited || results.size >= maxResults) return;
      const childAbs = join(abs, name);
      const childRel = rel ? `${rel}/${name}` : name;
      let st;
      try {
        st = lstatSync(childAbs);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (!explicit && SCAN_SKIP.has(name)) continue;
        walk(childAbs, childRel, false);
      } else if (st.isFile() && st.mtimeMs >= opts.sinceMs && regexes.some((r) => r.test(childRel))) {
        results.set(childRel, st.size);
      }
    }
  };
  for (const prefix of startDirs) {
    if (prefix.split('/').some((seg) => seg === '..' || seg === '.')) continue;
    const abs = prefix ? join(root, ...prefix.split('/')) : root;
    try {
      const st = lstatSync(abs);
      if (!st.isDirectory() || st.isSymbolicLink()) continue;
    } catch {
      continue;
    }
    walk(abs, prefix, prefix !== '');
  }
  return [...results.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([path, sizeBytes]) => ({ path, sizeBytes }));
}
