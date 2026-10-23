// Opaque, sortable-enough IDs with a type prefix, e.g. "task_m3k2...".
import { randomBytes } from 'node:crypto';

export type IdPrefix =
  | 'prj' | 'task' | 'run' | 'apr' | 'rule' | 'prov' | 'use' | 'mem' | 'chk' | 'proc'
  | 'term' | 'crun' | 'err' | 'bak' | 'pull' | 'ntf' | 'inst' | 'req' | 'note' | 'resv' | 'tdj';

export function newId(prefix: IdPrefix): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(8).toString('hex');
  return `${prefix}_${time}${rand}`;
}
