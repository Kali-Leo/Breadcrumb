/**
 * Purpose: minimal OpenAI-compatible chat client with SSE streaming and Zod-validated
 * responses. Headless: the fetch implementation is injected (Tauri http plugin in the app,
 * a fake in tests).
 * Main exports: createLlmClient, LlmClientConfig, ChatMessage, ChatStreamResult,
 * ChatStreamOptions, ChatStreamAbortedError.
 */

import { completionsUrl } from "./completionsUrl";
import type { TokenUsage } from "./pricing";
import {
  fetchWithRetry,
  LlmTimeoutError,
  STREAM_FIRST_BYTE_TIMEOUT_MS,
  STREAM_IDLE_TIMEOUT_MS,
} from "./retry";
import { readSseDataLines } from "./sseLines";
import { decodeStreamFrame } from "./streamFrame";

/** Ceiling on one answer. Roughly 2M characters is far beyond any model's context, let alone
 * one reply; reaching it means the endpoint is feeding us an endless stream, and the renderer
 * would otherwise hold the whole thing (plus every re-render of it) in memory. */
export const MAX_STREAM_CONTENT_CHARS = 2_000_000;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
  /** Appended as a final system message on every request: which language to write in
   * (spec 058 §1). Undefined leaves the messages exactly as the caller built them. */
  answerLanguageDirective?: string;
}

/** The language directive goes last so it is the most recent instruction the model reads. */
export function withLanguageDirective(
  messages: readonly ChatMessage[],
  directive: string | undefined,
): readonly ChatMessage[] {
  return directive === undefined || directive === ""
    ? messages
    : [...messages, { role: "system", content: directive }];
}

export interface ChatStreamResult {
  content: string;
  usage: TokenUsage;
  /** How many `data:` frames were unreadable and skipped. Always 0 against a well-behaved
   * provider; anything else is a silent degradation the caller may want to surface. */
  skippedFrames: number;
}

/**
 * The abort chatStream throws when its caller pressed stop. Named "AbortError" so every
 * existing abort check still recognizes it, but unlike the bare DOMException it carries what
 * the round had already produced: the content streamed so far and, crucially, the usage the
 * provider reported before the stop. The provider bills the prompt and everything it
 * generated whether or not we kept listening, so dropping this usage under-counts a real
 * charge (宪法原则 2).
 */
export class ChatStreamAbortedError extends Error {
  readonly content: string;
  readonly usage: TokenUsage;
  constructor(message: string, content: string, usage: TokenUsage) {
    super(message);
    this.name = "AbortError";
    this.content = content;
    this.usage = usage;
  }
}

export interface ChatStreamOptions {
  /** Aborting this signal is the ONE supported way to cancel a stream mid-flight: it
   * cancels at the fetch layer, whose implementation owns its stream teardown. Consumers
   * must never break out of the stream themselves (see readSseDataLines). On abort,
   * chatStream rejects with a ChatStreamAbortedError — named "AbortError", and carrying the
   * partial content and billed usage so the caller can still persist and meter them. */
  signal?: AbortSignal;
}

export interface LlmClient {
  /** Streams one chat completion; onDelta fires per content fragment. */
  chatStream(
    messages: readonly ChatMessage[],
    onDelta: (text: string) => void,
    options?: ChatStreamOptions,
  ): Promise<ChatStreamResult>;
}

export function createLlmClient(config: LlmClientConfig): LlmClient {
  return {
    async chatStream(messages, onDelta, options) {
      const signal = options?.signal;
      const withLanguage = withLanguageDirective(messages, config.answerLanguageDirective);
      // Retries live in the transport layer (retry.ts); the deadline here starts as a
      // FIRST-BYTE budget and then slides per chunk — a total budget would kill long healthy
      // answers, while never re-arming would let a stalled stream hang forever.
      const { response, armDeadline, release, timedOut } = await fetchWithRetry(
        config.fetchImpl,
        completionsUrl(config.baseUrl),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages: withLanguage,
            stream: true,
            stream_options: { include_usage: true },
          }),
        },
        { signal, timeoutMs: STREAM_FIRST_BYTE_TIMEOUT_MS },
      );
      if (response.body === null) {
        release();
        throw new Error(`LLM request failed: HTTP ${response.status}`);
      }

      let content = "";
      let sawChunk = false;
      let skippedFrames = 0;
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      const onChunk = (): void => {
        sawChunk = true;
        armDeadline(STREAM_IDLE_TIMEOUT_MS);
      };
      try {
        for await (const dataLine of readSseDataLines(response.body, onChunk)) {
          // One bad frame is a degradation, not a failure: heartbeats written as `data: ping`
          // and half-shaped chunks are ordinary gateway behaviour, and throwing here threw
          // away an answer the reader was already looking at.
          const frame = decodeStreamFrame(dataLine);
          if (frame === null) {
            skippedFrames += 1;
            continue;
          }
          if (frame.delta !== "") {
            content += frame.delta;
            if (content.length > MAX_STREAM_CONTENT_CHARS) {
              throw new Error(`LLM stream exceeded ${MAX_STREAM_CONTENT_CHARS} characters`);
            }
            onDelta(frame.delta);
          }
          if (frame.usage !== null) usage = frame.usage;
        }
      } catch (error) {
        // An aborted fetch errors the body stream from the inside, so the drain-not-cancel
        // rule of readSseDataLines is respected — we never call cancel ourselves. Whatever
        // the fetch implementation throws for its own teardown (Tauri's http plugin surfaces
        // internal resource errors, not AbortError) is normalized to one recognizable shape.
        if (signal?.aborted) {
          throw new ChatStreamAbortedError("chatStream aborted by its caller", content, usage);
        }
        // The other abort we can cause ourselves: the deadline fired — before the first
        // chunk, or after the stream went silent mid-answer. Either way it died from a hang
        // rather than from the user; the budget named is the one that was actually running.
        if (timedOut()) {
          throw new LlmTimeoutError(
            sawChunk ? STREAM_IDLE_TIMEOUT_MS : STREAM_FIRST_BYTE_TIMEOUT_MS,
          );
        }
        throw error;
      } finally {
        release();
      }
      return { content, usage, skippedFrames };
    },
  };
}
