/**
 * Purpose: zustand store for the diglot weave (spec 033) — persisted settings, session
 * caches (pack, cards, per-message patches), signal ingestion and the guess-card session
 * state. Weave timing (Leo 2026-08-16): history messages weave base-only via ensureWoven
 * (MessageBubble blanks the text until patches land, so the original never paints first);
 * a fresh reply weaves ONCE via ensureWovenBeforeReveal — awaited by chatAssistantRound
 * BEFORE the streamingText→message swap, with the LLM refine raced against a hard timeout —
 * so visible text is never morphed after the fact. Side effect on import: subscribes
 * productive-use detection to chat:messageSent.
 * Main exports: useDiglotStore, DiglotSettings.
 */
import type { DiglotEventKind } from "@breadcrumb/core-db";
import {
  type ConfusionPartner,
  computeGuessProbability,
  configureDiglotScheduler,
  type GuessLevel,
  INITIAL_PLACEMENT_STEP,
  type LoadedLanguagePack,
  mineConfusionPairs,
  nextDensity,
  type ReplacementPatch,
  scoreVocabTest,
  type VocabTestItem,
} from "@breadcrumb/plugin-diglot-weave";
import type { Card } from "ts-fsrs";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { nextPlacementState } from "../lib/diglotPlacement";
import { refineWeavePatches } from "../lib/diglotRefine";
import { REFINE_HARD_TIMEOUT_MS, refineWithHardTimeout } from "../lib/diglotReveal";
import {
  applyDiglotSignal,
  findProductiveUses,
  loadCards,
  weaveAssistantMessage,
} from "../lib/diglotWeave";
import {
  BUNDLED_PAIR_ID,
  installLanguagePack,
  listInstalledPairs,
  loadPack,
} from "../lib/languagePacks";
import { normalizeMathDelimiters } from "../lib/markdownMath";
import { nowIso, onLocalDayChange } from "../lib/time";
import { appEventBus, useChatStore } from "./chatStore";
import { useSettingsStore } from "./settingsStore";

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
  /** Current placement jump size (see plugin placement.ts). */
  placementStep: number;
  /** Personally fitted FSRS parameters (vision/09 #1); null = library defaults. */
  fsrsParams: number[] | null;
  /** Review count at the last successful fitting — gates refits. */
  fsrsFittedReviewCount: number;
  /** True once the vocabulary check has been offered and answered or waved off, so it is
   * never put in front of the same learner twice unasked (2026-09-01). */
  placementTestTaken: boolean;
}

/** Bumped when a weave-affecting setting changes — in-flight weaves compare it to discard
 * stale output. */
let weaveEpoch = 0;
const SETTINGS_KEY = "diglotSettings";
/** How much history the density loop looks at — a week smooths over one heavy evening. */
const DENSITY_WINDOW_DAYS = 7;

/** Settings keys whose value actually feeds weave PATCH computation — traced through
 * lib/diglotWeave.ts's weaveAssistantMessage, lib/diglotRefine.ts's refineWeavePatches and
 * the scheduler in packages/plugin-diglot-weave/src/scheduler.ts:
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
const WEAVE_AFFECTING_SETTING_KEYS: readonly (keyof DiglotSettings)[] = [
  "density",
  "newWordDailyBase",
  "introductionRankFloor",
  "pairId",
];

/** Guards the daily new-word counter's day-change wiring against double registration
 * (StrictMode double-invokes loadFromDatabase via App.tsx's effect). */
let dailyWordCounterTriggerWired = false;

function wireDailyWordCounterTrigger(): void {
  if (dailyWordCounterTriggerWired) return;
  dailyWordCounterTriggerWired = true;
  onLocalDayChange(() => {
    void recomputeNewWordsIntroducedToday();
    void adjustDensityForYesterday();
  });
}

/**
 * One day's density adjustment (spec 033 + audit 2026-08-28 语言织入 #10): how often the
 * learner opened a woven word's meaning over the last week decides whether tomorrow's replies
 * carry a few more of them or a few less. Silent — density has never been on screen, and this
 * does not put it there.
 */
async function adjustDensityForYesterday(): Promise<void> {
  const { settings } = useDiglotStore.getState();
  if (!settings.enabled) return;
  const repos = await getRepos();
  const since = new Date(Date.parse(nowIso()) - DENSITY_WINDOW_DAYS * 86_400_000).toISOString();
  const events = await repos.diglot.listEventsSince(settings.pairId, since);
  const observation = { wovenWords: 0, lookups: 0 };
  for (const event of events) {
    // One "exposure" per woven word shown; hover and a guess opened are the learner asking
    // what it means. Audio is not a lookup — hearing a word is not failing to know it.
    if (event.kind === "exposure") observation.wovenWords += 1;
    if (event.kind === "hover" || event.kind === "guess_wrong" || event.kind === "guess_close") {
      observation.lookups += 1;
    }
  }
  const density = nextDensity(settings.density, observation);
  if (density !== settings.density) {
    await useDiglotStore.getState().saveSettings({ density });
  }
}

