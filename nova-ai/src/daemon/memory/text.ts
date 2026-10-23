// Search text helpers of the memory module: term extraction, German spelling variants, FTS5 MATCH query building,
// LIKE patterns and plain-text snippets.
//
// Key decisions:
// - The FTS index (db/migrations.ts: tokenize='unicode61 remove_diacritics 2') folds case and strips diacritics
//   (ö→o, é→e), but it keeps "ß" and never maps ä↔ae. Measured with node:sqlite 3.50: "Größe" matches "Große" only,
//   "Grösse" matches "Grosse"/"GRÖSSE", "Groesse" matches nothing else. Queries are therefore expanded with German
//   spelling variants (ä↔ae, ö↔oe, ü↔ue, ß↔ss), so "Größe", "Grösse", "Groesse", "Grosse" and "Große" find each other
//   (an unmarked "Grosse" query cannot know that "o" stands for "ö"; it still finds "Große" via ss→ß).
// - Every term is quoted ("" escaping) and used as a prefix query ("term"*); all terms are OR-ed and the service ranks
//   with bm25(). FTS operators typed by a user (AND, OR, NEAR, column filters, quotes, parentheses) are plain words,
//   so a MATCH syntax error is impossible.
// - German/English stop words are dropped unless the query consists only of stop words; terms shorter than 2
//   characters are dropped. An empty term list means "no FTS query" → the service falls back to LIKE.
// - Long queries (task descriptions given to contextFor) keep the MAX_TERMS longest terms (longer words are more
//   specific), in their original order; the number of OR clauses is capped.
// - Snippets are plain text without highlight markers (the renderer shows them as text; no HTML is ever produced).

/** Maximum number of distinct terms used from one query. */
export const MAX_TERMS = 20;
/** Maximum spelling variants per term (including the term itself). */
export const MAX_VARIANTS = 4;
/** Hard cap of OR clauses in one MATCH expression. */
export const MAX_CLAUSES = 80;
/** Characters of one term (longer words are cut; prefix matching still works). */
const MAX_TERM_LENGTH = 64;

const STOP_WORDS = new Set<string>([
  // German
  'aber', 'alle', 'allem', 'allen', 'aller', 'alles', 'als', 'also', 'am', 'an', 'auch', 'auf', 'aus', 'bei', 'bin',
  'bis', 'bist', 'bzw', 'da', 'damit', 'dann', 'das', 'dass', 'daß', 'dem', 'den', 'denn', 'der', 'des', 'dessen',
  'dich', 'die', 'dies', 'diese', 'diesem', 'diesen', 'dieser', 'dieses', 'dir', 'doch', 'dort', 'du', 'durch', 'ein',
  'eine', 'einem', 'einen', 'einer', 'eines', 'er', 'es', 'etwas', 'euch', 'für', 'fuer', 'hab', 'habe', 'haben',
  'hat', 'hatte', 'hier', 'ich', 'ihr', 'im', 'in', 'ist', 'ja', 'jede', 'jedem', 'jeden', 'jeder', 'jedes', 'kann',
  'man', 'mich', 'mir', 'mit', 'muss', 'nach', 'noch', 'nun', 'nur', 'ob', 'oder', 'ohne', 'sehr', 'sein', 'sich',
  'sie', 'sind', 'so', 'soll', 'sollen', 'über', 'ueber', 'um', 'und', 'uns', 'unter', 'usw', 'vom', 'von', 'vor',
  'war', 'waren', 'was', 'weil', 'welche', 'wenn', 'wer', 'werden', 'wie', 'wir', 'wird', 'wo', 'wurde', 'zu', 'zum',
  'zur', 'zwischen',
  // English
  'a', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has', 'have', 'how', 'if', 'into', 'is', 'it',
  'its', 'of', 'on', 'or', 'that', 'the', 'their', 'then', 'there', 'these', 'this', 'to', 'was', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your',
]);

function codePointLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  return Array.from(s).slice(0, max).join('');
}

/**
 * Splits a free-text query into lower-case search terms (letters, digits and combining marks; everything else
 * separates). Drops terms shorter than 2 characters and stop words (unless only stop words remain).
 */
