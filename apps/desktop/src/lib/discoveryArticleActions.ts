/**
 * Purpose: streams one discovery card's full article body on first open (spec 051 §2) —
 * mirrors focus mode's explain-stream pattern (lib/focusExplainStream.ts: createLlmClient +
 * chatStream + a silence/total watchdog) but under the dedicated "discovery-article" metering
 * purpose, and persists only the finished body (repos.discovery.setCardBody), never a partial.
 * Main exports: streamCardArticle, StreamCardArticleOutcome.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { createLlmClient } from "@breadcrumb/core-llm";
import { buildArticleMessages } from "@breadcrumb/plugin-discovery";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";

export type StreamCardArticleOutcome =
  | { kind: "streamed"; bodyMd: string }
  | { kind: "blocked"; reason: string };

/** A stalled upstream once left an overlay on "…" forever (2026-08-14, focus mode) — same
 * watchdog shape here so a silent discovery-article stream degrades to a plain, retryable
 * failure instead of hanging. */
const FIRST_DELTA_TIMEOUT_MS = 30_000;
const STREAM_TOTAL_TIMEOUT_MS = 180_000;
const BLOCKED_REASON = "这张卡片的正文需要联网和开关才能生成。";
const FAILED_REASON = "这张卡片的正文没有生成成功。可以重新点开再试一次。";

export async function streamCardArticle(
  card: DiscoveryCardRow,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<StreamCardArticleOutcome> {
  const { networkEnabled, featureSwitches, apiConfig } = useSettingsStore.getState();
  if (!networkEnabled || !featureSwitches.discoveryArticles || apiConfig === null) {
    return { kind: "blocked", reason: BLOCKED_REASON };
  }

  const client = createLlmClient({ ...apiConfig, fetchImpl: tauriFetch });
  const messages = buildArticleMessages({
    title: card.title,
    hook: card.hook,
    topicLabel: card.topic_label,
  });
  let sawDelta = false;
  let abandoned = false;
  const stream = client.chatStream(
    messages,
    (delta) => {
      if (abandoned) return;
      sawDelta = true;
      onDelta(delta);
    },
    { signal },
  );
  const timers: number[] = [];
  const watchdog = new Promise<never>((_, reject) => {
    timers.push(
      window.setTimeout(() => {
        if (!sawDelta) reject(new Error("一直没有收到响应"));
      }, FIRST_DELTA_TIMEOUT_MS),
      window.setTimeout(() => reject(new Error("响应超时")), STREAM_TOTAL_TIMEOUT_MS),
    );
  });

  try {
    const result = await Promise.race([stream, watchdog]);
    await recordMeteredCall({
      purpose: "discovery-article",
      model: apiConfig.model,
      conversationId: null,
      usage: result.usage,
      responseHadContent: result.content.length > 0,
    });
    const repos = await getRepos();
    await repos.discovery.setCardBody(card.id, result.content);
    return { kind: "streamed", bodyMd: result.content };
  } catch (error) {
    if (signal?.aborted) return { kind: "blocked", reason: FAILED_REASON };
    await recordAiFailure("discovery", error);
    return { kind: "blocked", reason: FAILED_REASON };
  } finally {
    abandoned = true;
    for (const timer of timers) window.clearTimeout(timer);
    stream.catch(() => undefined);
  }
}
