import { describe, expect, it } from 'vitest';
import { NovaRpcError } from '../../../lib/api';
import { defaultSettings } from '@shared/settings';
import { fromDraftValue, readSetting, SECTIONS, toDraftValue } from '../fields';
import { isHttpUrl, isLocalUrl, issueFor, numberToInput, parseNumber, rpcIssues, sameValue, unmatchedIssues } from './forms';
import { safeFileName, todayStamp } from './files';
import { isValidModelName, modelUsability, parseRefKey, pullPhaseLabel, refKey, sameModelName } from '../../models/modelUtils';

describe('forms helpers', () => {
  it('parses German and English numbers with rules', () => {
    expect(parseNumber('2,5')).toEqual({ value: 2.5 });
    expect(parseNumber('2.5')).toEqual({ value: 2.5 });
    expect(parseNumber('', { nullable: true })).toEqual({ value: null });
    expect(parseNumber('')).toEqual({ error: 'Bitte einen Wert eingeben.' });
    expect(parseNumber('1,5', { int: true }).error).toBe('Bitte eine ganze Zahl eingeben.');
    expect(parseNumber('9', { max: 8 }).error).toBe('Darf höchstens 8 sein.');
    expect(parseNumber('1000', { min: 2048 }).error).toBe('Muss mindestens 2.048 sein.');
    expect(parseNumber('abc').error).toBe('Bitte eine Zahl eingeben (z. B. 2,5).');
    expect(numberToInput(0.2)).toBe('0,2');
    expect(numberToInput(null)).toBe('');
  });

  it('reads validation issues in both formats and replaces English zod messages', () => {
    const joined = new NovaRpcError('VALIDATION', 'x', { details: { issues: [{ path: 'permissions.commandAllowlist[2]', message: 'Ungültig hier' }] } });
    expect(rpcIssues(joined)).toEqual({ 'permissions.commandAllowlist.2': 'Ungültig hier' });
    const raw = new NovaRpcError('VALIDATION', 'x', { details: [{ path: ['agents', 'maxAttempts'], message: 'Too big: expected number to be <=10' }] });
    expect(rpcIssues(raw)).toEqual({ 'agents.maxAttempts': 'Dieser Wert ist nicht erlaubt.' });
    expect(rpcIssues(new NovaRpcError('CONFLICT', 'x'))).toEqual({});
    expect(issueFor({ 'permissions.commandAllowlist.2': 'A' }, 'permissions.commandAllowlist')).toBe('A');
    expect(unmatchedIssues({ a: 'x', 'b.c': 'y' }, ['b'])).toEqual(['x']);
  });

  it('checks URLs and compares values', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('ftp://example.com')).toBe(false);
    expect(isLocalUrl('http://127.0.0.1:11434')).toBe(true);
    expect(isLocalUrl('http://localhost:1234/v1')).toBe(true);
    expect(isLocalUrl('http://[::1]:8080')).toBe(true);
    expect(isLocalUrl('https://api.openai.com/v1')).toBe(false);
    expect(sameValue(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameValue(['a'], ['b'])).toBe(false);
  });

  it('builds safe file names', () => {
    expect(safeFileName('Pixel: Abenteuer?')).toBe('Pixel Abenteuer');
    expect(todayStamp(new Date(2026, 0, 5).getTime())).toBe('2026-01-05');
  });
});

describe('settings field definitions', () => {
  it('cover every field of the settings sections shown on the page (models/budgets live on their pages)', () => {
    const defaults = defaultSettings();
    const covered = new Set(SECTIONS.flatMap((s) => s.fields.map((f) => f.path)));
    const handledElsewhere = new Set(['general.language', 'general.theme', 'background.autostart']);
    for (const [section, values] of Object.entries(defaults)) {
      if (section === 'models' || section === 'budgets') continue;
      for (const key of Object.keys(values as object)) {
        const path = `${section}.${key}`;
        expect(covered.has(path as never) || handledElsewhere.has(path), `${path} has no field`).toBe(true);
      }
    }
  });

  it('round-trips default values through the draft representation', () => {
    const defaults = defaultSettings();
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const raw = readSetting(defaults, field.path);
        const parsed = fromDraftValue(field, toDraftValue(field, raw));
        expect(parsed.error, field.path).toBeUndefined();
        expect(parsed.value, field.path).toEqual(raw);
      }
    }
  });
});

describe('model helpers', () => {
  it('handles model references and names', () => {
    expect(refKey({ providerId: 'openrouter', modelId: 'qwen/qwen3-coder' })).toBe('openrouter/qwen/qwen3-coder');
    expect(parseRefKey('openrouter/qwen/qwen3-coder')).toEqual({ providerId: 'openrouter', modelId: 'qwen/qwen3-coder' });
    expect(parseRefKey('kaputt')).toBeNull();
    expect(sameModelName('mistral-nemo', 'mistral-nemo:latest')).toBe(true);
    expect(isValidModelName('hf.co/user/repo:Q4_K_M')).toBe(true);
    expect(isValidModelName('bad name')).toBe(false);
    expect(pullPhaseLabel({ phase: 'verifying sha256 digest', status: 'running' })).toBe('Download wird überprüft');
  });

  it('blocks paid models without approval or price', () => {
    const provider = { id: 'p', type: 'openai_compatible' as const, name: 'P', baseUrl: 'https://x', enabled: true, paid: true, approved: false, hasApiKey: true, options: {}, createdAt: 0, updatedAt: 0 };
    const model = { providerId: 'p', id: 'm', displayName: 'm', local: false, paid: true, sizeBytes: null, parameterSize: null, quantization: null, family: null, contextLength: null, capabilities: [], pricing: null, modifiedAt: null };
    expect(modelUsability(model, provider)).toEqual({ usable: false, reason: 'kostenpflichtig – nicht freigegeben' });
    expect(modelUsability(model, { ...provider, approved: true })).toEqual({ usable: false, reason: 'kostenpflichtig – Preis fehlt' });
    expect(modelUsability({ ...model, pricing: { inputPerMTokUsd: 1, outputPerMTokUsd: 2, estimated: true } }, { ...provider, approved: true }).usable).toBe(true);
    expect(modelUsability(model, { ...provider, enabled: false }).reason).toBe('Anbieter ausgeschaltet');
  });
});
