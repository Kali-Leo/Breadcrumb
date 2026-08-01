/**
 * Purpose: shared non-streaming chat-completion call, used by tutor.ts and student.ts as a
 * fallback when core-llm's chatStream can't async-iterate the fetch implementation's
 * response body (see each caller for exactly when that happens).
 * Main exports: nonStreamingChat, NonStreamingChatResult.
 */
import type { ChatMessage, LlmClientConfig, TokenUsage } from "@breadcrumb/core-llm";

export interface NonStreamingChatResult {
  content: string;
  usage: TokenUsage;
}

interface CompletionResponseShape {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function nonStreamingChat(
  config: LlmClientConfig,
  messages: readonly ChatMessage[],
): Promise<NonStreamingChatResult> {
  const response = await config.fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({ model: config.model, messages, stream: false }),
  });
  if (!response.ok) {
    throw new Error(`LLM request failed: HTTP ${response.status}`);
  }
  const completion = (await response.json()) as CompletionResponseShape;
  const content = completion.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("LLM response missing message content");
  }
  return {
    content,
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}
