// Unit tests of the memory content guard: redaction layers, idempotency, "mainly a secret" detection, limits and tags.
import { afterEach, describe, expect, it } from 'vitest';
import { REDACTED, _clearRegisteredSecrets, registerSecret } from '../core/redact';
import { NovaError } from '../core/errors';
import { isMostlySecret, looksLikeCredential, looksRandomToken, normalizeTags, redactMemoryText, sanitizeContent, sanitizeText, sanitizeTitle } from './guard';

afterEach(() => _clearRegisteredSecrets());

const R = REDACTED;

describe('redactMemoryText', () => {
  it.each([
    ['OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456', `OPENAI_API_KEY=${R}`],
    ['Das Passwort lautet hunter2', `Das Passwort lautet ${R}`],
    ['Das Passwort lautet sommerwind', `Das Passwort lautet ${R}`],
    ['Mein Datenbankpasswort: Sommer2024!', `Mein Datenbankpasswort: ${R}!`],
    ['Kennwort = geheim', `Kennwort = ${R}`],
    ['PIN-Code: 4711', `PIN-Code: ${R}`],
    ['Der API-Schlüssel ist sk-ant-abcdefghijklmnopq', `Der API-Schlüssel ist ${R}`],
    ['Der Lizenz-Schlüssel lautet ABCD-1234-EFGH-5678.', `Der Lizenz-Schlüssel lautet ${R}.`],
    ['Token: aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5', `Token: ${R}`],
    ['Der Schlüssel ist geheim12345 und bleibt intern.', `Der Schlüssel ist ${R} und bleibt intern.`],
    ['Zugangsdaten: admin/Start#2024', `Zugangsdaten: ${R}`],
    ['curl https://max:topsecret99@example.com/api', `curl https://max:${R}@example.com/api`],
    ['Bearer-Wert: Zx8Kp2Lm9Qw4Rt7Yv1Bn6Hc3Jd5Fg0SaEeUu', `Bearer-Wert: ${R}`],
  ])('redacts %j', (input, expected) => {
    expect(redactMemoryText(input)).toBe(expected);
  });

  it.each([
    'Das Token ist abgelaufen und muss erneuert werden.',
    'Das Passwort ist abgelaufen.',
    'Der Token heißt CSRF-Token und steht im Formular.',
    'Der Schlüssel ist savegame-v2.',
    'Der Primärschlüssel ist user_id.',
    'Die Konfiguration liegt in config/settings.json.',
    'Der Schlüssel ist https://example.com/docs.',
    'Commit 3f2a9c1e5b7d9f0a1c3e5b7d9f0a1c3e5b7d9f0a behebt den Fehler.',
    'UUID 123e4567-e89b-12d3-a456-426614174000 im Log.',
    'useCanvasRenderingContextWithOffscreenFallbackOption ist ein langer Bezeichner.',
    'password=x',
  ])('keeps %j', (input) => {
    expect(redactMemoryText(input)).toBe(input);
  });

  it('redacts values registered with the core redactor', () => {
    registerSecret('mein-geheimer-wert-42');
    expect(redactMemoryText('Wert: mein-geheimer-wert-42 benutzen')).toBe(`Wert: ${R} benutzen`);
  });

  it('is idempotent (redacting twice changes nothing)', () => {
    for (const input of [
      'Der API-Schlüssel ist sk-ant-abcdefghijklmnopq',
      'Token: aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5',
      'Mein Passwort: Sommer2024!',
      `Schon geschwärzt: Passwort: ${R} und Token ist ${R}.`,
    ]) {
      const once = redactMemoryText(input);
      expect(redactMemoryText(once)).toBe(once);
      expect(once).not.toContain(`${R}]`);
    }
  });
});

describe('credential heuristics', () => {
  it('detects random tokens but not identifiers, hex hashes or short strings', () => {
    expect(looksRandomToken('aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5')).toBe(true);
    expect(looksRandomToken('useCanvasRenderingContextWithOffscreenFallback1')).toBe(false);
    expect(looksRandomToken('3f2a9c1e5b7d9f0a1c3e5b7d9f0a1c3e5b7d9f0a')).toBe(false);
    expect(looksRandomToken('aB3dE5fG7h')).toBe(false);
  });

  it('distinguishes credential-like values from words and identifiers', () => {
    expect(looksLikeCredential('hunter22')).toBe(true);
    expect(looksLikeCredential('abgelaufen')).toBe(false);
    expect(looksLikeCredential('user_id')).toBe(false);
    expect(looksLikeCredential('savegame-v2')).toBe(true);
    expect(looksLikeCredential('savegame-v2', true)).toBe(false);
    expect(looksLikeCredential('geheim12', true)).toBe(true);
    expect(looksLikeCredential('pa$$wort', true)).toBe(true);
    expect(looksLikeCredential('settings.json')).toBe(false);
    expect(looksLikeCredential(`${R}`)).toBe(false);
  });
});

describe('isMostlySecret / sanitizeText', () => {
  it('flags texts that are mainly credentials', () => {
    expect(sanitizeText('OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456').mostlySecret).toBe(true);
    expect(sanitizeText('Das Passwort lautet hunter2').mostlySecret).toBe(true);
    expect(sanitizeText('ghp_abcdefghijklmnopqrstuvwxyz0123456789').mostlySecret).toBe(true);
  });

  it('does not flag explanations that only contain a credential', () => {
    const s = sanitizeText('Der Client verwendet api_key=abcdef123456 für die Sandbox; die Produktion hat einen eigenen Zugang in den Einstellungen.');
    expect(s).toMatchObject({ redacted: true, mostlySecret: false });
    expect(isMostlySecret('Normaler Text', 'Normaler Text')).toBe(false);
  });
});

describe('sanitizeTitle / sanitizeContent / normalizeTags', () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return (e as NovaError).code;
    }
    return null;
  };

  it('normalises and limits titles and contents', () => {
    expect(sanitizeTitle('  Ein   Titel\n mit Umbruch ')).toBe('Ein Titel mit Umbruch');
    expect(code(() => sanitizeTitle(''))).toBe('VALIDATION');
    expect(code(() => sanitizeTitle(42))).toBe('VALIDATION');
    expect(code(() => sanitizeTitle('x'.repeat(301)))).toBe('VALIDATION');
    expect(sanitizeContent(' a\r\nb\rc ')).toBe('a\nb\nc');
    expect(sanitizeContent('')).toBe('');
    expect(code(() => sanitizeContent('x'.repeat(20001)))).toBe('VALIDATION');
    expect(code(() => sanitizeContent('Kennwort: geheim123'))).toBe('VALIDATION');
  });

  it('cleans tags: trimmed, de-duplicated (case-insensitive), no credentials, at most 20', () => {
    expect(normalizeTags([' UI ', 'ui', 'Ärger', 'ärger', '', 7, 'token=abcdef123456', 'x'.repeat(80)])).toEqual(['UI', 'Ärger', 'x'.repeat(60)]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(20);
    expect(normalizeTags(undefined)).toEqual([]);
  });
});
