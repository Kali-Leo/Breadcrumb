/**
 * Purpose: public surface of the teaching-contract package (spec 038, revised 2026-08-14).
 * Main exports: buildTeachingSystemPrompt, TEACHING_CONTRACT_BASE,
 * LearnerContext, formatLearnerContextMessage, detectConfusion.
 */

export { detectConfusion } from "./confusion";
export { buildTeachingSystemPrompt, TEACHING_CONTRACT_BASE } from "./contract";
export { formatLearnerContextMessage, type LearnerContext } from "./learnerContext";
export {
  buildReunionSystemLine,
  isReunionTitle,
  REUNION_TITLE_PREFIX,
  reunionTopicFromTitle,
} from "./reunion";
