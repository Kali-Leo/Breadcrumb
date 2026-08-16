/**
 * Purpose: deterministic 30-day diglot journey simulator (spec 033 acceptance 6) — a
 * synthetic Zipf corpus flows through the real weave pipeline with a behavioral user
 * model; collects debt, starvation and constraint metrics. Zero LLM, zero DB, seeded PRNG.
 * Main exports: simulateDiglotJourney, DiglotJourneyReport.
 */
import type { DiglotPairId } from "@breadcrumb/core-db";
import {
  adaptiveNewWordCap,
  type CandidateOccurrence,
  countWordLikeTokens,
  extractCandidates,
  type LoadedLanguagePack,
  loadLanguagePack,
  newWordCard,
  ratingForSignal,
  retrievabilityOf,
  reviewCard,
  scheduleReplacements,
  tokenizeMessage,
} from "@breadcrumb/plugin-diglot-weave";
import type { Card } from "ts-fsrs";

/** Deterministic LCG so runs are replayable. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** A synthetic pack: `word001…wordN` → `t-word001…`, all t1Safe, rank = index. */
export function makeSyntheticPack(wordCount: number): LoadedLanguagePack {
  const entries: Record<string, unknown> = {};
  for (let index = 0; index < wordCount; index += 1) {
    const lemma = `word${String(index + 1).padStart(3, "0")}`;
    entries[lemma] = {
      target: `t-${lemma}`,
      pos: "n",
      reading: "",
      altTargets: [],
      freqRank: index + 1,
      t1Safe: true,
    };
  }
  return loadLanguagePack({
    schemaVersion: 1,
    id: "en:fr",
    sourceLang: "en",
    targetLang: "fr",
    version: "sim",
    attribution: ["synthetic"],
    capabilities: { t1Safe: true, rtl: false, ruby: false },
    forms: {},
    entries,
  });
}

/** Zipf-ish message: frequent words recur, rare words trail off — like real conversation. */
function sampleMessage(random: () => number, wordCount: number, length: number): string {
  const words: string[] = [];
  for (let position = 0; position < length; position += 1) {
    const zipf = Math.floor(wordCount ** random());
    words.push(`word${String(Math.min(zipf + 1, wordCount)).padStart(3, "0")}`);
    if (position % 8 === 7) words.push(",");
  }
  return `${words.join(" ")}.`;
}

export interface DiglotJourneyReport {
  days: number;
  /** Due-but-not-yet-rewoven word count sampled at the end of each day. */
  debtByDay: number[];
  /** Per re-encounter of a due word: days the learner actually waited for it — measured
   * from the later of (due date, previous encounter), so a word that keeps being shown
   * but keeps a past-due date is not miscounted as starved. */
  overdueDaysAtReencounter: number[];
  /** Highest replaced-token share observed in any message. */
  maxObservedDensity: number;
  /** Words introduced per day. */
  newWordsByDay: number[];
  totalWordsLearning: number;
}

/** Runs the journey: each day, several assistant messages get woven; the simulated user
 * hovers when recall is genuinely low (behavioral model), which feeds FSRS exactly like
 * the app's signal pipeline. */
export function simulateDiglotJourney(input: {
  days: number;
  messagesPerDay: number;
  seed: number;
  density: number;
  newWordDailyBase: number;
}): DiglotJourneyReport {
  const pack = makeSyntheticPack(200);
  const random = makeRandom(input.seed);
  const cards = new Map<string, Card>();
  const recentKinds = new Map<string, string[]>();
  const encounters = new Map<string, number>();
  const lastWovenAt = new Map<string, number>();
  const startTime = Date.UTC(2026, 0, 1, 9, 0, 0);
  const report: DiglotJourneyReport = {
    days: input.days,
    debtByDay: [],
    overdueDaysAtReencounter: [],
    maxObservedDensity: 0,
    newWordsByDay: [],
    totalWordsLearning: 0,
  };
  const introductionRank = new Map(pack.introductionQueue.map((lemma, rank) => [lemma, rank]));
  // The journey simulates one learner on one language pair; FSRS state is keyed by it.
  const journeyPair: DiglotPairId = "sim-zh-en";

  for (let day = 0; day < input.days; day += 1) {
    let newToday = 0;
    for (let messageIndex = 0; messageIndex < input.messagesPerDay; messageIndex += 1) {
      const now = new Date(startTime + day * 86400000 + messageIndex * 3600000);
      // Realistic assistant replies vary widely: 40–200 word tokens (tutoring replies are
      // often long-form), i.e. 1–4 weave slots at 2% density.
      const content = sampleMessage(random, 200, 40 + Math.floor(random() * 160));
      const tokens = tokenizeMessage(content, pack.pack.sourceLang);
      const candidates: CandidateOccurrence[] = extractCandidates(tokens, pack);
      const reviewDebt = [...cards.values()].filter((card) => card.due <= now).length;
      const scheduled = scheduleReplacements({
        pairId: journeyPair,
        candidates,
        cardsByLemma: cards,
        now,
        totalWordCount: countWordLikeTokens(tokens),
        density: input.density,
        // Same formula as the app layer: adaptive cap minus what today already used.
        newWordBudgetToday: Math.max(
          0,
          adaptiveNewWordCap(input.newWordDailyBase, reviewDebt) - newToday,
        ),
        introductionRank,
      });
      const share = scheduled.length / Math.max(1, countWordLikeTokens(tokens));
      report.maxObservedDensity = Math.max(report.maxObservedDensity, share);

      for (const item of scheduled) {
        let card = cards.get(item.lemma);
        if (card === undefined || item.kind === "new") {
          cards.set(item.lemma, newWordCard(now));
          newToday += 1;
          continue;
        }
        if (card.due <= now) {
          const waitedFrom = Math.max(card.due.getTime(), lastWovenAt.get(item.lemma) ?? 0);
          report.overdueDaysAtReencounter.push((now.getTime() - waitedFrom) / 86400000);
        }
        lastWovenAt.set(item.lemma, now.getTime());
        // Behavioral model: the user looks up (hover→Again) when recall is genuinely low,
        // but each reveal itself teaches — lookup probability decays with encounters even
        // when the memory model still scores recall near zero. Every 3rd clean exposure
        // rates Good via the real mapping.
        const recall = retrievabilityOf(journeyPair, card, now);
        const seen = encounters.get(item.lemma) ?? 0;
        encounters.set(item.lemma, seen + 1);
        const kinds = recentKinds.get(item.lemma) ?? [];
        const looksUp = random() < Math.max(0.05, (1 - recall) * 0.85 ** seen);
        const kind = looksUp ? "hover" : "exposure";
        const rating = ratingForSignal(kind, kinds as never[], undefined, card.reps);
        kinds.unshift(kind);
        recentKinds.set(item.lemma, kinds.slice(0, 8));
        if (rating !== null) card = reviewCard(journeyPair, card, now, rating);
        cards.set(item.lemma, card);
      }
    }
    const endOfDay = new Date(startTime + (day + 1) * 86400000);
    report.debtByDay.push([...cards.values()].filter((card) => card.due <= endOfDay).length);
    report.newWordsByDay.push(newToday);
  }
  report.totalWordsLearning = cards.size;
  return report;
}
