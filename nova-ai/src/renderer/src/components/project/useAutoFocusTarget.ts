import { useMemo, useRef, type RefObject } from 'react';

/**
 * Initial focus for <Dialog initialFocus>: the first `[data-autofocus]` element inside `container`
 * (Dialog would otherwise focus its close button, which comes first in the DOM).
 * @example const focus = useAutoFocusTarget<HTMLFormElement>(); <Dialog initialFocus={focus.target}><form ref={focus.container}>…
 */
export function useAutoFocusTarget<T extends HTMLElement>() {
  const container = useRef<T>(null);
  const target = useMemo(
    () =>
      ({
        get current() {
          return container.current?.querySelector<HTMLElement>('[data-autofocus]') ?? null;
        },
      }) as RefObject<HTMLElement | null>,
    [],
  );
  return { container, target };
}
