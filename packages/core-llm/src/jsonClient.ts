/**
 * Purpose: JSON-mode chat call — asks the model for a JSON object, validates it against a
 * caller-provided Zod schema, and reports token usage for metering. One malformed reply
 * (bad JSON or a schema mismatch) gets exactly one corrective retry before failing; transport
 * failures are retried a layer below, in retry.ts.
 * Main exports: chatJson, ChatJsonResult, ChatJsonError.
 */
import { z } from "zod";
import { type ChatMessage, type LlmClientConfig, withLanguageDirective } from "./client";
import type { TokenUsage } from "./pricing";
import { fetchWithRetry, NON_STREAMING_TIMEOUT_MS } from "./retry";

export interface ChatJsonResult<Parsed> {
  parsed: Parsed;
  usage: TokenUsage;
}

/**
 * Thrown when chatJson cannot deliver a validated object. It carries the token usage of every
 * call that actually reached the provider before the failure — including the malformed and
 * Zod-rejected ones, which are billed all the same. Callers that meter their spend must read
 * `usage` off this error and record it, or the ledger silently under-counts (宪法原则 2).
 */
export class ChatJsonError extends Error {
  readonly usage: TokenUsage;
  constructor(message: string, usage: TokenUsage, cause: unknown) {
    super(message, { cause });
    this.name = "ChatJsonError";
    this.usage = usage;
  }
}

/** Every chatJson call is a judgement — extract these terms, is this the same concept, score
 * this explanation — where the same input should yield the same verdict twice running.
 * Conversational generation never comes through here (it streams via client.ts), so pinning
 * the temperature for the whole entry point is safe. */
const JUDGEMENT_TEMPERATURE = 0;

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

/** One request/response round: returns the raw content string (not yet schema-validated) plus
 * its usage. Transport hiccups (429, transient 5xx, network) are retried inside fetchWithRetry;
 * anything that survives that, and any malformed envelope, throws — those mean the endpoint
 * itself is broken, not that the model misbehaved. */
async function requestCompletion(
  config: LlmClientConfig,
  messages: readonly ChatMessage[],
): Promise<{ content: string; usage: TokenUsage }> {
  const { response, release } = await fetchWithRetry(
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
        messages: withLanguageDirective(messages, config.answerLanguageDirective),
        stream: false,
        temperature: JUDGEMENT_TEMPERATURE,
        response_format: { type: "json_object" },
      }),
    },
    // Non-streaming, so the deadline covers the whole exchange including reading the body.
    { timeoutMs: NON_STREAMING_TIMEOUT_MS },
  );

  try {
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
  } finally {
    release();
  }
}

/** Parses `content` as JSON and validates it against `schema`; throws the underlying error
 * (JSON.parse SyntaxError or ZodError) unchanged so the caller can read its message. */
function parseAndValidate<Schema extends z.ZodType>(
  content: string,
  schema: Schema,
): z.infer<Schema> {
  return schema.parse(JSON.parse(content));
}

/** The mutable running total of what the provider has already been asked to bill us for.
 * A box rather than a return value because it has to survive the throw. */
interface BilledUsage {
  usage: TokenUsage;
}

async function requestWithOneCorrection<Schema extends z.ZodType>(
  config: LlmClientConfig,
  messages: readonly ChatMessage[],
  schema: Schema,
  billed: BilledUsage,
): Promise<ChatJsonResult<z.infer<Schema>>> {
  const first = await requestCompletion(config, messages);
  billed.usage = first.usage;
  try {
    return { parsed: parseAndValidate(first.content, schema), usage: billed.usage };
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
    billed.usage = sumUsage(first.usage, retry.usage);
    return { parsed: parseAndValidate(retry.content, schema), usage: billed.usage };
  }
}

export async function chatJson<Schema extends z.ZodType>(
  config: LlmClientConfig,
  messages: readonly ChatMessage[],
  schema: Schema,
): Promise<ChatJsonResult<z.infer<Schema>>> {
  // Every failure leaves through here wearing the usage it already cost, so a caller that
  // gives up can still write the row for what it spent instead of dropping it on the floor.
  const billed: BilledUsage = { usage: ZERO_USAGE };
  try {
    return await requestWithOneCorrection(config, messages, schema, billed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ChatJsonError(message, billed.usage, error);
  }
}
