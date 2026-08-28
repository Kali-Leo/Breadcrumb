/**
 * Purpose: runs one focus-session node's streaming completion and meters it under the
 * dedicated "focus-explain" purpose (spec 042 §2) — no history assembly, no persistence;
 * callers own building the prompt messages, saving the resulting node, and error handling.
 * Main exports: streamFocusAnswer.
 */
import { type ChatMessage, createLlmClient, type TokenUsage } from "@breadcrumb/core-llm";
import i18next from "i18next";
import type { ApiConfig } from "../stores/settingsStore";
import { llmConfigFrom } from "./llmConfig";
import { recordMeteredCall } from "./metering";

export interface StreamFocusAnswerInput {
  messages: readonly ChatMessage[];
  apiConfig: ApiConfig;
  conversationId: string;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
}

export interface StreamFocusAnswerResult {
  content: string;
  usage: TokenUsage;
}

/** A stalled upstream once left the overlay on "…" forever (2026-08-14): the SSE promise
 * never settles, so nothing errors and nothing recovers. The watchdog turns silence into a
 * plain, retryable failure. */
const FIRST_DELTA_TIMEOUT_MS = 30_000;
const STREAM_TOTAL_TIMEOUT_MS = 180_000;

/** Streams a focus node's answer and records its cost. Throws on failure or on watchdog
 * timeout — the caller (the focus overlay) owns recordAiFailure and the plain error line.
 * After a timeout, late deltas from the abandoned stream are dropped, never rendered. */
export async function streamFocusAnswer(
  input: StreamFocusAnswerInput,
): Promise<StreamFocusAnswerResult> {
  const client = createLlmClient(llmConfigFrom(input.apiConfig));
  let abandoned = false;
  let sawDelta = false;
  const stream = client.chatStream(
    input.messages,
    (delta) => {
      if (abandoned) return;
      sawDelta = true;
      input.onDelta(delta);
    },
    { signal: input.signal },
  );
  const timers: number[] = [];
  const watchdog = new Promise<never>((_, reject) => {
    timers.push(
      window.setTimeout(() => {
        if (!sawDelta) reject(new Error(i18next.t("learning:focus.errorNoResponse")));
      }, FIRST_DELTA_TIMEOUT_MS),
      window.setTimeout(
        () => reject(new Error(i18next.t("learning:focus.errorTimedOut"))),
        STREAM_TOTAL_TIMEOUT_MS,
      ),
    );
  });
  try {
    const result = await Promise.race([stream, watchdog]);
    await recordMeteredCall({
      purpose: "focus-explain",
      conversationId: input.conversationId,
      model: input.apiConfig.model,
      usage: result.usage,
      responseHadContent: result.content.length > 0,
    });
    return { content: result.content, usage: result.usage };
  } finally {
    abandoned = true;
    for (const timer of timers) window.clearTimeout(timer);
    stream.catch(() => undefined); // the abandoned stream's own rejection must not go unhandled
  }
}
