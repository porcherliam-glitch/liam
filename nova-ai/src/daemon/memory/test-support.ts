// Test support for the memory module (not exported by the barrel): a real CoreContext on a temp dir, a small
// hand-written ProjectService fake and a recorder for memory.updated events.
import type { NovaEventMap } from '@shared/events';
import type { Project } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { ProjectService, Services } from '../contracts';
import { createMemoryService, type MemoryServiceImpl, type MemoryServiceOptions } from './memory-service';

export function makeProject(p: { id: string; name: string; path: string }): Project {
  return {
    id: p.id,
    name: p.name,
    description: '',
    path: p.path,
    kind: 'web',
    technologies: [],
    status: 'active',
    templateId: null,
    origin: 'new',
    config: {
      commands: { install: null, dev: null, build: null, test: null, lint: null, typecheck: null, e2e: null, security: null, package: null, run: null },
      preview: { kind: 'none', entry: null, url: null },
      allowedCommands: [],
      testAfterChange: true,
      reviewChanges: false,
      autoCommit: false,
      monthlyBudgetUsd: null,
      conventions: '',
      artifactGlobs: [],
      engineVersion: null,
    },
    workState: 'running',
    gitAvailable: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

export interface FakeProjects {
  service: ProjectService;
  add(p: { id: string; name: string; path: string }): Project;
  /** Removes the row like ProjectService.remove does before it calls memory.removeProject. */
  drop(id: string): void;
}

export function fakeProjects(initial: Array<{ id: string; name: string; path: string }> = []): FakeProjects {
  const rows = new Map<string, Project>();
  for (const p of initial) rows.set(p.id, makeProject(p));
  const service = {
    get: (id: string) => rows.get(id) ?? null,
    require: (id: string) => {
      const p = rows.get(id);
      if (!p) throw new Error(`project ${id} missing`);
      return p;
    },
    list: () => [...rows.values()],
  } as unknown as ProjectService;
  return {
    service,
    add(p) {
      const project = makeProject(p);
      rows.set(p.id, project);
      return project;
    },
    drop(id) {
      rows.delete(id);
    },
  };
}

export type MemoryEvent = NovaEventMap['memory.updated'];

export interface MemoryHarness {
  t: TestCore;
  s: Services;
  memory: MemoryServiceImpl;
  projects: FakeProjects;
  events: MemoryEvent[];
  setClock(ts: number): void;
  cleanup(): void;
}

export function memoryHarness(
  projects: Array<{ id: string; name: string; path: string }> = [
    { id: 'prj_a', name: 'Sternenjäger', path: '/home/max/projekte/sternenjaeger' },
    { id: 'prj_b', name: 'Kassenbuch', path: '/home/max/projekte/kassenbuch' },
  ],
  options: MemoryServiceOptions = {},
): MemoryHarness {
  const t = createTestCore();
  let clock = 1_700_000_000_000;
  t.core.clock = { now: () => clock };
  const fp = fakeProjects(projects);
  const s = makeServices(t.core, { projects: fp.service });
  const memory = createMemoryService(s, options);
  s.memory = memory;
  const events: MemoryEvent[] = [];
  t.core.bus.on('memory.updated', (e) => events.push(e));
  return {
    t,
    s,
    memory,
    projects: fp,
    events,
    setClock(ts) {
      clock = ts;
    },
    cleanup: () => t.cleanup(),
  };
}