/** Recomputes today's introduced-word count from the DB — called on local-day rollover so
 * an app kept open across midnight starts a fresh budget instead of carrying yesterday's
 * count (and yesterday's exhausted budget) until restart. */
async function recomputeNewWordsIntroducedToday(): Promise<void> {
  const { settings, loaded } = useDiglotStore.getState();
  if (!settings.enabled || loaded === null) return;
  const repos = await getRepos();
  const states = await repos.diglot.listStates(settings.pairId);
  const today = nowIso().slice(0, 10);
  useDiglotStore.setState({
    newWordsIntroducedToday: states.filter((s) => s.introduced_at.startsWith(today)).length,
  });
}

const DEFAULT_SETTINGS: DiglotSettings = {
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

interface DiglotState {
  settings: DiglotSettings;
  /** True once the persisted settings were read — MessageBubble's weave gate holds
   * assistant text back until it knows whether weaving is on (never paint-then-morph). */
  settingsHydrated: boolean;
  loaded: LoadedLanguagePack | null;
  cardsByLemma: Map<string, Card>;
  patchesByMessage: Map<string, ReplacementPatch[]>;
  newWordsIntroducedToday: number;
  recentConsecutiveAbandons: number;
  lastGlossSeenAt: Map<string, Date>;
  lemmasWithExplicitSignal: Set<string>;
  /** Systematic mix-ups mined from the guess log — drives contrast lines (vision/09). */
  confusionByLemma: Map<string, ConfusionPartner>;
  /** Pairs this machine can weave right now: the bundled one plus every downloaded pack. */
  installedPairs: string[];
  /** Pair id currently being downloaded, or null. */
  installingPairId: string | null;
  /** Set when the last download did not finish — the picker says so and offers a retry. */
  installFailedPairId: string | null;
  refreshConfusions(): Promise<void>;
  /** Downloads the pack for a pair if needed, then switches to it. */
  choosePair(pairId: string): Promise<void>;
  /** Stores what the vocabulary check said: where new words should start from. */
  finishPlacementTest(
    items: readonly VocabTestItem[],
    answers: readonly (number | null)[],
  ): Promise<void>;
  loadFromDatabase(): Promise<void>;
  saveSettings(partial: Partial<DiglotSettings>): Promise<void>;
  /** Base-only weave for a message already on screen gated blank (history path). */
  ensureWoven(messageId: string, content: string): Promise<void>;
  /** Reveal-time weave for a freshly streamed reply (base + LLM refine under a hard
   * timeout) — awaited by chatAssistantRound BEFORE the streamingText→message swap.
   * Takes the RAW persisted content and normalizes it exactly like MessageBubble does. */
  ensureWovenBeforeReveal(messageId: string, rawContent: string): Promise<void>;
  recordSignal(
    lemma: string,
    kind: DiglotEventKind,
    messageId: string | null,
    context: string | null,
    latencyMs: number | null,
  ): Promise<void>;
  shouldAskGuess(lemma: string): boolean;
  noteGlossSeen(lemma: string): void;
  noteGuessOutcome(abandoned: boolean): void;
}

export const useDiglotStore = create<DiglotState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  settingsHydrated: false,
  installedPairs: [BUNDLED_PAIR_ID],
  installingPairId: null,
  installFailedPairId: null,
  loaded: null,
  cardsByLemma: new Map(),
  patchesByMessage: new Map(),
  newWordsIntroducedToday: 0,
  recentConsecutiveAbandons: 0,
  lastGlossSeenAt: new Map(),
  lemmasWithExplicitSignal: new Set(),
  confusionByLemma: new Map(),

  async refreshConfusions() {
    const { settings, loaded } = get();
    if (loaded === null) return;
    const repos = await getRepos();
    const guesses = await repos.diglot.listGuesses(settings.pairId);
    set({ confusionByLemma: mineConfusionPairs(guesses, loaded) });
  },

  /** Picks a pair, downloading its pack first when this machine does not have it yet. A
   * failed download leaves the current pair alone: the learner keeps weaving in the language
   * they already had. */
  async choosePair(pairId) {
    if (pairId === get().settings.pairId) return;
    if (!get().installedPairs.includes(pairId)) {
      set({ installingPairId: pairId, installFailedPairId: null });
      try {
        await installLanguagePack(pairId);
        set({ installedPairs: await listInstalledPairs() });
      } catch {
        set({ installingPairId: null, installFailedPairId: pairId });
        return;
      }
      set({ installingPairId: null });
    }
    await get().saveSettings({ pairId });
  },

  /** The check's verdict is a starting point, not a verdict on the learner: it only moves
   * the introduction floor, and behavioural placement keeps correcting it from there. */
  async finishPlacementTest(items, answers) {
    await get().saveSettings({
      introductionRankFloor: scoreVocabTest(items, answers),
      placementStep: INITIAL_PLACEMENT_STEP,
      placementTestTaken: true,
    });
  },

  async loadFromDatabase() {
    wireDailyWordCounterTrigger();
    const repos = await getRepos();
    const stored = await repos.settings.get<DiglotSettings>(SETTINGS_KEY);
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    set({ settings, settingsHydrated: true, installedPairs: await listInstalledPairs() });
    if (!settings.enabled) return;
    const loaded = await loadPack(settings.pairId);
    const cardsByLemma = await loadCards(settings.pairId);
    const states = await repos.diglot.listStates(settings.pairId);
    const today = nowIso().slice(0, 10);
    set({
      loaded,
      cardsByLemma,
      newWordsIntroducedToday: states.filter((s) => s.introduced_at.startsWith(today)).length,
      lemmasWithExplicitSignal: new Set(
        await repos.diglot.listLemmasWithExplicitSignal(settings.pairId),
      ),
    });
    void get().refreshConfusions();
    // Personal memory model (vision/09 #1): apply fitted parameters, refit in background.
    configureDiglotScheduler(settings.pairId, settings.fsrsParams ?? undefined);
    void (async () => {
      const { maybeFitFsrsParameters } = await import("../lib/fsrsFit");
      const fitted = await maybeFitFsrsParameters(settings.pairId, settings.fsrsFittedReviewCount);
      if (fitted !== null) {
        const nextSettings = {
          ...get().settings,
          fsrsParams: fitted.params,
          fsrsFittedReviewCount: fitted.reviewCount,
        };
        await repos.settings.set(SETTINGS_KEY, nextSettings, nowIso());
        set({ settings: nextSettings });
      }
    })();
    await repos.diglot.upsertPack({
      id: loaded.pack.id,
      source_lang: loaded.pack.sourceLang,
      target_lang: loaded.pack.targetLang,
      version: loaded.pack.version,
      meta_json: JSON.stringify(loaded.pack.capabilities),
      installed_at: nowIso(),
    });
  },

  async saveSettings(partial) {
    const previous = get().settings;
    const settings = { ...previous, ...partial };
    const repos = await getRepos();
    await repos.settings.set(SETTINGS_KEY, settings, nowIso());
    // Only a change to a WEAVE_AFFECTING_SETTING_KEYS key invalidates woven output — e.g.
    // TTS/piper text fields don't feed patch computation at all, so saving them must not
    // wipe and re-weave (with billed LLM refine calls) every already-rendered message. The
    // epoch bump makes every in-flight weave discard its (old-settings) result.
    const weaveAffected = WEAVE_AFFECTING_SETTING_KEYS.some(
      (key) => previous[key] !== settings[key],
    );
    if (weaveAffected) {
      weaveEpoch += 1;
      set({ settings, patchesByMessage: new Map() });
    } else {
      set({ settings });
    }
    if (settings.enabled && get().loaded === null) await get().loadFromDatabase();
  },

  async ensureWoven(messageId, content) {
    await weaveAndStore(messageId, content, false);
  },

  async ensureWovenBeforeReveal(messageId, rawContent) {
    await weaveAndStore(messageId, normalizeMathDelimiters(rawContent), true);
  },

  async recordSignal(lemma, kind, messageId, context, latencyMs) {
    const { settings, cardsByLemma, loaded } = get();
    const card = cardsByLemma.get(lemma);
    if (card === undefined) return;
    if (loaded !== null) await foldPlacement({ lemma, kind, messageId, card, loaded });
    const updated = await applyDiglotSignal({
      pair: settings.pairId,
      lemma,
      kind,
      card,
      messageId,
      context,
      latencyMs,
    });
    const explicit = new Set(get().lemmasWithExplicitSignal);
    if (kind.startsWith("guess_") || kind === "productive_use") explicit.add(lemma);
    set({
      cardsByLemma: new Map(get().cardsByLemma).set(lemma, updated),
      lemmasWithExplicitSignal: explicit,
    });
  },

  shouldAskGuess(lemma) {
    const state = get();
    const probability = computeGuessProbability({
      pairId: state.settings.pairId,
      card: state.cardsByLemma.get(lemma) ?? null,
      now: new Date(),
      level: state.settings.guessLevel,
      hasExplicitSignal: state.lemmasWithExplicitSignal.has(lemma),
      lastGlossSeenAt: state.lastGlossSeenAt.get(lemma) ?? null,
      recentConsecutiveAbandons: state.recentConsecutiveAbandons,
    });
    return Math.random() < probability;
  },

  noteGlossSeen(lemma) {
    set({ lastGlossSeenAt: new Map(get().lastGlossSeenAt).set(lemma, new Date()) });
  },

  noteGuessOutcome(abandoned) {
    set({
      recentConsecutiveAbandons: abandoned ? get().recentConsecutiveAbandons + 1 : 0,
    });
  },
}));