export function extractTerms(query: string, maxTerms: number = MAX_TERMS): string[] {
  const normalized = query.normalize('NFC').toLowerCase();
  const tokens = normalized.match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of tokens) {
    const token = cut(raw, MAX_TERM_LENGTH);
    if (codePointLength(token) < 2 || seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }
  const meaningful = unique.filter((t) => !STOP_WORDS.has(t));
  const pool = meaningful.length > 0 ? meaningful : unique;
  if (pool.length <= maxTerms) return pool;
  // Keep the longest terms (ties: earlier first), then restore the original order.
  const keep = new Set(
    pool
      .map((term, index) => ({ term, index, len: codePointLength(term) }))
      .sort((a, b) => b.len - a.len || a.index - b.index)
      .slice(0, maxTerms)
      .map((x) => x.term),
  );
  return pool.filter((t) => keep.has(t));
}

/**
 * German spelling variants of a lower-case term: umlaut ↔ digraph (ä/ae, ö/oe, ü/ue) and ß ↔ ss.
 * The first element is always the term itself. At most `max` variants.
 */
export function germanVariants(term: string, max: number = MAX_VARIANTS): string[] {
  const out: string[] = [term];
  const add = (v: string) => {
    if (v && out.length < max && !out.includes(v)) out.push(v);
  };
  if (/[äöü]/.test(term)) add(term.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'));
  if (/ae|oe|ue/.test(term)) add(term.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü'));
  for (const v of [...out]) {
    if (v.includes('ß')) add(v.replace(/ß/g, 'ss'));
    if (v.includes('ss')) add(v.replace(/ss/g, 'ß'));
  }
  return out;
}

/** One FTS5 prefix clause: the term in double quotes (embedded quotes doubled) followed by `*`. */
export function quoteFtsTerm(term: string): string {
  return `"${term.replace(/"/g, '""')}"*`;
}

/** Builds the MATCH expression for already extracted terms, or null when there is nothing to search for. */
export function buildFtsQueryFromTerms(terms: readonly string[]): string | null {
  const clauses: string[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    for (const variant of germanVariants(term)) {
      if (clauses.length >= MAX_CLAUSES) break;
      if (seen.has(variant)) continue;
      seen.add(variant);
      clauses.push(quoteFtsTerm(variant));
    }
  }
  return clauses.length > 0 ? clauses.join(' OR ') : null;
}

/** FTS5 MATCH expression for a free-text query (null → no usable terms, use the LIKE fallback). */
export function buildFtsQuery(query: string): string | null {
  return buildFtsQueryFromTerms(extractTerms(query));
}

/** Escapes LIKE wildcards for `LIKE ? ESCAPE '\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function capitalize(s: string): string {
  const first = s.codePointAt(0);
  if (first === undefined) return s;
  const head = String.fromCodePoint(first);
  const upper = head.toLocaleUpperCase('de-DE');
  // "ß".toUpperCase() is "SS" – keep such cases unchanged.
  return codePointLength(upper) === 1 ? upper + s.slice(head.length) : s;
}

/**
 * Substring needles for one term (used by the LIKE fallback): German spelling variants plus the capitalised form when
 * the first letter is not ASCII (SQLite's LIKE folds ASCII case only). At most `max` needles.
 */
export function likeNeedles(term: string, max = 4): string[] {
  const out: string[] = [];
  const add = (v: string) => {
    if (v && out.length < max && !out.includes(v)) out.push(v);
  };
  for (const variant of germanVariants(term, 3)) {
    add(variant);
    if (/^[^\x00-\x7f]/.test(variant)) add(capitalize(variant));
  }
  return out;
}

/**
 * Plain-text snippet around the first occurrence of any needle (case-insensitive), whitespace collapsed.
 * Without a hit the beginning of the text is returned. "…" marks cut text.
 */
export function plainSnippet(text: string, needles: readonly string[], radius = 60): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  const lower = flat.toLowerCase();
  let index = -1;
  let length = 0;
  for (const needle of needles) {
    const n = needle.toLowerCase();
    if (!n) continue;
    const i = lower.indexOf(n);
    if (i >= 0 && (index < 0 || i < index)) {
      index = i;
      length = n.length;
    }
  }
  if (index < 0) return flat.length > radius * 2 ? `${flat.slice(0, radius * 2).trimEnd()}…` : flat;
  const start = Math.max(0, index - radius);
  const end = Math.min(flat.length, index + length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
