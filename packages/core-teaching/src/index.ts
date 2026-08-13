/**
 * Purpose: public surface of the teaching-contract package (spec 038).
 * Main exports: TeachingMode, buildTeachingSystemPrompt, TEACHING_CONTRACT_BASE,
 * LearnerContext, formatLearnerContextMessage, detectConfusion.
 */

export { detectConfusion } from "./confusion";
export {
  buildTeachingSystemPrompt,
  TEACHING_CONTRACT_BASE,
  type TeachingMode,
} from "./contract";
export { formatLearnerContextMessage, type LearnerContext } from "./learnerContext";
