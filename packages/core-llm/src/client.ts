/**
 * Purpose: minimal OpenAI-compatible chat client with SSE streaming and Zod-validated
 * responses. Headless: the fetch implementation is injected (Tauri http plugin in the app,
 * a fake in tests).
 * Main exports: createLlmClient, LlmClientConfig, ChatMessage, ChatStreamResult,
 * ChatStreamOptions.
 */
import { z } from "zod";
import type { TokenUsage } from "./pricing";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LlmClientConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
}

export interface ChatStreamResult {
  content: string;
  usage: TokenUsage;
}

const streamChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }).nullish() }))
    .default([]),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
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
      const response = await config.fetchImpl(
        `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({
            model: config.model,
            messages,
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal,
        },
      );
      if (!response.ok || response.body === null) {
        throw new Error(`LLM request failed: HTTP ${response.status}`);
      }

      let content = "";
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
      try {
        for await (const dataLine of readSseDataLines(response.body)) {
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
            };
          }
        }
      } catch (error) {
        // An aborted fetch errors the body stream from the inside, so the drain-not-cancel
        // rule of readSseDataLines is respected — we never call cancel ourselves. Whatever
        // the fetch implementation throws for its own teardown (Tauri's http plugin surfaces
        // internal resource errors, not AbortError) is normalized to one recognizable shape.
        if (signal?.aborted) {
          throw new DOMException("chatStream aborted by its caller", "AbortError");
        }
        throw error;
      }
      return { content, usage };
    },
  };
}

/** Yields the payload of every `data:` line across chunk boundaries of an SSE byte stream,
 * stopping at `[DONE]`. The stream is then drained to its natural end instead of being
 * cancelled: breaking out of `for await` cancels the underlying stream, and the Tauri http
 * plugin's cancel on an already-finished response rejects a detached promise with
 * "The resource id N is invalid" — an unhandled rejection we must never produce. */
async function* readSseDataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffered = "";
  let sawDone = false;
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    if (sawDone) continue;
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        sawDone = true;
        break;
      }
      yield payload;
    }
  }
}
