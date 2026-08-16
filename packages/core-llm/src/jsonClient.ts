/**
 * Purpose: JSON-mode chat call — asks the model for a JSON object, validates it against a
 * caller-provided Zod schema, and reports token usage for metering. One malformed reply
 * (bad JSON or a schema mismatch) gets exactly one corrective retry before failing.
 * Main exports: chatJson, ChatJsonResult.
 */
import { z } from "zod";
import type { ChatMessage, LlmClientConfig } from "./client";
import type { TokenUsage } from "./pricing";

export interface ChatJsonResult<Parsed> {
  parsed: Parsed;
  usage: TokenUsage;
}

const completionEnvelopeSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }).nullish() })).default([]),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

const ZERO_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0 };

function sumUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** One request/response round: returns the raw content string (not yet schema-validated)
 * plus its usage, or throws on transport/envelope failure (never retried — those mean the
 * endpoint itself is broken, not that the model misbehaved). */
async function requestCompletion(
  config: LlmClientConfig,
  messages: readonly ChatMessage[],
): Promise<{ content: string; usage: TokenUsage }> {
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

  const envelope = completionEnvelopeSchema.parse(await response.json());
  const content = envelope.choices[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("LLM response missing message content");
  }
  return {
    content,
    usage: envelope.usage
      ? {
          inputTokens: envelope.usage.prompt_tokens,
          outputTokens: envelope.usage.completion_tokens,
        }
      : ZERO_USAGE,
  };
}

/** Parses `content` as JSON and validates it against `schema`; throws the underlying error
 * (JSON.parse SyntaxError or ZodError) unchanged so the caller can read its message. */
function parseAndValidate<Schema extends z.ZodType>(
  content: string,
  schema: Schema,
): z.infer<Schema> {
  return schema.parse(JSON.parse(content));
}

export async function chatJson<Schema extends z.ZodType>(
  config: LlmClientConfig,
  messages: readonly ChatMessage[],
  schema: Schema,
): Promise<ChatJsonResult<z.infer<Schema>>> {
  const first = await requestCompletion(config, messages);
  try {
    return { parsed: parseAndValidate(first.content, schema), usage: first.usage };
  } catch (error) {
    // Mainstream structured-output practice: give the model exactly one chance to correct
    // itself, with the validation error appended as context, before giving up for real.
    const validationMessage = error instanceof Error ? error.message : String(error);
    const retryMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: first.content },
      {
        role: "user",
        content: `你上一条回复不是合法 JSON，或不满足要求的结构。错误信息：${validationMessage}\n请只输出修正后的合法 JSON，不要有其他文字。`,
      },
    ];
    const retry = await requestCompletion(config, retryMessages);
    const parsed = parseAndValidate(retry.content, schema);
    return { parsed, usage: sumUsage(first.usage, retry.usage) };
  }
}
