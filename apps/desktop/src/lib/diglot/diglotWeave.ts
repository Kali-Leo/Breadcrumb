/**
 * Purpose: app-side orchestration of the diglot weave (spec 033) — the per-message weave
 * pipeline (candidates → schedule → patches, with new-word introduction and context-novelty
 * via local embeddings).
 * Side effects: DB writes (word states, context embeddings).
 * Main exports: weaveAssistantMessage, WeaveResult.
 * Signal application and card loading live in diglotSignals.ts; pack loading itself lives in
 * languagePacks.ts, which also knows how to install one.
 */
import {
  adaptiveNewWordCap,
  buildPatches,
  cardToJson,
  clauseTextOf,
  countWordLikeTokens,
  createMeetableDebtWindow,
  extractCandidates,
  hashContext,
  type LoadedLanguagePack,
  newWordCard,
  type ReplacementPatch,
  scheduleReplacements,
  tokenizeMessage,
} from "@breadcrumb/feature-diglot-weave";
import type { Card } from "ts-fsrs";
import { getRepos } from "../platform/db";
import { nowIso } from "../platform/time";
import { contextNoveltyFor } from "./diglotNovelty";

/** One conversation stream, one window over the lemmas it recently offered — the review-debt
 * throttle only counts due words this window can still deliver (see reviewDebt.ts). */
const meetableDebtWindow = createMeetableDebtWindow();

export interface WeaveResult {
  patches: ReplacementPatch[];
  /** Lemmas newly introduced by this weave (state rows were created). */
  introducedLemmas: string[];
}

/** Weaves one assistant message: extracts candidates, schedules under the budget, creates
 * state rows for chosen new words, stores context vectors for chosen words, and returns
 * display patches. Pure read-compute-write; the caller caches per messageId. */
export async function weaveAssistantMessage(input: {
  loaded: LoadedLanguagePack;
  content: string;
  density: number;
  newWordDailyBase: number;
  /** Introduction-queue ranks below this are treated as already known (calibration). */
  introductionRankFloor: number;
  cardsByLemma: Map<string, Card>;
  newWordsIntroducedToday: number;
}): Promise<WeaveResult> {
  const { loaded, content } = input;
  const repos = await getRepos();
  const pair = loaded.pack.id;
  const now = new Date();
  const tokens = tokenizeMessage(content, loaded.pack.sourceLang);
  const candidates = extractCandidates(tokens, loaded);
  if (candidates.length === 0) return { patches: [], introducedLemmas: [] };

  // Review debt throttles new words — but only debt this conversation can still pay off.
  meetableDebtWindow.noteMessageCandidates(candidates.map((candidate) => candidate.lemma));
  const dueStates = await repos.diglot.listDueStates(pair, nowIso());
  const reviewDebt = meetableDebtWindow.countMeetable(dueStates.map((state) => state.lemma));
  const newWordBudgetToday = Math.max(
    0,
    adaptiveNewWordCap(input.newWordDailyBase, reviewDebt) - input.newWordsIntroducedToday,
  );

  // Context novelty (spec 033): only review candidates have stored contexts to compare to,
  // and each is judged on the clause it actually appears in rather than on the whole reply.
  const clauseByLemma = new Map<string, string>();
  for (const candidate of candidates) {
    if (!input.cardsByLemma.has(candidate.lemma)) continue;
    clauseByLemma.set(candidate.lemma, clauseTextOf(content, tokens, candidate.clauseIndex));
  }
  const { noveltyByLemma, contextByLemma } = await contextNoveltyFor({ pair, clauseByLemma });

  // Only this message's candidates can be introduced, so the floor filter runs over them
  // rather than over the whole (thousands long) introduction queue.
  const introductionRank = new Map<string, number>();
  for (const candidate of candidates) {
    const rank = loaded.introductionRankByLemma.get(candidate.lemma);
    if (rank !== undefined && rank >= input.introductionRankFloor) {
      introductionRank.set(candidate.lemma, rank);
    }
  }
  const scheduled = scheduleReplacements({
    pairId: pair,
    candidates,
    cardsByLemma: input.cardsByLemma,
    now,
    totalWordCount: countWordLikeTokens(tokens),
    density: input.density,
    newWordBudgetToday,
    introductionRank,
    noveltyByLemma,
  });
  const patches = buildPatches(content, scheduled, loaded);

  const introducedLemmas: string[] = [];
  const createdAt = nowIso();
  for (const item of scheduled) {
    if (item.kind === "new") {
      const card = newWordCard(now);
      await repos.diglot.upsertState({
        lemma: item.lemma,
        pair,
        fsrs_json: cardToJson(card),
        due: card.due.toISOString(),
        introduced_at: createdAt,
        last_event_at: null,
      });
      input.cardsByLemma.set(item.lemma, card);
      introducedLemmas.push(item.lemma);
    }
    // Store what this word was actually met in — its clause. A word introduced in this same
    // message has no clause vector yet (novelty is only computed for review candidates), so
    // its first stored context arrives the next time it is met.
    const context = contextByLemma.get(item.lemma);
    if (context !== undefined) {
      await repos.diglot.upsertContextEmbedding({
        lemma: item.lemma,
        pair,
        context_hash: hashContext(context.text),
        vector_json: JSON.stringify(context.vector),
        created_at: createdAt,
      });
    }
  }
  return { patches, introducedLemmas };
}
