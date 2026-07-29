/**
 * Purpose: one-shot JSON-mode chat call — asks the model for a JSON object, validates it
 * against a caller-provided Zod schema, and reports token usage for metering.
 * Main exports: chatJson, ChatJsonResult.
 */
import type { z } from "zod";
import type { ChatMessage, LlmClientConfig } from "./client";
import type { TokenUsage } from "./pricing";

export interface ChatJsonResult<Parsed> {
  parsed: Parsed;
  usage: TokenUsage;
}

interface CompletionResponseShape {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function chatJson<Schema extends z.ZodType>(
  config: LlmClientConfig,
  messages: readonly ChatMessage[],
  schema: Schema,
): Promise<ChatJsonResult<z.infer<Schema>>> {
  const response = await config.fetchImpl(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: false,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) {
    throw new Error(`LLM request failed: HTTP ${response.status}`);
  }

  const completion = (await response.json()) as CompletionResponseShape;
  const content = completion.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("LLM response missing message content");
  }
  const parsed = schema.parse(JSON.parse(content));
  return {
    parsed,
    usage: {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
    },
  };
}