/** Persists what the placement rules made of one signal (see lib/diglotPlacement.ts). */
async function foldPlacement(input: {
  lemma: string;
  kind: DiglotEventKind;
  messageId: string | null;
  card: Card;
  loaded: LoadedLanguagePack;
}): Promise<void> {
  const { settings, cardsByLemma } = useDiglotStore.getState();
  const placed = await nextPlacementState({
    pairId: settings.pairId,
    state: {
      introductionRankFloor: settings.introductionRankFloor,
      placementStep: settings.placementStep,
    },
    lemma: input.lemma,
    kind: input.kind,
    messageId: input.messageId,
    card: input.card,
    loaded: input.loaded,
    introducedWordCount: cardsByLemma.size,
  });
  if (placed === null) return;
  // Merge onto the settings AS THEY ARE NOW — a concurrent saveSettings between the entry
  // snapshot and this write must not be silently reverted.
  const nextSettings = { ...useDiglotStore.getState().settings, ...placed };
  const repos = await getRepos();
  await repos.settings.set(SETTINGS_KEY, nextSettings, nowIso());
  useDiglotStore.setState({ settings: nextSettings });
}

/** Message ids with a weave in flight — single-flight guard that stays OUT of
 * patchesByMessage, so subscribers (MessageBubble's blank-until-woven gate, the doors
 * effect) keep seeing `undefined` until the FINAL patches land in one set(). */
