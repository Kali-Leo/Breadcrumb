/**
 * Purpose: the mirror modules' sentences that need a decision made in logic — which label a
 * small win gets, which evidence line a mastery claim produces (spec 058 §2). The wording
 * lives in the app's palace.json; nothing here is user-visible text.
 * Main exports: activityMessage, heatmapCellMessage, reunionOpenerMessage, newConceptMessage,
 * reencounterMessage, wordGuessMessage, teachSessionMessage, evidenceClaimMessage.
 */
import type { MasteryClaimLevel } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";

/** Heatmap summary: cumulative active days only — run/streak counts were ruled out (a broken
 * run reads as a whip; the cumulative count keeps investment visible). */
export function activityMessage(activeDays: number): CopyMessage {
  return { key: "palace:mirror.activeDays", params: { count: activeDays } };
}

/** Per-cell hover line for the heatmap — the count is a plain fact, never a target or gap.
 * The date arrives as "YYYY-MM-DD"; formatting it is the app's job, so it is passed through. */
export function heatmapCellMessage(date: string, count: number): CopyMessage {
  return count === 0
    ? { key: "palace:mirror.heatmapCellEmpty", params: { date } }
    : { key: "palace:mirror.heatmapCell", params: { date, count } };
}

/** Reunion session opener — composed locally at creation time (zero LLM). Seeding the chat
 * with this assistant turn gives the model and the learner the same context: a purposeful
 * entry point must never land in a context-less conversation (Leo 2026-08-13). */
export function reunionOpenerMessage(title: string): CopyMessage {
  return { key: "palace:mirror.reunionOpener", params: { title } };
}

/** Small-wins label: a node met for the first time inside the window. */
export function newConceptMessage(title: string): CopyMessage {
  return { key: "palace:mirror.newConcept", params: { title } };
}

/** Small-wins label: a node met again inside the window, first met before it. */
export function reencounterMessage(title: string): CopyMessage {
  return { key: "palace:mirror.reencounter", params: { title } };
}

/** Small-wins label: a woven word guessed correctly or closely inside the window. */
export function wordGuessMessage(lemma: string, isClose: boolean): CopyMessage {
  return {
    key: isClose ? "palace:mirror.wordGuessClose" : "palace:mirror.wordGuessCorrect",
    params: { word: lemma },
  };
}

/** Small-wins label: a teach-back conversation held inside the window. */
export function teachSessionMessage(title: string): CopyMessage {
  return { key: "palace:mirror.teachSession", params: { title } };
}

/** Evidence section's per-claim label — which plain fact produced the mastery claim. */
export function evidenceClaimMessage(level: MasteryClaimLevel): CopyMessage {
  switch (level) {
    case "learned":
      return { key: "palace:mirror.evidenceClaimLearned" };
    case "familiar":
      return { key: "palace:mirror.evidenceClaimFamiliar" };
    case "taught_principled":
      return { key: "palace:mirror.evidenceClaimTaughtPrincipled" };
    case "taught_surface":
      return { key: "palace:mirror.evidenceClaimTaughtSurface" };
    default:
      return level satisfies never;
  }
}
