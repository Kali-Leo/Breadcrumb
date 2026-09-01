/**
 * Purpose: app-side orchestration of the diglot weave (spec 033) —
 * the per-message weave pipeline (candidates → schedule → patches, with new-word
 * introduction and context-novelty via local embeddings), and signal application to FSRS.
 * Side effects: DB writes (word states, events, context embeddings).
 * Main exports: weaveAssistantMessage, applyDiglotSignal, findProductiveUses, WeaveResult.
 * Pack loading itself lives in languagePacks.ts, which also knows how to install one.
 */
import type { DiglotEventKind, DiglotPairId } from "@breadcrumb/core-db";
import {
  adaptiveNewWordCap,
  buildPatches,
  cardFromJson,
  cardToJson,
  countWordLikeTokens,
  createMeetableDebtWindow,
  extractCandidates,
  hashContext,
  type LoadedLanguagePack,
  newWordCard,
  type ReplacementPatch,
  ratingForSignal,
  retrievabilityOf,
  reviewCard,
  scheduleReplacements,
  tokenizeMessage,
} from "@breadcrumb/plugin-diglot-weave";
import type { Card } from "ts-fsrs";
import { getRepos } from "./db";
import { contextNoveltyFor } from "./diglotNovelty";
import { nowIso } from "./time";

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

  // Context novelty (spec 033): only review candidates have stored contexts to compare to.
  const { noveltyByLemma, messageVector } = await contextNoveltyFor({
    pair,
    content,
    lemmas: candidates
      .filter((candidate) => input.cardsByLemma.has(candidate.lemma))
      .map((candidate) => candidate.lemma),
  });

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
    if (messageVector !== null) {
      await repos.diglot.upsertContextEmbedding({
        lemma: item.lemma,
        pair,
        context_hash: hashContext(content),
        vector_json: JSON.stringify(messageVector),
        created_at: createdAt,
      });
    }
  }
  return { patches, introducedLemmas };
}

/** Records one signal event and applies its FSRS rating (if any) to the word's card.
 * Returns the updated card so the caller can refresh its in-memory map. */
export async function applyDiglotSignal(input: {
  pair: DiglotPairId;
  lemma: string;
  kind: DiglotEventKind;
  card: Card;
  messageId: string | null;
  context: string | null;
  latencyMs: number | null;
}): Promise<Card> {
  const repos = await getRepos();
  const now = new Date();
  const recent = await repos.diglot.listRecentEvents(input.pair, input.lemma, 8);
  const rating = ratingForSignal(
    input.kind,
    recent.map((event) => event.kind),
    input.latencyMs ?? undefined,
    input.card.reps,
  );
  await repos.diglot.insertEvent({
    id: crypto.randomUUID(),
    lemma: input.lemma,
    pair: input.pair,
    kind: input.kind,
    message_id: input.messageId,
    context_hash: input.context === null ? null : hashContext(input.context),
    latency_ms: input.latencyMs,
    created_at: nowIso(),
  });
  let card = input.card;
  if (rating !== null) {
    card = reviewCard(input.pair, card, now, rating);
    await repos.diglot.updateStateCard(
      input.lemma,
      input.pair,
      cardToJson(card),
      card.due.toISOString(),
      nowIso(),
    );
  }
  return card;
}

/** Target-language words the user actively produced in their own message — the strongest
 * mastery signal. Only words currently being learned count. */
export function findProductiveUses(
  loaded: LoadedLanguagePack,
  learningLemmas: ReadonlySet<string>,
  userContent: string,
): string[] {
  const tokens = tokenizeMessage(userContent, loaded.pack.targetLang);
  const used = new Set<string>();
  for (const token of tokens) {
    if (!token.isWordLike) continue;
    const lemmas = loaded.lemmasByTarget.get(token.text.toLowerCase()) ?? [];
    for (const lemma of lemmas) {
      if (learningLemmas.has(lemma)) used.add(lemma);
    }
  }
  return [...used].sort();
}

/** Loads every stored card of a pair into memory (the scheduler's working map). */
export async function loadCards(pair: DiglotPairId): Promise<Map<string, Card>> {
  const repos = await getRepos();
  const states = await repos.diglot.listStates(pair);
  return new Map(states.map((state) => [state.lemma, cardFromJson(state.fsrs_json)]));
}

/** Recall probability helper re-exported for UI display decisions. */
export { retrievabilityOf };
