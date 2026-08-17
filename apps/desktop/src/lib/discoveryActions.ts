/**
 * Purpose: generates one discovery-feed card batch (spec 051 §5) — guards on
 * network/switch/API config, assembles the exploit/explore/graph-neighbor prompt input from
 * local data, calls the card-batch LLM contract, meters and persists the batch, then embeds
 * the new cards locally (fastembed via lib/embeddings.ts). Guard and generation failures both
 * degrade to a plain reason string for the feed's banner; an embedding failure only logs
 * (recordAiFailure) and leaves those cards to fall in by recency — the cards themselves are
 * already saved and readable, embeddings are a ranking nicety, not a hard dependency.
 * Main exports: generateBatch, GenerateBatchOutcome.
 */
import type { DiscoveryCardRow, DiscoveryCardSource } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildCardBatchMessages,
  cardBatchSchema,
  foldInterestFromEvents,
  pickExploreTopics,
  topicStatsFromEvents,
} from "@breadcrumb/plugin-discovery";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { discoveryRowsToInterestEvents } from "./discoveryOrdering";
import { embedTexts } from "./embeddings";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";
import { newId, nowIso } from "./time";

export type GenerateBatchOutcome =
  | { kind: "generated"; cards: DiscoveryCardRow[] }
  | { kind: "blocked"; reason: string };

/** Same line whether generation was never attempted (offline/switched off) or the LLM call
 * itself came back empty — from the reader's side both mean "no new cards right now", and
 * product principle 1 keeps this a plain statement, never an error tone. */
const OFFLINE_OR_SWITCH_OFF_REASON = "翻过的卡片还能读；新卡片需要联网和开关。";
const GENERATION_FAILED_REASON = "这批新卡片没有生成成功。可以稍后再翻一批。";

const EXPLOIT_TOPIC_COUNT = 5;
const EXPLORE_TOPIC_COUNT = 3;
const GRAPH_NEIGHBOR_TOPIC_COUNT = 5;
const RECENT_TITLES_LIMIT = 60;
const KNOWN_CONCEPTS_LIMIT = 40;
/** Hard ceiling on one card-batch call; past it the batch fails plainly and retries later. */
const BATCH_TIMEOUT_MS = 90_000;

function sourceForCard(topicLabel: string, exploreTopics: readonly string[]): DiscoveryCardSource {
  return exploreTopics.includes(topicLabel) ? "explore" : "nearby";
}

/** Embeds the freshly-inserted cards (title + hook) and persists each vector; returns the
 * cards with embedding_json filled in where the pass succeeded, unchanged otherwise. Never
 * throws — a failure here must not undo an already-persisted, already-readable batch. */
async function embedNewCards(rows: readonly DiscoveryCardRow[]): Promise<DiscoveryCardRow[]> {
  try {
    const vectors = await embedTexts(rows.map((row) => `${row.title}：${row.hook}`));
    if (vectors === null) return [...rows];
    const repos = await getRepos();
    const updated: DiscoveryCardRow[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const vector = vectors[index];
      if (row === undefined) continue;
      if (vector === undefined) {
        updated.push(row);
        continue;
      }
      const embeddingJson = JSON.stringify(vector);
      await repos.discovery.setCardEmbedding(row.id, embeddingJson);
      updated.push({ ...row, embedding_json: embeddingJson });
    }
    return updated;
  } catch (error) {
    await recordAiFailure("discovery", error);
    return [...rows];
  }
}

export async function generateBatch(): Promise<GenerateBatchOutcome> {
  const { networkEnabled, featureSwitches, apiConfig } = useSettingsStore.getState();
  if (!networkEnabled || !featureSwitches.discoveryCards || apiConfig === null) {
    return { kind: "blocked", reason: OFFLINE_OR_SWITCH_OFF_REASON };
  }

  try {
    const repos = await getRepos();
    const [eventRows, existingCards, nodes, recentTitles] = await Promise.all([
      repos.discovery.listAllEvents(),
      repos.discovery.listNewestCards(1),
      repos.knowledgeNodes.listAll(),
      repos.discovery.listRecentTitles(RECENT_TITLES_LIMIT),
    ]);

    const starter = eventRows.length === 0 && existingCards.length === 0;
    const events = discoveryRowsToInterestEvents(eventRows);
    const exploitTopics = foldInterestFromEvents(events, nowIso())
      .filter((weight) => weight.weight > 0)
      .slice(0, EXPLOIT_TOPIC_COUNT)
      .map((weight) => weight.topicLabel);
    const exploreTopics = pickExploreTopics(
      topicStatsFromEvents(events),
      EXPLORE_TOPIC_COUNT,
      Math.random,
    );
    // knowledge_nodes.listAll() is oldest-first (see core-db) — reverse for "most recent".
    const recentNodes = [...nodes].reverse();
    const graphNeighborTopics = recentNodes
      .slice(0, GRAPH_NEIGHBOR_TOPIC_COUNT)
      .map((n) => n.label);
    const knownConcepts = recentNodes.slice(0, KNOWN_CONCEPTS_LIMIT).map((n) => n.label);
    const dislikedTopics = [
      ...new Set(events.filter((e) => e.kind === "dislike").map((e) => e.topicLabel)),
    ].slice(0, 24);

    const config = { ...apiConfig, fetchImpl: tauriFetch };
    // A hung provider must not leave skeleton cards on screen forever (2026-08-17 fix).
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
    const watchdog = new Promise<never>((_, reject) => {
      watchdogTimer = setTimeout(() => reject(new Error("一直没有收到响应")), BATCH_TIMEOUT_MS);
    });
    const batchCall = chatJson(
      config,
      buildCardBatchMessages({
        exploitTopics,
        exploreTopics,
        graphNeighborTopics,
        recentTitles,
        knownConcepts,
        dislikedTopics,
        starter,
      }),
      cardBatchSchema,
    );
    // The abandoned call settling after a timeout must never surface as an unhandled rejection.
    batchCall.catch(() => undefined);
    const { parsed, usage } = await Promise.race([watchdog, batchCall]).finally(() =>
      clearTimeout(watchdogTimer),
    );
    await recordMeteredCall({
      purpose: "discovery-cards",
      model: config.model,
      conversationId: null,
      usage,
      responseHadContent: parsed.cards.length > 0,
    });

    const batchId = newId();
    const createdAt = nowIso();
    const rows: DiscoveryCardRow[] = parsed.cards.map((card) => ({
      id: newId(),
      title: card.title,
      hook: card.hook,
      topic_label: card.topicLabel,
      source: starter ? "starter" : sourceForCard(card.topicLabel, exploreTopics),
      body_md: null,
      embedding_json: null,
      batch_id: batchId,
      created_at: createdAt,
      opened_at: null,
      // Spec 053's external-content columns stay NULL on self-generated cards.
      source_id: null,
      kind: null,
      url: null,
      cover_url: null,
      author: null,
      published_at: null,
      saved_at: null,
      quality_score: null,
      upstream_signal: null,
      media_url: null,
    }));
    await repos.discovery.insertCards(rows);
    const embeddedRows = await embedNewCards(rows);

    return { kind: "generated", cards: embeddedRows };
  } catch (error) {
    await recordAiFailure("discovery", error);
    return { kind: "blocked", reason: GENERATION_FAILED_REASON };
  }
}
