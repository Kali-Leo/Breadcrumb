/**
 * Purpose: the review-debt measure that throttles new-word intake — counts only due words
 * the conversation can still deliver. Counting every due row makes the throttle self-locking:
 * a word whose topic has left the chat can never be re-met, so it sits in the debt forever and
 * pins intake at ~1 word/day within a week.
 * Main exports: createMeetableDebtWindow, MEETABLE_WINDOW_MESSAGES.
 */

/** How many recently woven assistant replies count as "the conversation as it stands" —
 * roughly the current sitting at the ~6 replies/day this app sees. The window size is a
 * tuned trade-off: windows of 5 collapse consolidation (the throttle stops working), windows
 * of 30+ leave most of the intake lock-up in place. */
export const MEETABLE_WINDOW_MESSAGES = 10;

export interface MeetableDebtWindow {
  /** Records the candidate lemmas one woven message offered — the recurrence evidence. */
  noteMessageCandidates(lemmas: readonly string[]): void;
  /** How many of the due lemmas are still in circulation. */
  countMeetable(dueLemmas: readonly string[]): number;
}

/** A rolling window over the last MEETABLE_WINDOW_MESSAGES messages' candidate lemmas.
 * Session-scoped by design: after a restart the window refills from the messages the learner
 * actually reads, and until it does the throttle simply stays open — the daily new-word cap
 * and the per-message budget still bound intake. */
export function createMeetableDebtWindow(
  windowSize: number = MEETABLE_WINDOW_MESSAGES,
): MeetableDebtWindow {
  const recent: string[][] = [];
  return {
    noteMessageCandidates(lemmas) {
      if (lemmas.length === 0) return;
      recent.push([...lemmas]);
      while (recent.length > windowSize) recent.shift();
    },
    countMeetable(dueLemmas) {
      const inCirculation = new Set(recent.flat());
      return dueLemmas.filter((lemma) => inCirculation.has(lemma)).length;
    },
  };
}
