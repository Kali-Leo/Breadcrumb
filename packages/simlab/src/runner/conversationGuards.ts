/**
 * Purpose: small guard helpers for runConversation (conversation.ts) — split out to keep
 * that file under the file-size ceiling. Empty-reply retry (S1) and topic-hint/opener
 * mismatch telemetry (S3) are both mechanical, unrelated-in-content checks around one round.
 * Main exports: withEmptyRetry, logTopicHintMismatchIfAny.
 */
import type { JourneyLogWriter } from "./artifacts";
import type { TopicHint } from "./student";

/** Retries a fallible reply call exactly once when its content trims to empty (a model
 * quirk, not a real silent turn); returns whatever the (possibly still-empty) retry got. */
export async function withEmptyRetry<T extends { content: string }>(
  fn: () => Promise<T>,
): Promise<T> {
  const first = await fn();
  if (first.content.trim() !== "") return first;
  return fn();
}

/** A concrete labeled hint (follow-frontier/revisit-old-topic — not a domain jump) is a
 * *nudge*, not a guarantee: the student model may still open on something else. Logs a
 * soft mismatch event rather than failing the round, so the pipeline metrics can surface
 * "action decision vs. actual opener" coherence without gating the run on it. */
export function logTopicHintMismatchIfAny(
  log: JourneyLogWriter,
  topicHint: TopicHint | undefined,
  studentOpenerContent: string,
  context: { day: number; conversationId: string; round: number },
): void {
  if (topicHint === undefined || topicHint.isDomainJump || topicHint.label === null) return;
  if (studentOpenerContent.includes(topicHint.label)) return;
  log.writeLine({
    event: "topic-hint-mismatch",
    ...context,
    expectedLabel: topicHint.label,
  });
}
