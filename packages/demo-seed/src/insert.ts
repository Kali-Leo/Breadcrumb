/**
 * Purpose: orchestrates the zero-LLM demo seed — wires the conversation,
 * concept, claim, interest, goal and word builders together and writes every row via the real
 * core-db repositories (so schema/constraint correctness is guaranteed, not assumed).
 * Main exports: SeedSummary, insertDemoData.
 */
import {
  createConversationsRepo,
  createDiglotRepo,
  createGoalsRepo,
  createInterestSignalsRepo,
  createKnowledgeEdgesRepo,
  createKnowledgeNodesRepo,
  createMasteryClaimsRepo,
  createMessagesRepo,
  createNodeSightingsRepo,
  type SqlClient,
} from "@breadcrumb/core-db";
import { buildClaimSeed } from "./claims";
import { buildConceptSeed } from "./concepts";
import { buildDemoConversations } from "./conversations";
import { buildGoalSeed } from "./goal";
import { buildInterestSeed } from "./interest";
import { demoTextFor } from "./text";
import { wipeDemoData } from "./wipe";
import { buildWordSeed } from "./words";

export interface SeedSummary {
  conversations: number;
  messages: number;
  nodes: number;
  sightings: number;
  claims: number;
  /** The requires edges the demo goal's decomposition wrote between its own nodes. */
  edges: number;
  interestSignals: number;
  /** 1 normally; 0 only if every one of the goal's concepts was skipped as an existing label. */
  goals: number;
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
  /** Interface language of the reader this demo is being installed for. The example is the
   * first thing a newcomer reads, so it has to be in a language they read; omit only where
   * there is no reader, and the source language stands in. */
  language?: string;
}

/**
 * Writes the demo learner, replacing any previous copy.
 *
 * The wipe is load-bearing, not tidiness. Only knowledge nodes are guarded against
 * duplicates below (labels that already exist are skipped); conversations, messages, mastery
 * claims and words all carry fixed `demo-` ids and collide on the primary key the second time
 * round. Every caller had to remember to wipe first, and the first one that forgot handed a
 * user a raw UNIQUE constraint error — so the invariant lives here now, where it cannot be
 * forgotten. It also repairs a half-written seed from an interrupted attempt.
 */
export async function insertDemoData(
  sql: SqlClient,
  now: Date,
  options: DemoSeedOptions = {},
): Promise<SeedSummary> {
  await wipeDemoData(sql);
  const text = demoTextFor(options.language);
  const knowledgeNodes = createKnowledgeNodesRepo(sql);
  const nodeSightings = createNodeSightingsRepo(sql);
  const conversationsRepo = createConversationsRepo(sql);
  const messagesRepo = createMessagesRepo(sql);
  const masteryClaims = createMasteryClaimsRepo(sql);
  const interestSignals = createInterestSignalsRepo(sql);
  const knowledgeEdges = createKnowledgeEdgesRepo(sql);
  const goals = createGoalsRepo(sql);
  const diglot = createDiglotRepo(sql);

  const existingLabels = new Set((await knowledgeNodes.listAll()).map((node) => node.label));

  const conversations = buildDemoConversations(now, text);
  for (const conversation of conversations.conversations) {
    await conversationsRepo.create(conversation);
  }
  for (const message of conversations.messages) {
    await messagesRepo.append(message);
  }

  const concepts = buildConceptSeed(now, existingLabels, conversations, text);
  for (const node of concepts.nodes) {
    await knowledgeNodes.insert(node);
  }
  for (const sighting of concepts.sightings) {
    await nodeSightings.record(sighting);
  }

  const claims = buildClaimSeed(now, concepts.nodeIdById);
  for (const claim of claims) {
    await masteryClaims.insert(claim);
  }

  const signals = buildInterestSeed(now, concepts.nodeIdById, conversations);
  for (const signal of signals) {
    await interestSignals.insert(signal);
  }

  // Edges and the goal row after the nodes they point at, or the foreign key rejects them.
  const goalSeed = buildGoalSeed(now, concepts.nodeIdById, text);
  for (const edge of goalSeed.edges) {
    await knowledgeEdges.upsert(edge);
  }
  if (goalSeed.goal !== null) {
    await goals.insert(goalSeed.goal);
  }

  const words =
    options.languagePack === undefined ? null : buildWordSeed(now, options.languagePack, text);
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
    edges: goalSeed.edges.length,
    interestSignals: signals.length,
    goals: goalSeed.goal === null ? 0 : 1,
    wordStates: words?.states.length ?? 0,
    wordEvents: words?.events.length ?? 0,
    wordGuesses: words?.guesses.length ?? 0,
  };
}
