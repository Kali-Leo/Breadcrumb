/**
 * Purpose: the diglot weave's persisted settings — their shape, their defaults, the settings
 * row key they live under, and the record of which of them actually feed patch computation.
 * Split out of stores/diglotStore.ts purely to keep that file under the file-size ceiling;
 * this module holds no state and touches neither the store nor the database.
 * Main exports: DiglotSettings, DEFAULT_DIGLOT_SETTINGS, DIGLOT_SETTINGS_KEY,
 * WEAVE_AFFECTING_SETTING_KEYS.
 */
import { type GuessLevel, INITIAL_PLACEMENT_STEP } from "@breadcrumb/feature-diglot-weave";

export interface DiglotSettings {
  enabled: boolean;
  pairId: string;
  /** Fraction of word tokens replaced, (0, 0.05]. */
  density: number;
  /** Guess-card frequency level; "off" intentionally does not exist (Leo 2026-08-12). */
  guessLevel: GuessLevel;
  /** Base daily new-word cap before the review-debt throttle. */
  newWordDailyBase: number;
  ttsEnabled: boolean;
  piperPath: string;
  piperModelPath: string;
  /** The LLM refinement tier (spec 033 T13): in-context disambiguation + phrase-level
   * weaving. Metered separately (purpose "diglot-weave"); on by default — metering exists
   * so features can run boldly (Leo 2026-08-12), and it only fires while weaving is on. */
  llmRefineEnabled: boolean;
  /** New-word introduction starts at this introduction-queue rank — maintained by the
   * behavioral placement (clean first reads move it up; no self-report by design). */
  introductionRankFloor: number;
  /** Current placement jump size (see the module's placement.ts). */
  placementStep: number;
  /** Personally fitted FSRS parameters (vision/09 #1); null = library defaults. */
  fsrsParams: number[] | null;
  /** Review count at the last successful fitting — gates refits. */
  fsrsFittedReviewCount: number;
  /** True once the vocabulary check has been offered and answered or waved off, so it is
   * never put in front of the same learner twice unasked (2026-09-01). */
  placementTestTaken: boolean;
}

export const DIGLOT_SETTINGS_KEY = "diglotSettings";

export const DEFAULT_DIGLOT_SETTINGS: DiglotSettings = {
  enabled: false,
  pairId: "zh:en",
  density: 0.02,
  guessLevel: "standard",
  newWordDailyBase: 5,
  ttsEnabled: true,
  piperPath: "",
  piperModelPath: "",
  llmRefineEnabled: true,
  introductionRankFloor: 0,
  placementStep: INITIAL_PLACEMENT_STEP,
  fsrsParams: null,
  fsrsFittedReviewCount: 0,
  placementTestTaken: false,
};

/** Settings keys whose value actually feeds weave PATCH computation — traced through
 * lib/diglot/diglotWeave.ts's weaveAssistantMessage, lib/diglot/diglotRefine.ts's refineWeavePatches and
 * the scheduler in packages/feature-diglot-weave/src/scheduler.ts:
 *  - density: ScheduleInput.density -> scheduler.ts budgetFor() (replacement count budget)
 *  - newWordDailyBase: weaveAssistantMessage's adaptiveNewWordCap base cap
 *  - introductionRankFloor: weaveAssistantMessage filters the introductionRank map by it
 *  - pairId: selects the loaded language pack (loadPack) that candidates/tokenize/
 *    replacement all read from
 * Everything else in DiglotSettings never reaches this path: ttsEnabled/piperPath/
 * piperModelPath are audio-only (no weave input); enabled only gates whether ensureWoven
 * runs at all, not what it computes, so cached patches for already-woven messages stay
 * correct across a disable/re-enable; llmRefineEnabled only feeds the ONE-SHOT reveal-time
 * refine (ensureWovenBeforeReveal) — cached history patches are base-only by design and
 * must not be wiped when the toggle flips; guessLevel only feeds shouldAskGuess/
 * computeGuessProbability (guess-card frequency), not patch selection; placementStep only
 * modulates how far recordSignal nudges introductionRankFloor, it isn't itself a scheduler
 * input; fsrsParams/fsrsFittedReviewCount reconfigure the shared FSRS scheduler via
 * configureDiglotScheduler, which today is only called from loadFromDatabase and the
 * background fit job (both bypass saveSettings), so there is no saveSettings path that
 * changes them. */
export const WEAVE_AFFECTING_SETTING_KEYS: readonly (keyof DiglotSettings)[] = [
  "density",
  "newWordDailyBase",
  "introductionRankFloor",
  "pairId",
];
