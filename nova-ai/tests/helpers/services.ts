// Test helper: a Services container where every service you do not provide throws a clear error
// ("<service>.<method> not provided in this test") instead of silently returning undefined.
import type { Services, CoreContext } from '../../src/daemon/contracts';

function missing(name: string): unknown {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') return undefined; // allow awaiting the proxy itself
        return () => {
          throw new Error(`${name}.${String(prop)} not provided in this test`);
        };
      },
    },
  );
}

export function makeServices(core: CoreContext, provided: Partial<Omit<Services, 'core'>> = {}): Services {
  const target = { core, ...provided } as Record<string, unknown>;
  return new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      const m = missing(prop);
      t[prop] = m;
      return m;
    },
    set(t, prop: string, value) {
      t[prop] = value;
      return true;
    },
  }) as unknown as Services;
}
