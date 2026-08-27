/**
 * Purpose: the tripwire behind the answer-language directive (spec 058 §1) — reads back what
 * the model actually wrote and, when it is not the language we asked for, hardens the
 * instruction for the rest of that conversation and records a silent failure.
 *
 * It does not take the reply away and try again: the reader watched that text stream in, and
 * swapping it out afterwards is worse than a reply in the wrong language they can still read.
 * Prevention is the directive; this is the check that tells us the directive was ignored.
 * Main exports: noteReplyLanguage, shouldUseFirmDirective, forgetAnswerLanguageWatch.
 */
import { checkReplyLanguage, type ReplyLanguageVerdict } from "@breadcrumb/core-i18n";
import { recordAiFailure } from "./failureLog";
import { currentAnswerLanguage } from "./llmConfig";

/** Conversations whose next round gets the firmer wording. Runtime only — a restart starts
 * over, which is right: the model may well behave next time. */
const conversationsNeedingFirmDirective = new Set<string>();

export function shouldUseFirmDirective(conversationId: string | null): boolean {
  return conversationId !== null && conversationsNeedingFirmDirective.has(conversationId);
}

/**
 * Judges one finished reply. "unknown" (too short, all code) changes nothing — an honest
 * non-verdict must not escalate anything.
 */
export function noteReplyLanguage(
  conversationId: string | null,
  reply: string,
): ReplyLanguageVerdict {
  const expected = currentAnswerLanguage();
  const verdict = checkReplyLanguage(reply, expected);
  if (verdict === "differs") {
    if (conversationId !== null) conversationsNeedingFirmDirective.add(conversationId);
    void recordAiFailure(
      "chat",
      new Error(`reply was not written in ${expected.code} despite the language directive`),
    );
  } else if (verdict === "matches" && conversationId !== null) {
    conversationsNeedingFirmDirective.delete(conversationId);
  }
  return verdict;
}

/** Test seam and language-switch reset: the watch is about the current answer language. */
export function forgetAnswerLanguageWatch(): void {
  conversationsNeedingFirmDirective.clear();
}
