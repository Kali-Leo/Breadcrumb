/**
 * Purpose: run the fact check by itself on every 学习模式 answer, instead of waiting for a
 * button nobody presses. The evidence is unambiguous: citations raise trust even when they are
 * random, the people who open them trust the answer *less*, and under 10% of answers ever get
 * opened at all (Ding et al., AAAI 2025, N=303) — so a "求证" button is an entrance only the
 * already-suspicious use, while the reader who needs the check never asks for one.
 *
 * Everything here is the policy around that decision; the run itself belongs to the store.
 * Three restraints, because an automatic call spends someone's quota:
 *  - one attempt per answer, ever — a round that failed is not retried behind the reader's back
 *  - a session breaker — after two failures in a row (a spent daily quota looks exactly like
 *    this) the automatic runs stop until the app restarts, instead of printing an error under
 *    every further answer. The button still works, so nothing is taken away.
 *  - both switches are obeyed: the feature's own switch, and the automatic-run switch beside it.
 * Side effect on import: subscribes to chat:responseFinished.
 * Main exports: shouldAutoCheck, autoCheckFinishedRound.
 */
import { appEventBus, useChatStore } from "../../stores/chatStore";
import { useFactcheckStore } from "../../stores/factcheckStore";
import { useSettingsStore } from "../../stores/settingsStore";

/**
 * Failures in a row before the automatic runs stand down for the rest of the session. Two,
 * because one is a network wobble and two in a row is a condition — an exhausted daily request
 * quota (a free tier is commonly 50 requests a day, and one check spends up to five of them)
 * being the likeliest of them.
 */
export const AUTO_FAILURE_LIMIT = 2;

/** Messages an automatic run has already been attempted for, successful or not. */
const attempted = new Set<string>();
let consecutiveFailures = 0;
let pausedForSession = false;

/** Everything that must hold before we spend a request on an answer nobody asked us to check. */
export function shouldAutoCheck(input: {
  factcheckEnabled: boolean;
  autoEnabled: boolean;
  studyMode: boolean;
  networkEnabled: boolean;
  hasApiConfig: boolean;
  alreadyChecked: boolean;
  alreadyAttempted: boolean;
  paused: boolean;
}): boolean {
  return (
    input.factcheckEnabled &&
    input.autoEnabled &&
    input.studyMode &&
    input.networkEnabled &&
    input.hasApiConfig &&
    !input.alreadyChecked &&
    !input.alreadyAttempted &&
    !input.paused
  );
}

/** Resets the session state. Tests only — a running app has exactly one session. */
export function resetAutoFactcheckState(): void {
  attempted.clear();
  consecutiveFailures = 0;
  pausedForSession = false;
}

export async function autoCheckFinishedRound(
  conversationId: string,
  messageId: string,
): Promise<void> {
  const settings = useSettingsStore.getState();
  const factcheck = useFactcheckStore.getState();
  const allowed = shouldAutoCheck({
    factcheckEnabled: settings.featureSwitches.factcheck,
    autoEnabled: settings.featureSwitches.factcheckAuto,
    studyMode: useChatStore.getState().studyModeFor(conversationId),
    networkEnabled: settings.networkEnabled,
    hasApiConfig: settings.apiConfig !== null,
    alreadyChecked: factcheck.claimsByConversation.get(conversationId)?.has(messageId) === true,
    alreadyAttempted: attempted.has(messageId),
    paused: pausedForSession,
  });
  if (!allowed) return;

  attempted.add(messageId);
  await factcheck.checkMessage(conversationId, messageId);

  // The run reports itself by what it left behind: a claim list (even an empty one) means the
  // check completed. Reading that rather than a thrown error keeps the store's one honest
  // record of "this round was checked" as the only thing this has to agree with.
  const landed =
    useFactcheckStore.getState().claimsByConversation.get(conversationId)?.has(messageId) === true;
  if (landed) {
    consecutiveFailures = 0;
    return;
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= AUTO_FAILURE_LIMIT) {
    pausedForSession = true;
    useFactcheckStore.getState().noteAutoPaused(messageId);
  }
}

appEventBus.on("chat:responseFinished", ({ conversationId, messageId }) => {
  void autoCheckFinishedRound(conversationId, messageId);
});
