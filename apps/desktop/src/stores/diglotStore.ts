/**
 * Purpose: zustand store for the diglot weave (spec 033) — persisted settings, session
 * caches (pack, cards, per-message patches), signal ingestion and the guess-card session
 * state. Weave timing (Leo 2026-08-16): history messages weave base-only via ensureWoven
 * (MessageBubble blanks the text until patches land, so the original never paints first);
 * a fresh reply weaves ONCE via ensureWovenBeforeReveal — awaited by chatAssistantRound
 * BEFORE the streamingText→message swap, with the LLM refine raced against a hard timeout —
 * so visible text is never morphed after the fact.
 * Split out to keep this file under the file-size ceiling: the settings shape
 * (lib/diglot/diglotSettings.ts), the durable-storage actions (…SettingsPersistence.ts), the
 * weave run (…WeaveRun.ts), the daily density loop (…Density.ts), the productive-use
 * subscription (…Signals.ts) and the answer-language follow (…LanguageSync.ts).
 * Main exports: useDiglotStore, DiglotSettings.
 */
import type { DiglotEventKind } from "@breadcrumb/core-db";
import {
  type ConfusionPartner,
  computeGuessProbability,
  INITIAL_PLACEMENT_STEP,
  type LoadedLanguagePack,
  type ReplacementPatch,
  scoreVocabTest,
  type VocabTestItem,
} from "@breadcrumb/feature-diglot-weave";
import type { Card } from "ts-fsrs";
import { create } from "zustand";
import { normalizeMathDelimiters } from "../lib/chat/markdownMath";
import { DEFAULT_DIGLOT_SETTINGS, type DiglotSettings } from "../lib/diglot/diglotSettings";
import {
  chooseDiglotPair,
  loadDiglotFromDatabase,
  refreshDiglotConfusions,
  saveDiglotSettings,
} from "../lib/diglot/diglotSettingsPersistence";
import { applyDiglotSignal } from "../lib/diglot/diglotSignals";
import { foldPlacement, weaveAndStore } from "../lib/diglot/diglotWeaveRun";
import { BUNDLED_PAIR_ID } from "../lib/diglot/languagePacks";

export type { DiglotSettings } from "../lib/diglot/diglotSettings";

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
  /** Bumped whenever a weave-affecting settings change swept the cached patches: whatever
   * asks for a weave depends on it, so it asks again instead of leaving the message blank. */
  weaveEpoch: number;
  /** What the learner is now learning, when the answer language moved and the pair had to
   * follow it — one line on the settings page, cleared by their own next choice. */
  pairResetTargetLang: string | null;
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
  settings: DEFAULT_DIGLOT_SETTINGS,
  settingsHydrated: false,
  installedPairs: [BUNDLED_PAIR_ID],
  installingPairId: null,
  installFailedPairId: null,
  weaveEpoch: 0,
  pairResetTargetLang: null,
  loaded: null,
  cardsByLemma: new Map(),
  patchesByMessage: new Map(),
  newWordsIntroducedToday: 0,
  recentConsecutiveAbandons: 0,
  lastGlossSeenAt: new Map(),
  lemmasWithExplicitSignal: new Set(),
  confusionByLemma: new Map(),

  async refreshConfusions() {
    await refreshDiglotConfusions();
  },

  async choosePair(pairId) {
    await chooseDiglotPair(pairId);
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
    await loadDiglotFromDatabase();
  },

  async saveSettings(partial) {
    await saveDiglotSettings(partial);
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
