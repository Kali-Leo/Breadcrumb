/**
 * Purpose: app-side orchestration of the diglot weave (spec 033) — bundled pack loading,
 * the per-message weave pipeline (candidates → schedule → patches, with new-word
 * introduction and context-novelty via local embeddings), and signal application to FSRS.
 * Side effects: DB writes (word states, events, context embeddings).
 * Main exports: loadBundledPack, weaveAssistantMessage, applyDiglotSignal,
 * findProductiveUses, WeaveResult.
 */
import type { DiglotEventKind, DiglotPairId } from "@breadcrumb/core-db";
import {
  adaptiveNewWordCap,
  buildPatches,
  cardFromJson,
  cardToJson,
  countWordLikeTokens,
  extractCandidates,
  hashContext,
  type LoadedLanguagePack,
  loadLanguagePack,
  newWordCard,
  noveltyFactor,
  type ReplacementPatch,
  ratingForSignal,
  retrievabilityOf,
  reviewCard,
  scheduleReplacements,
  tokenizeMessage,
} from "@breadcrumb/plugin-diglot-weave";
import type { Card } from "ts-fsrs";
import { getRepos } from "./db";
import { embedTexts } from "./embeddings";
import { nowIso } from "./time";

const packCache = new Map<DiglotPairId, Promise<LoadedLanguagePack>>();

/** Loads a bundled language pack once per session (validated by the Zod contract). */
export function loadBundledPack(pairId: DiglotPairId): Promise<LoadedLanguagePack> {
  let cached = packCache.get(pairId);
  if (cached === undefined) {
    cached = (async () => {
      if (pairId !== "zh:en") throw new Error(`no bundled pack for pair ${pairId}`);
      const raw = (await import("../assets/language-packs/zh-en.json")).default;
      return loadLanguagePack(raw);
    })();
    packCache.set(pairId, cached);
  }
  return cached;
}

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

  const reviewDebt = (await repos.diglot.listDueStates(pair, nowIso(), 200)).length;
  const newWordBudgetToday = Math.max(
    0,
    adaptiveNewWordCap(input.newWordDailyBase, reviewDebt) - input.newWordsIntroducedToday,
  );

  // Context novelty for review candidates: embed the message once, compare against each
  // candidate's stored context vectors. Degrades to neutral when embeddings are down.
  const noveltyByLemma = new Map<string, number>();
  const reviewCandidates = candidates.filter((c) => input.cardsByLemma.has(c.lemma));
  let messageVector: number[] | null = null;
  if (reviewCandidates.length > 0) {
    messageVector = ((await embedTexts([content])) ?? [null])[0] ?? null;
    for (const candidate of reviewCandidates) {
      const stored = await repos.diglot.listContextEmbeddings(pair, candidate.lemma);
      const pastVectors = stored.map((row) => JSON.parse(row.vector_json) as number[]);
      noveltyByLemma.set(candidate.lemma, noveltyFactor(messageVector, pastVectors));
    }
  }

  const introductionRank = new Map(
    loaded.introductionQueue
      .map((lemma, rank) => [lemma, rank] as const)
      .filter(([, rank]) => rank >= input.introductionRankFloor),
  );
  const scheduled = scheduleReplacements({
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
    card = reviewCard(card, now, rating);
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
