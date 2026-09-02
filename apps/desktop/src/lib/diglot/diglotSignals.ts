/**
 * Purpose: the diglot weave's read-back and write-back half — recording one learner signal
 * against a word's FSRS card, spotting target-language words the learner produced on their
 * own, and loading a pair's stored cards into the scheduler's working map. Split out of
 * diglotWeave.ts (which keeps the per-message patch pipeline) purely to keep both files
 * under the file-size ceiling.
 * Side effects: DB writes (word events, card state).
 * Main exports: applyDiglotSignal, findProductiveUses, loadCards.
 */
import type { DiglotEventKind, DiglotPairId } from "@breadcrumb/core-db";
import {
  cardFromJson,
  cardToJson,
  hashContext,
  type LoadedLanguagePack,
  ratingForSignal,
  reviewCard,
  tokenizeMessage,
} from "@breadcrumb/feature-diglot-weave";
import type { Card } from "ts-fsrs";
import { getRepos } from "../platform/db";
import { nowIso } from "../platform/time";

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
  const cards = new Map<string, Card>();
  for (const state of states) {
    // A word whose stored card is unreadable drops out of the working map: it will be
    // introduced fresh next time, which is a far smaller loss than a scheduler running on NaN.
    const card = cardFromJson(state.fsrs_json);
    if (card !== null) cards.set(state.lemma, card);
  }
  return cards;
}
