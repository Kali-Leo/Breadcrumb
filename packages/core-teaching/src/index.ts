/**
 * Purpose: public surface of the teaching-contract package.
 * Main exports: buildTeachingSystemPrompt, buildFreeChatSystemPrompt, TEACHING_CONTRACT_BASE,
 * FREE_CHAT_BASE, LearnerContext, formatLearnerContextMessage, detectConfusion.
 */

export { detectConfusion } from "./confusion";
export {
  buildFreeChatSystemPrompt,
  buildTeachingSystemPrompt,
  FREE_CHAT_BASE,
  TEACHING_CONTRACT_BASE,
} from "./contract";
export { formatLearnerContextMessage, type LearnerContext } from "./learnerContext";
