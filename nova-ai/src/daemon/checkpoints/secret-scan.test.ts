// Unit tests of the commit secret scan: real credentials count everywhere, ordinary code references do not.
import { describe, expect, it } from 'vitest';
import { countSecretLines, looksBinary } from './secret-scan';

describe('countSecretLines', () => {
  it('flags literal credentials and known token formats in code', () => {
    expect(countSecretLines('src/a.ts', "const apiKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';")).toBe(1);
    expect(countSecretLines('src/a.ts', 'const password = "hunter2hunter";')).toBe(1);
    expect(countSecretLines('src/a.js', '// ghp_abcdefghijklmnopqrstuvwxyz0123456789')).toBe(1);
    expect(countSecretLines('src/a.py', 'aws = AKIAABCDEFGHIJKLMNOP')).toBe(1);
    expect(countSecretLines('key.txt', '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n')).toBe(1);
  });

  it('ignores identifiers, member access, calls and types in code files', () => {
    const code = [
      'const password = form.password.value;',
      'export const token = getToken();',
      'let token: string;',
      'fetch(url, { token: process.env.TOKEN });',
      'password = os.environ["DB_PASSWORD"]',
      'const auth = this.authService.current(user, 1);',
      'apiKey?: Promise<string>;',
    ].join('\n');
    expect(countSecretLines('src/login.ts', code)).toBe(0);
    expect(countSecretLines('src/x.py', 'password = os.environ["DB_PASSWORD"]')).toBe(0);
  });

  it('counts every match in non-code files (env, json, yaml, shell)', () => {
    expect(countSecretLines('.env', 'DB_PASSWORD=hunter2hunter\nOTHER=1\n')).toBe(1);
    expect(countSecretLines('config.json', '{ "token": "abcdef123456" }')).toBe(1);
    expect(countSecretLines('deploy.sh', 'PASSWORD=form.password.value')).toBe(1);
    expect(countSecretLines('README.md', 'Kein Geheimnis hier.')).toBe(0);
  });
});

describe('looksBinary', () => {
  it('detects NUL bytes', () => {
    expect(looksBinary(Buffer.from([65, 0, 66]))).toBe(true);
    expect(looksBinary(Buffer.from('text'))).toBe(false);
  });
});
