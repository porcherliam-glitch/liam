// Unit tests for the search text helpers: term extraction, German spelling variants, FTS query building, LIKE escaping
// and snippets.
import { describe, expect, it } from 'vitest';
import { MAX_CLAUSES, MAX_TERMS, buildFtsQuery, escapeLike, extractTerms, germanVariants, likeNeedles, plainSnippet, quoteFtsTerm } from './text';

describe('extractTerms', () => {
  it('lower-cases, splits on non-letters and removes duplicates and 1-char terms', () => {
    expect(extractTerms('Spielstand-Speicher: Spielstand x  LADEN!')).toEqual(['spielstand', 'speicher', 'laden']);
  });

  it('drops stop words unless the query has only stop words', () => {
    expect(extractTerms('Wie ist die Größe des Spielfelds')).toEqual(['größe', 'spielfelds']);
    expect(extractTerms('die der das')).toEqual(['die', 'der', 'das']);
  });

  it('keeps umlauts and digits and treats FTS operators as plain words', () => {
    expect(extractTerms('Übung AND NEAR(v2) title:Ärger')).toEqual(['übung', 'near', 'v2', 'title', 'ärger']);
  });

  it('returns nothing for symbol-only queries', () => {
    expect(extractTerms('C++')).toEqual([]);
    expect(extractTerms('# - * "')).toEqual([]);
  });

  it('keeps the longest terms of very long queries in original order', () => {
    const words = Array.from({ length: 40 }, (_, i) => 'w'.repeat(2 + (i % 10)) + String.fromCharCode(97 + (i % 26)));
    const terms = extractTerms(words.join(' '));
    expect(terms).toHaveLength(MAX_TERMS);
    const lengths = terms.map((t) => t.length);
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(9);
    // original order preserved
    const positions = terms.map((t) => words.indexOf(t));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('normalises decomposed umlauts (NFD) to the composed form', () => {
    expect(extractTerms('Größe')).toEqual(['größe']);
  });
});

describe('germanVariants', () => {
  it('expands umlauts and ß into digraph/ss forms', () => {
    expect(germanVariants('größe')).toEqual(['größe', 'groeße', 'grösse', 'groesse']);
  });

  it('expands digraphs back into umlauts and ss into ß', () => {
    expect(germanVariants('groesse')).toEqual(['groesse', 'grösse', 'groeße', 'größe']);
    expect(germanVariants('strasse')).toEqual(['strasse', 'straße']);
    expect(germanVariants('straße')).toEqual(['straße', 'strasse']);
  });

  it('leaves plain words alone and respects the maximum', () => {
    expect(germanVariants('canvas')).toEqual(['canvas']);
    expect(germanVariants('größe', 2)).toHaveLength(2);
  });
});

describe('buildFtsQuery', () => {
  it('quotes every term, uses prefix matching and ORs the terms', () => {
    expect(buildFtsQuery('Canvas Spiel')).toBe('"canvas"* OR "spiel"*');
  });

  it('adds German variants', () => {
    expect(buildFtsQuery('Größe')).toBe('"größe"* OR "groeße"* OR "grösse"* OR "groesse"*');
  });

  it('escapes embedded quotes', () => {
    expect(quoteFtsTerm('a"b')).toBe('"a""b"*');
  });

  it('returns null when there is nothing to search for', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('  + ')).toBeNull();
    expect(buildFtsQuery('x')).toBeNull();
  });

  it('caps the number of OR clauses', () => {
    const q = Array.from({ length: 30 }, (_, i) => `größe${String.fromCharCode(97 + i % 26)}${i}`).join(' ');
    const clauses = buildFtsQuery(q)!.split(' OR ');
    expect(clauses.length).toBeLessThanOrEqual(MAX_CLAUSES);
  });
});

describe('LIKE helpers and snippets', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeLike('100%_a\\b')).toBe('100\\%\\_a\\\\b');
  });

  it('adds a capitalised needle for non-ASCII first letters', () => {
    expect(likeNeedles('ärger')).toEqual(['ärger', 'Ärger', 'aerger']);
    expect(likeNeedles('verbindung')).toEqual(['verbindung']);
  });

  it('cuts a plain snippet around the first hit', () => {
    const text = `${'a '.repeat(100)}Datenbankverbindung wird gepoolt ${'b '.repeat(100)}`;
    const snip = plainSnippet(text, ['verbindung'], 20);
    expect(snip.startsWith('…')).toBe(true);
    expect(snip.endsWith('…')).toBe(true);
    expect(snip).toContain('Datenbankverbindung');
  });

  it('returns the beginning when nothing matches and collapses whitespace', () => {
    expect(plainSnippet('Zeile 1\n\nZeile 2', ['nichts'])).toBe('Zeile 1 Zeile 2');
    expect(plainSnippet('', ['x'])).toBe('');
  });
});
