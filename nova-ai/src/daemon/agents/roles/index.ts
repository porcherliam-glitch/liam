// Built-in agent role modules (exchangeable via AgentRunner.registerRole).
import type { NovaRoleModule } from './common';
import { createPlannerRole } from './planner';
import { createCoderRole } from './coder';
import { createTesterRole } from './tester';
import { createReviewerRole } from './reviewer';

export { createPlannerRole, PLANNER_TOOLS } from './planner';
export { createCoderRole, CODER_TOOLS } from './coder';
export { createTesterRole, TESTER_TOOLS } from './tester';
export { createReviewerRole, REVIEWER_TOOLS } from './reviewer';
export type { NovaRoleModule } from './common';

export function builtinRoles(): NovaRoleModule[] {
  return [createPlannerRole(), createCoderRole(), createTesterRole(), createReviewerRole()];
}
