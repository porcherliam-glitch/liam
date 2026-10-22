// Tests for blockerAction (UI-SPEC §7): each task blocker code leads to the page where the user can resolve it.
import { describe, expect, it } from 'vitest';
import { blockerAction } from './labels';
import { paths } from './paths';

describe('blockerAction', () => {
  it('R5-5: missing price and missing paid-use approval lead to the models page, a reached budget to the costs page', () => {
    expect(blockerAction('PRICE_UNKNOWN')).toEqual({ label: 'Modelle und Preise', path: paths.models });
    expect(blockerAction('PAID_NOT_APPROVED')).toEqual({ label: 'Modelle und Preise', path: paths.models });
    expect(blockerAction('BUDGET_EXCEEDED')).toEqual({ label: 'Kosten und Budget', path: paths.costs });
  });

  it('maps the other codes and returns null for unknown ones', () => {
    expect(blockerAction('NO_MODEL')?.path).toBe(paths.models);
    expect(blockerAction('APPROVAL_REQUIRED')?.path).toBe('/approvals');
    expect(blockerAction('NEEDS_INPUT')).toEqual({ label: 'Frage beantworten', path: null });
    expect(blockerAction('SOMETHING_ELSE')).toBeNull();
    expect(blockerAction(null)).toBeNull();
  });
});
