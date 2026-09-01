/**
 * Purpose: orchestrates the zero-LLM demo seed (spec 035 T7b) — wires the conversation,
 * concept, claim and word builders together and writes every row via the real core-db
 * repositories (so schema/constraint correctness is guaranteed, not assumed).
 * Main exports: SeedSummary, insertDemoData.
 */
import {
  createConversationsRepo,
  createDiglotRepo,
  createKnowledgeNodesRepo,
  createMasteryClaimsRepo,
  createMessagesRepo,
  createNodeSightingsRepo,
  type SqlClient,
} from "@breadcrumb/core-db";
import { buildClaimSeed } from "./claims";
import { buildConceptSeed } from "./concepts";
import { buildDemoConversations } from "./conversations";
import { buildWordSeed } from "./words";

export interface SeedSummary {
  conversations: number;
  messages: number;
  nodes: number;
  sightings: number;
  claims: number;
  wordStates: number;
  wordEvents: number;
  wordGuesses: number;
}

/** Inserts the full demo landscape anchored at `now` (pass a fixed Date in tests for
 * reproducibility; the CLI passes the real `new Date()`). Node labels already present in the
 * DB are skipped (concepts.ts), so this is safe to run against a database that already has
 * some of the user's real tree. */
export interface DemoSeedOptions {
  /** The raw zh:en language pack JSON. Omit to seed everything except vocabulary — the tour
   * does not need words, and language learning is off by default, so a caller that has no
   * pack to hand still gets a complete map, heatmap and history. */
  languagePack?: unknown;
}

export async function insertDemoData(
  sql: SqlClient,
  now: Date,
  options: DemoSeedOptions = {},
): Promise<SeedSummary> {
  const knowledgeNodes = createKnowledgeNodesRepo(sql);
  const nodeSightings = createNodeSightingsRepo(sql);
  const conversationsRepo = createConversationsRepo(sql);
  const messagesRepo = createMessagesRepo(sql);
  const masteryClaims = createMasteryClaimsRepo(sql);
  const diglot = createDiglotRepo(sql);

  const existingLabels = new Set((await knowledgeNodes.listAll()).map((node) => node.label));

  const conversations = buildDemoConversations(now);
  for (const conversation of conversations.conversations) {
    await conversationsRepo.create(conversation);
  }
  for (const message of conversations.messages) {
    await messagesRepo.append(message);
  }

  const concepts = buildConceptSeed(now, existingLabels, conversations);
  for (const node of concepts.nodes) {
    await knowledgeNodes.insert(node);
  }
  for (const sighting of concepts.sightings) {
    await nodeSightings.record(sighting);
  }

  const claims = buildClaimSeed(now, concepts.nodeIdByLabel);
  for (const claim of claims) {
    await masteryClaims.insert(claim);
  }

  const words =
    options.languagePack === undefined ? null : buildWordSeed(now, options.languagePack);
  if (words !== null) {
    await diglot.upsertPack(words.pack);
    for (const state of words.states) {
      await diglot.upsertState(state);
    }
    for (const event of words.events) {
      await diglot.insertEvent(event);
    }
    for (const guess of words.guesses) {
      await diglot.insertGuess(guess);
    }
  }

  return {
    conversations: conversations.conversations.length,
    messages: conversations.messages.length,
    nodes: concepts.nodes.length,
    sightings: concepts.sightings.length,
    claims: claims.length,
    wordStates: words?.states.length ?? 0,
    wordEvents: words?.events.length ?? 0,
    wordGuesses: words?.guesses.length ?? 0,
  };
}
