/**
 * Purpose: deterministic 30-day diglot journey simulator (spec 033 acceptance 6) — a
 * synthetic corpus flows through the real weave pipeline with a behavioral user model;
 * collects debt, starvation and constraint metrics. Zero LLM, zero DB, seeded PRNG.
 * Main exports: simulateDiglotJourney, DiglotJourneyReport.
 */
import type { DiglotPairId } from "@breadcrumb/core-db";
import {
  adaptiveNewWordCap,
  type CandidateOccurrence,
  countWordLikeTokens,
  createMeetableDebtWindow,
  extractCandidates,
  newWordCard,
  ratingForSignal,
  retrievabilityOf,
  reviewCard,
  scheduleReplacements,
  tokenizeMessage,
} from "@breadcrumb/feature-diglot-weave";
import type { Card } from "ts-fsrs";
import { mulberry32 } from "../util/prng";
import { makeChatCorpus, makeSyntheticPack, SIM_PACK_WORDS } from "./diglotJourneyCorpus";

/** FSRS stability (in days) at which a word counts as actually held, not just met once —
 * the memory model expects ~90% recall a week later. */
const HELD_STABILITY_DAYS = 7;

export interface DiglotJourneyReport {
  days: number;
  /** Due-but-not-yet-rewoven word count sampled at the end of each day. */
  debtByDay: number[];
  /** The part of that debt the conversation can still deliver — what the new-word throttle
   * reads. Debt outside it is unpayable by construction: those words have left the chat. */
  meetableDebtByDay: number[];
  /** Per re-encounter of a due word: days the learner actually waited for it — measured
   * from the later of (due date, previous encounter), so a word that keeps being shown
   * but keeps a past-due date is not miscounted as starved. */
  overdueDaysAtReencounter: number[];
  /** Highest replaced-token share observed in any message. */
  maxObservedDensity: number;
  /** Words introduced per day. */
  newWordsByDay: number[];
  totalWordsLearning: number;
  /** Of those, the ones whose memory state actually grew (see HELD_STABILITY_DAYS) —
   * introducing a word the chat never repeats does not teach it. */
  wordsHeld: number;
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
  const pack = makeSyntheticPack(SIM_PACK_WORDS);
  const corpus = makeChatCorpus({ seed: input.seed, wordCount: SIM_PACK_WORDS });
  const random = mulberry32(input.seed);
  const cards = new Map<string, Card>();
  const recentKinds = new Map<string, string[]>();
  const encounters = new Map<string, number>();
  const lastWovenAt = new Map<string, number>();
  const startTime = Date.UTC(2026, 0, 1, 9, 0, 0);
  const report: DiglotJourneyReport = {
    days: input.days,
    debtByDay: [],
    meetableDebtByDay: [],
    overdueDaysAtReencounter: [],
    maxObservedDensity: 0,
    newWordsByDay: [],
    totalWordsLearning: 0,
    wordsHeld: 0,
  };
  const introductionRank = pack.introductionRankByLemma;
  // Same measure as the app layer (lib/diglot/diglotWeave.ts): debt counts only words the recent
  // conversation can still deliver.
  const debtWindow = createMeetableDebtWindow();
  // The journey simulates one learner on one language pair; FSRS state is keyed by it.
  const journeyPair: DiglotPairId = "sim-zh-en";

  for (let day = 0; day < input.days; day += 1) {
    let newToday = 0;
    for (let messageIndex = 0; messageIndex < input.messagesPerDay; messageIndex += 1) {
      const now = new Date(startTime + day * 86400000 + messageIndex * 3600000);
      // Realistic assistant replies vary widely: 40–200 word tokens (tutoring replies are
      // often long-form), i.e. 1–4 weave slots at 2% density.
      const content = corpus.message(random, 40 + Math.floor(random() * 160));
      const tokens = tokenizeMessage(content, pack.pack.sourceLang);
      const candidates: CandidateOccurrence[] = extractCandidates(tokens, pack);
      debtWindow.noteMessageCandidates(candidates.map((candidate) => candidate.lemma));
      const dueLemmas = [...cards].filter(([, card]) => card.due <= now).map(([lemma]) => lemma);
      const reviewDebt = debtWindow.countMeetable(dueLemmas);
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
    const due = [...cards].filter(([, card]) => card.due <= endOfDay).map(([lemma]) => lemma);
    report.debtByDay.push(due.length);
    report.meetableDebtByDay.push(debtWindow.countMeetable(due));
    report.newWordsByDay.push(newToday);
  }
  report.totalWordsLearning = cards.size;
  report.wordsHeld = [...cards.values()].filter(
    (card) => card.stability >= HELD_STABILITY_DAYS,
  ).length;
  return report;
}
