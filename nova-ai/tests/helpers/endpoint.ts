// Test helper: a unique local IPC endpoint for daemon/RPC tests (the same kinds of endpoint the daemon uses).
// - Windows: a named pipe `\\.\pipe\nova-test-<pid>-<name>-<random>`. Pipes live in one machine-wide namespace (not
//   in a folder), so the name must be unique across parallel test workers; a file path cannot be listened on at all
//   (node:net reports EACCES).
// - Other platforms: the unix socket file `<dir>/<name>.sock`. Keep `dir` short: sockaddr_un allows about 104 bytes.
//   Without `name` a random one is used, so several endpoints can share one directory.
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const randomName = () => `nv-${randomBytes(5).toString('hex')}`;

export function testEndpoint(dir: string, name: string = randomName()): string {
  if (process.platform === 'win32') {
    const safe = name.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80);
    return `\\\\.\\pipe\\nova-test-${process.pid}-${safe}-${randomBytes(4).toString('hex')}`;
  }
  return join(dir, `${name}.sock`);
}
