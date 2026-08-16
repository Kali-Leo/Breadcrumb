/**
 * Purpose: zustand store for the diglot weave (spec 033) — persisted settings, session
 * caches (pack, cards, per-message patches), signal ingestion and the guess-card session
 * state. Side effect on import: subscribes productive-use detection to chat:messageSent.
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
  type ReplacementPatch,
  updatePlacement,
} from "@breadcrumb/plugin-diglot-weave";
import type { Card } from "ts-fsrs";
import { create } from "zustand";
import { getRepos } from "../lib/db";
import { refineWeavePatches } from "../lib/diglotRefine";
import {
  applyDiglotSignal,
  findProductiveUses,
  loadBundledPack,
  loadCards,
  weaveAssistantMessage,
} from "../lib/diglotWeave";
import { nowIso } from "../lib/time";
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
}

const SETTINGS_KEY = "diglotSettings";
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
};

interface DiglotState {
  settings: DiglotSettings;
  loaded: LoadedLanguagePack | null;
  cardsByLemma: Map<string, Card>;
  patchesByMessage: Map<string, ReplacementPatch[]>;
  newWordsIntroducedToday: number;
  recentConsecutiveAbandons: number;
  lastGlossSeenAt: Map<string, Date>;
  lemmasWithExplicitSignal: Set<string>;
  /** Systematic mix-ups mined from the guess log — drives contrast lines (vision/09). */
  confusionByLemma: Map<string, ConfusionPartner>;
  refreshConfusions(): Promise<void>;
  loadFromDatabase(): Promise<void>;
  saveSettings(partial: Partial<DiglotSettings>): Promise<void>;
  ensureWoven(messageId: string, content: string): Promise<void>;
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

  async loadFromDatabase() {
    const repos = await getRepos();
    const stored = await repos.settings.get<DiglotSettings>(SETTINGS_KEY);
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    set({ settings });
    if (!settings.enabled) return;
    const loaded = await loadBundledPack(settings.pairId);
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
    configureDiglotScheduler(settings.fsrsParams ?? undefined);
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
    const settings = { ...get().settings, ...partial };
    const repos = await getRepos();
    await repos.settings.set(SETTINGS_KEY, settings, nowIso());
    // Any setting change invalidates woven output; re-enable reloads pack and cards.
    set({ settings, patchesByMessage: new Map() });
    if (settings.enabled && get().loaded === null) await get().loadFromDatabase();
  },

  async ensureWoven(messageId, content) {
    const { settings, loaded, patchesByMessage, cardsByLemma } = get();
    if (!settings.enabled || loaded === null) return;
    if (patchesByMessage.has(messageId)) return;
    patchesByMessage.set(messageId, []); // reserve to keep the weave single-flight
    const result = await weaveAssistantMessage({
      loaded,
      content,
      density: settings.density,
      newWordDailyBase: settings.newWordDailyBase,
      introductionRankFloor: settings.introductionRankFloor,
      cardsByLemma,
      newWordsIntroducedToday: get().newWordsIntroducedToday,
    });
    let patches = result.patches;
    // T13 refinement (metered, own switch): in-context disambiguation + phrase weave.
    const { apiConfig, networkEnabled } = useSettingsStore.getState();
    if (settings.llmRefineEnabled && networkEnabled && apiConfig !== null && patches.length > 0) {
      patches = await refineWeavePatches(apiConfig, loaded, content, patches);
    }
    set({
      patchesByMessage: new Map(get().patchesByMessage).set(messageId, patches),
      newWordsIntroducedToday: get().newWordsIntroducedToday + result.introducedLemmas.length,
    });
  },

  async recordSignal(lemma, kind, messageId, context, latencyMs) {
    const { settings, cardsByLemma, loaded } = get();
    const card = cardsByLemma.get(lemma);
    if (card === undefined) return;
    // Behavioral placement: a word's first encounter is objective vocabulary evidence
    // (clean read = known on sight). Persisted quietly — no weave invalidation needed,
    // the floor only affects FUTURE new-word picks.
    if (card.reps === 0 && loaded !== null) {
      const rank = loaded.introductionQueue.indexOf(lemma);
      const placed = updatePlacement(
        {
          introductionRankFloor: settings.introductionRankFloor,
          placementStep: settings.placementStep,
        },
        { kind, cardReps: card.reps, wordRank: rank === -1 ? null : rank },
        loaded.introductionQueue.length,
      );
      if (
        placed.introductionRankFloor !== settings.introductionRankFloor ||
        placed.placementStep !== settings.placementStep
      ) {
        const nextSettings = { ...settings, ...placed };
        const repos = await getRepos();
        await repos.settings.set(SETTINGS_KEY, nextSettings, nowIso());
        set({ settings: nextSettings });
      }
    }
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
