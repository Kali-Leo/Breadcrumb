/**
 * Purpose: reading the two things a provider payload has to give us — the content delta and
 * the token usage — out of whatever shape it actually arrived in. Its own module because
 * every rule here is about TOLERANCE: the payload comes from a user-configured endpoint that
 * may be a gateway, a proxy or a local runtime, and a single field it wrote badly must never
 * cost the caller an answer already on the screen, nor the usage row for a call the provider
 * has already billed. Shared by the streaming client and the JSON one.
 * Main exports: decodeStreamFrame, StreamFrame, usageFromPayload.
 */
import { z } from "zod";
import type { TokenUsage } from "./pricing";

/** Every count is optional and nullable. Providers that report a partial usage object (only
 * `prompt_tokens`, or `null` placeholders) are common outside OpenAI proper, and an
 * all-or-nothing schema turned that into a thrown ZodError that killed the whole round. */
const usageSchema = z.object({
  prompt_tokens: z.number().nullish(),
  completion_tokens: z.number().nullish(),
  /** DeepSeek (and OpenAI-compatible providers that copy its shape) split the prompt into
   * what the prefix cache served and what had to be read fresh. A cache hit costs roughly
   * 1/30 of a miss, so dropping this field means over-billing every long conversation. */
  prompt_cache_hit_tokens: z.number().nullish(),
});

const streamChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }).nullish() }))
    .default([]),
  usage: usageSchema.nullish(),
});

export interface StreamFrame {
  /** "" when this frame carried no content — the usage-only final frame, or a role stub. */
  delta: string;
  /** Null when the frame reported no usage at all, so a later frame's real numbers are
   * never overwritten by an empty `usage: {}`. */
  usage: TokenUsage | null;
}

/** Null means "this frame is unreadable" — a bare `data: ping` heartbeat, a truncated
 * payload, a shape no OpenAI-compatible provider should send. The caller skips it and counts
 * the degradation; it must not abandon the round over one frame. */
/** The token usage of any OpenAI-compatible response body, streamed frame or not — null when
 * the payload reported none. Deliberately independent of the rest of the envelope: a response
 * whose `choices` are unusable was still billed, and its usage still has to reach the ledger
 * (宪法原则 2). */
export function usageFromPayload(payload: unknown): TokenUsage | null {
  const parsed = z.object({ usage: usageSchema.nullish() }).safeParse(payload);
  return parsed.success ? usageOf(parsed.data.usage) : null;
}

export function decodeStreamFrame(dataLine: string): StreamFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(dataLine);
  } catch {
    return null;
  }
  const parsed = streamChunkSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    delta: parsed.data.choices[0]?.delta?.content ?? "",
    usage: usageOf(parsed.data.usage),
  };
}

function usageOf(usage: z.infer<typeof usageSchema> | null | undefined): TokenUsage | null {
  if (!usage) return null;
  const input = usage.prompt_tokens;
  const output = usage.completion_tokens;
  // Neither count present means this was not a usage report at all. Returning 0/0 for it
  // would erase the real numbers an earlier frame already gave us.
  if (input == null && output == null) return null;
  return {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    cachedInputTokens: usage.prompt_cache_hit_tokens ?? undefined,
  };
}
