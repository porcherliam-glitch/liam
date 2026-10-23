// Unit tests of text/encoding/EOL helpers, edit offset mapping, language guesses and search query/preview helpers.
import { describe, it, expect } from 'vitest';
import { convertEol, countLines, decodeText, defaultEolFor, dominantEol, encodeText, formatBytes, isBinaryContent, utf8SafeSlice } from './text';
import { applyEdit, normalizeNewlines, toOriginalOffset, similarity } from './edit-match';
import { languageForPath } from './language';
import { buildPreview, compileQuery } from './search';

describe('text helpers', () => {
  it('detects binary content but not UTF-16 text', () => {
    expect(isBinaryContent(Buffer.from('abc'))).toBe(false);
    expect(isBinaryContent(Buffer.from([0x61, 0x00, 0x62]))).toBe(true);
    expect(isBinaryContent(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]))).toBe(false);
  });

  it('decodes and re-encodes losslessly (UTF-8 with/without BOM, Latin-1, UTF-16 LE/BE)', () => {
    const cases: Buffer[] = [
      Buffer.from('plain ü\n'),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom ü\n')]),
      Buffer.from([0x80, 0xe4, 0xfc, 0x0a]), // Windows-1252 € ä ü
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('le ü\r\n', 'utf16le')]),
      Buffer.from([0xfe, 0xff, 0x00, 0x62, 0x00, 0xe4]),
    ];
    for (const buf of cases) {
      const d = decodeText(buf);
      expect(encodeText(d.text, d).data).toEqual(buf);
    }
    expect(decodeText(Buffer.from([0xfe, 0xff, 0x00, 0x62, 0x00, 0xe4])).text).toBe('bä');
    const latin = decodeText(Buffer.from([0xe4]));
    expect(latin.encoding).toBe('latin1');
    expect(encodeText('€', latin)).toMatchObject({ switchedToUtf8: true });
    expect(encodeText('﻿x', { bom: false, encoding: 'utf8' }).data).toEqual(Buffer.from('x'));
  });

  it('computes dominant EOL, converts and picks defaults per file type', () => {
    expect(dominantEol('a\r\nb\r\nc\n')).toBe('\r\n');
    expect(dominantEol('a\nb\nc\r\n')).toBe('\n');
    expect(dominantEol('a\r\nb\n')).toBe('\r\n');
    expect(dominantEol('single line')).toBeNull();
    expect(convertEol('a\nb\r\nc', '\r\n')).toBe('a\r\nb\r\nc');
    for (const p of ['run.bat', 'x.CMD', 'App.sln', 'a/b.csproj', 'Player.cs', 'setup.ps1']) expect(defaultEolFor(p)).toBe('\r\n');
    for (const p of ['a.ts', 'Makefile', 'script.sh', 'x.cshtml', '.bat']) expect(defaultEolFor(p)).toBe('\n');
  });

  it('cuts UTF-8 safely and formats sizes/lines', () => {
    const buf = Buffer.from('aäb'); // a (1) ä (2) b (1)
    expect(utf8SafeSlice(buf, 2).toString()).toBe('a');
    expect(utf8SafeSlice(buf, 3).toString()).toBe('aä');
    expect(countLines('')).toBe(0);
    expect(countLines('a\nb\n')).toBe(2);
    expect(countLines('a\nb')).toBe(2);
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3,0 MB');
  });
});

describe('edit matching', () => {
  it('maps normalized offsets back to the original text', () => {
    const { norm, crlfAt } = normalizeNewlines('a\r\nb\r\nc\nd');
    expect(norm).toBe('a\nb\nc\nd');
    expect(crlfAt).toEqual([1, 3]);
    expect(toOriginalOffset(2, crlfAt)).toBe(3);
    expect(toOriginalOffset(6, crlfAt)).toBe(8);
  });

  it('replaces at the end of a file and with an empty newText', () => {
    expect(applyEdit('a\r\nb\r\n', 'b\n', '', false, '\r\n')).toMatchObject({ kind: 'ok', text: 'a\r\n', insertedLines: 0 });
    expect(applyEdit('x', 'x', 'y\nz', false, '\r\n')).toMatchObject({ kind: 'ok', text: 'y\r\nz' });
  });

  it('scores similarity', () => {
    expect(similarity('console.log("hallo")', 'console.log("hello")')).toBeGreaterThan(0.7);
    expect(similarity('abc', 'xyz')).toBe(0);
  });
});

describe('language and search helpers', () => {
  it('guesses Monaco languages', () => {
    expect(languageForPath('src/App.tsx')).toBe('typescript');
    expect(languageForPath('Assets/Scripts/Player.cs')).toBe('csharp');
    expect(languageForPath('Dockerfile')).toBe('dockerfile');
    expect(languageForPath('.env.local')).toBe('ini');
    expect(languageForPath('scene.unity')).toBe('yaml');
    expect(languageForPath('noext')).toBe('plaintext');
    expect(languageForPath('x.unknownext')).toBe('plaintext');
  });

  it('escapes plain queries, validates regexes and builds short previews', () => {
    expect(compileQuery('a.b(', false, false)).toEqual({ source: 'a\\.b\\(', flags: 'gi' });
    expect(() => compileQuery('a(', true, true)).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    const long = 'x'.repeat(300) + 'MATCH' + 'y'.repeat(300);
    const start = 300 - 80;
    const preview = buildPreview({ path: 'f', line: 1, column: 301, window: long.slice(start, start + 400), windowStart: start });
    expect(preview.length).toBeLessThanOrEqual(200);
    expect(preview).toContain('MATCH');
    expect(preview.startsWith('…')).toBe(true);
    expect(buildPreview({ path: 'f', line: 1, column: 3, window: '  hi there', windowStart: 0 })).toBe('hi there');
  });
});
