/**
 * Purpose: public surface of the teaching-contract package.
 * Main exports: buildTeachingSystemPrompt, buildFreeChatSystemPrompt, TEACHING_CONTRACT_BASE,
 * GROUNDED_TEACHING_CLAUSE,
 * FREE_CHAT_BASE, LearnerContext, formatLearnerContextMessage, detectConfusion.
 */

export { detectConfusion } from "./confusion";
export {
  buildFreeChatSystemPrompt,
  buildTeachingSystemPrompt,
  FREE_CHAT_BASE,
  GROUNDED_TEACHING_CLAUSE,
  TEACHING_CONTRACT_BASE,
} from "./contract";
export { formatLearnerContextMessage, type LearnerContext } from "./learnerContext";