const weaveInFlight = new Set<string>();

/** The one weave path (both halves of the timing ruling): base weave always; the metered
 * LLM refine only on the reveal path, raced against its hard timeout — on timeout the base
 * weave lands and, because refine never runs again for a cached message, it is skipped for
 * that message forever. */
async function weaveAndStore(
  messageId: string,
  displaySource: string,
  refine: boolean,
): Promise<void> {
  const { settings, loaded, patchesByMessage, cardsByLemma } = useDiglotStore.getState();
  if (!settings.enabled || loaded === null) return;
  if (patchesByMessage.has(messageId) || weaveInFlight.has(messageId)) return;
  weaveInFlight.add(messageId);
  const epochAtStart = weaveEpoch;
  try {
    const result = await weaveAssistantMessage({
      loaded,
      content: displaySource,
      density: settings.density,
      newWordDailyBase: settings.newWordDailyBase,
      introductionRankFloor: settings.introductionRankFloor,
      cardsByLemma,
      newWordsIntroducedToday: useDiglotStore.getState().newWordsIntroducedToday,
    });
    let patches = result.patches;
    // T13 refinement (metered, own switch): in-context disambiguation + phrase weave.
    const { apiConfig, networkEnabled } = useSettingsStore.getState();
    if (refine && settings.llmRefineEnabled && networkEnabled && apiConfig !== null) {
      const basePatches = patches;
      if (basePatches.length > 0) {
        patches = await refineWithHardTimeout(
          () => refineWeavePatches(apiConfig, loaded, displaySource, basePatches),
          basePatches,
          REFINE_HARD_TIMEOUT_MS,
        );
      }
    }
    // Settings changed underneath (the epoch bump also swept patchesByMessage) — this
    // weave was computed against stale inputs and must not land.
    if (epochAtStart !== weaveEpoch) return;
    const state = useDiglotStore.getState();
    useDiglotStore.setState({
      patchesByMessage: new Map(state.patchesByMessage).set(messageId, patches),
      newWordsIntroducedToday: state.newWordsIntroducedToday + result.introducedLemmas.length,
    });
  } finally {
    weaveInFlight.delete(messageId);
  }
}

// Productive use (spec 033 signal table): when the user's own message contains a target
// word they are learning, record the strongest signal — once per lemma per message.
appEventBus.on("chat:messageSent", ({ conversationId, messageId }) => {
  const { settings, loaded, cardsByLemma, recordSignal } = useDiglotStore.getState();
  if (!settings.enabled || loaded === null) return;
  const message = useChatStore
    .getState()
    .messagesFor(conversationId)
    .find((m) => m.id === messageId);
  if (message === undefined) return;
  const used = findProductiveUses(loaded, new Set(cardsByLemma.keys()), message.content);
  for (const lemma of used) {
    void recordSignal(lemma, "productive_use", messageId, message.content, null);
  }
});
