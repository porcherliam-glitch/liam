import { describe, it, expect, afterEach } from 'vitest';
import { RpcContract, type RpcMethod } from '@shared/rpc';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { RpcRouter, Services } from '../contracts';
import { NovaError } from '../core/errors';
import { registerProjectsRpc } from './rpc';
import { createTemplateRegistry } from './template-registry';
import { fakeIntegrations } from './test-support';

let t: TestCore;
afterEach(() => t?.cleanup());

type Handler = (params: unknown, ctx: { requestId: string }) => unknown;

function fakeRouter() {
  const handlers = new Map<string, Handler>();
  const router = {
    register(method: string, handler: Handler) {
      handlers.set(method, handler);
    },
    async handle() {
      throw new Error('not used');
    },
    registered() {
      return [...handlers.keys()];
    },
  } as unknown as RpcRouter;
  const call = async (method: RpcMethod, params: unknown) => {
    const parsed = RpcContract[method].params.parse(params);
    const result = await handlers.get(method)!(parsed, { requestId: 'r1' });
    return RpcContract[method].result.parse(result);
  };
  return { router, handlers, call };
}

const PROJECT = {
  id: 'prj_1',
  name: 'P',
  description: '',
  path: '/x',
  kind: 'web',
  technologies: [],
  status: 'active',
  templateId: null,
  config: {
    commands: { install: null, dev: null, build: null, test: null, lint: null, typecheck: null, e2e: null, security: null, package: null, run: null },
    preview: { kind: 'none', entry: null, url: null },
    allowedCommands: [],
    testAfterChange: true,
    reviewChanges: true,
    autoCommit: true,
    monthlyBudgetUsd: null,
    conventions: '',
    artifactGlobs: [],
    engineVersion: null,
  },
  workState: 'stopped',
  gitAvailable: false,
  createdAt: 1,
  updatedAt: 1,
};

describe('registerProjectsRpc', () => {
  it('registers every method of the module', () => {
    t = createTestCore();
    const { router, handlers } = fakeRouter();
    registerProjectsRpc(router, makeServices(t.core));
    expect([...handlers.keys()].sort()).toEqual(
      [
        'projects.list',
        'projects.get',
        'projects.create',
        'projects.update',
        'projects.detect',
        'projects.remove',
        'projects.setWork',
        'templates.list',
        'checks.list',
        'checks.get',
        'checks.run',
        'checks.cancel',
        'preview.status',
        'preview.start',
        'preview.stop',
      ].sort(),
    );
  });

  it('projects.setWork is an alias for work.start/stop({projectId})', async () => {
    t = createTestCore();
    const calls: string[] = [];
    const s = makeServices(t.core, {
      projects: { require: () => PROJECT } as unknown as Services['projects'],
      work: {
        start: (id?: string) => {
          calls.push(`start:${id}`);
          return {};
        },
        stop: (id?: string) => {
          calls.push(`stop:${id}`);
          return {};
        },
      } as unknown as Services['work'],
    });
    const { router, call } = fakeRouter();
    registerProjectsRpc(router, s);
    await call('projects.setWork', { id: 'prj_1', enabled: true });
    await call('projects.setWork', { id: 'prj_1', enabled: false });
    expect(calls).toEqual(['start:prj_1', 'stop:prj_1']);
  });

  it('checks.run starts a user check; checks.get throws NOT_FOUND; remove returns ok', async () => {
    t = createTestCore();
    const started: unknown[] = [];
    const run = { id: 'chk_1', projectId: 'prj_1', taskId: null, kind: 'test', command: 'npm test', status: 'running', passed: null, failed: null, skipped: null, durationMs: null, outputTail: '', failures: [], failureSignature: null, message: null, processId: null, artifacts: [], startedAt: 1, finishedAt: null };
    const s = makeServices(t.core, {
      checks: {
        start: (input: unknown) => {
          started.push(input);
          return run;
        },
        get: () => null,
      } as unknown as Services['checks'],
      projects: { remove: async () => undefined } as unknown as Services['projects'],
    });
    const { router, call } = fakeRouter();
    registerProjectsRpc(router, s);
    expect(await call('checks.run', { projectId: 'prj_1', kind: 'test' })).toMatchObject({ status: 'running' });
    expect(started).toEqual([{ projectId: 'prj_1', kind: 'test', actor: 'user' }]);
    await expect(call('checks.get', { id: 'chk_x' })).rejects.toBeInstanceOf(NovaError);
    expect(await call('projects.remove', { id: 'prj_1' })).toEqual({ ok: true });
  });

  it('templates.list returns the built-in templates with missing tools', async () => {
    t = createTestCore();
    const s = makeServices(t.core, { integrations: fakeIntegrations({ node: true, dotnet: false }) as unknown as Services['integrations'] });
    s.templates = createTemplateRegistry(s);
    const { router, call } = fakeRouter();
    registerProjectsRpc(router, s);
    const list = (await call('templates.list', {})) as { id: string; missingTools: string[] }[];
    expect(list.map((x) => x.id)).toEqual(['web-game', 'web-app', 'unity', 'desktop-dotnet', 'backend-api', 'empty']);
    expect(list.find((x) => x.id === 'desktop-dotnet')?.missingTools).toEqual(['dotnet']);
    expect(list.find((x) => x.id === 'web-app')?.missingTools).toEqual([]);
    expect(list.find((x) => x.id === 'unity')?.missingTools).toEqual(['unity']);
  });

  it('template registry: register validates ids; failing integrations → no missing tools', async () => {
    t = createTestCore();
    const s = makeServices(t.core, {
      integrations: {
        list: async () => {
          throw new Error('kaputt');
        },
        resolvePath: async () => null,
      } as unknown as Services['integrations'],
    });
    const reg = createTemplateRegistry(s);
    expect(() => reg.register({ info: { id: 'Bad Id' } } as never)).toThrow(/Kennung/);
    const list = await reg.list();
    expect(list.every((x) => x.missingTools.length === 0)).toBe(true);
    expect(reg.get('web-game')?.info.name).toBe('Browserspiel');
    expect(reg.get('nope')).toBeNull();
  });
});
