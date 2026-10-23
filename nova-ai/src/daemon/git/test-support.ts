// Test helpers for the git module (imported by *.test.ts only): real git repositories in temporary directories with
// an isolated global git config (GIT_CONFIG_GLOBAL in the temp dir, GIT_CONFIG_NOSYSTEM) so the developer's own
// identity/settings never influence results, plus small hand-written fakes for the services GitService touches.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Approval, ApprovalKind, ProjectSummary } from '@shared/schemas';
import type { ApprovalCheck, ApprovalRequest, ApprovalService, Services } from '../contracts';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { createGitService, type GitServiceOptions } from './git-service';

export interface GitFixture {
  t: TestCore;
  s: Services;
  git: ReturnType<typeof createGitService>;
  /** Scratch root for repositories (cleaned up). */
  dir: string;
  env: Record<string, string>;
  approvals: FakeApprovals;
  /** Runs git in cwd with the isolated config; returns stdout. */
  sh(cwd: string, ...args: string[]): string;
  /** Creates a repository with identity configured (unless identity=false). */
  repo(name: string, opts?: { identity?: boolean; files?: Record<string, string>; commit?: boolean }): string;
  write(root: string, rel: string, content: string | Buffer): void;
  cleanup(): void;
}

export interface FakeApprovals extends ApprovalService {
  requests: ApprovalRequest[];
  consumed: string[];
  acknowledged: string[];
  /** Next check() answer; default: pending. */
  answer: 'approved' | 'denied' | 'pending' | 'rule';
  /** Simulates the user's decision (fires onDecision listeners). */
  decide(id: string, decision: 'approve' | 'deny'): Approval;
}

export function fakeApprovals(): FakeApprovals {
  const listeners = new Set<(a: Approval) => void>();
  const store = new Map<string, Approval>();
  let n = 0;
  const make = (req: ApprovalRequest, status: Approval['status']): Approval => {
    const a: Approval = {
      id: `apr_${++n}`,
      projectId: req.projectId,
      taskId: req.taskId ?? null,
      runId: req.runId ?? null,
      kind: req.kind as ApprovalKind,
      fingerprint: `${req.kind}|${req.subject}`,
      title: req.title,
      action: req.action,
      consequences: req.consequences,
      details: req.details ?? {},
      status,
      scope: status === 'pending' ? null : 'once',
      createdAt: Date.now(),
      decidedAt: status === 'pending' ? null : Date.now(),
    };
    store.set(a.id, a);
    return a;
  };
  const fake: FakeApprovals = {
    requests: [],
    consumed: [],
    acknowledged: [],
    answer: 'pending',
    fingerprint: (kind, projectId, subject) => `${kind}|${projectId}|${subject}`,
    check(req): ApprovalCheck {
      fake.requests.push(req);
      if (fake.answer === 'rule') return { state: 'approved', approval: null, viaRule: true };
      if (fake.answer === 'approved') return { state: 'approved', approval: make(req, 'approved'), viaRule: false };
      if (fake.answer === 'denied') return { state: 'denied', approval: make(req, 'denied') };
      const existing = [...store.values()].find((a) => a.status === 'pending' && a.fingerprint === `${req.kind}|${req.subject}`);
      return { state: 'pending', approval: existing ?? make(req, 'pending') };
    },
    peek: () => null,
    consume: (id) => {
      fake.consumed.push(id);
    },
    acknowledgeDenial: (id) => {
      fake.acknowledged.push(id);
    },
    get: (id) => store.get(id) ?? null,
    list: () => [...store.values()],
    decide(id, decision) {
      const a = store.get(id);
      if (!a) throw new Error('unknown approval');
      a.status = decision === 'approve' ? 'approved' : 'denied';
      a.scope = 'once';
      a.decidedAt = Date.now();
      for (const l of listeners) l({ ...a });
      return { ...a };
    },
    waitFor: async (id) => store.get(id)!,
    onDecision(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    rules: () => [],
    deleteRule: () => undefined,
    pendingCount: () => [...store.values()].filter((a) => a.status === 'pending').length,
    expireForTask: () => undefined,
    expireForProject: () => undefined,
    prune: () => 0,
  };
  return fake;
}

export function gitFixture(opts: GitServiceOptions & { projects?: Partial<Services['projects']>; extra?: Partial<Omit<Services, 'core'>> } = {}): GitFixture {
  const t = createTestCore();
  const scratch = tempDir('nova-git-');
  const globalConfig = join(scratch.dir, 'global.gitconfig');
  writeFileSync(globalConfig, '');
  const env: Record<string, string> = { GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1', ...(opts.extraEnv ?? {}) };
  const approvals = fakeApprovals();
  const projects = {
    list: (): ProjectSummary[] => [],
    refreshGit: async () => {
      throw new Error('not needed');
    },
    ...(opts.projects ?? {}),
  } as unknown as Services['projects'];
  const s = makeServices(t.core, { approvals, projects, ...(opts.extra ?? {}) });
  const git = createGitService(s, { gitPath: 'git', ...opts, extraEnv: env });
  const childEnv: Record<string, string | undefined> = { ...process.env, ...env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete childEnv[k];
  const sh = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (root: string, rel: string, content: string | Buffer) => {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  };
  const repo: GitFixture['repo'] = (name, o = {}) => {
    const root = join(scratch.dir, name);
    mkdirSync(root, { recursive: true });
    sh(root, 'init', '-q', '--initial-branch=main');
    if (o.identity !== false) {
      sh(root, 'config', 'user.name', 'Test User');
      sh(root, 'config', 'user.email', 'test@example.com');
    }
    for (const [rel, content] of Object.entries(o.files ?? {})) write(root, rel, content);
    if (o.commit !== false && Object.keys(o.files ?? {}).length > 0) {
      sh(root, 'add', '-A');
      sh(root, '-c', 'user.name=Setup', '-c', 'user.email=setup@example.com', 'commit', '-q', '-m', 'Initial commit');
    }
    return root;
  };
  return {
    t,
    s,
    git,
    dir: scratch.dir,
    env,
    approvals,
    sh,
    repo,
    write,
    cleanup() {
      t.cleanup();
      scratch.cleanup();
    },
  };
}
