/**
 * Purpose: minimal OpenAI-compatible chat client with SSE streaming and Zod-validated
 * responses. Headless: the fetch implementation is injected (Tauri http plugin in the app,
 * a fake in tests).
 * Main exports: createLlmClient, LlmClientConfig, ChatMessage, ChatStreamResult,
 * ChatStreamOptions.
 */

import { z } from "zod";
import type { TokenUsage } from "./pricing";
import {
  fetchWithRetry,
  LlmTimeoutError,
  llmAbortError,
  STREAM_FIRST_BYTE_TIMEOUT_MS,
} from "./retry";
import { readSseDataLines } from "./sseLines";

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
}

const streamChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }).nullish() }))
    .default([]),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      /** DeepSeek (and OpenAI-compatible providers that copy its shape) split the prompt
       * into what the prefix cache served and what had to be read fresh. A cache hit costs
       * roughly 1/30 of a miss, so dropping this field means over-billing every long
       * conversation. Optional: providers that do not cache simply omit it. */
      prompt_cache_hit_tokens: z.number().nullish(),
    })
    .nullish(),
});

export interface ChatStreamOptions {
  /** Aborting this signal is the ONE supported way to cancel a stream mid-flight: it
   * cancels at the fetch layer, whose implementation owns its stream teardown. Consumers
   * must never break out of the stream themselves (see readSseDataLines). On abort,
   * chatStream rejects with a DOMException named "AbortError". */
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
      // Retries live in the transport layer (retry.ts); the deadline here is FIRST BYTE only,
      // cleared as soon as a chunk arrives — a total budget would kill long healthy answers.
      const { response, clearDeadline, release, timedOut } = await fetchWithRetry(
        config.fetchImpl,
        `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
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
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      try {
        for await (const dataLine of readSseDataLines(response.body)) {
          clearDeadline();
          const chunk = streamChunkSchema.parse(JSON.parse(dataLine));
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            content += delta;
            onDelta(delta);
          }
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
              cachedInputTokens: chunk.usage.prompt_cache_hit_tokens ?? undefined,
            };
          }
        }
      } catch (error) {
        // An aborted fetch errors the body stream from the inside, so the drain-not-cancel
        // rule of readSseDataLines is respected — we never call cancel ourselves. Whatever
        // the fetch implementation throws for its own teardown (Tauri's http plugin surfaces
        // internal resource errors, not AbortError) is normalized to one recognizable shape.
        if (signal?.aborted) {
          throw llmAbortError("chatStream aborted by its caller");
        }
        // The other abort we can cause ourselves: the first-byte deadline fired before any
        // chunk arrived, so the stream died from a hang rather than from the user.
        if (timedOut()) {
          throw new LlmTimeoutError(STREAM_FIRST_BYTE_TIMEOUT_MS);
        }
        throw error;
      } finally {
        release();
      }
      return { content, usage };
    },
  };
}
