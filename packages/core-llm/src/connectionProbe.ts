/**
 * Purpose: answering "why can't it reach my AI service?" with something better than silence.
 * The settings page can save a key and show a tick without ever having spoken to the
 * provider, so a wrong address, a dead key, an empty balance and a browser that refuses the
 * request all look identical to the learner. This module makes one deliberately tiny request
 * (`max_tokens: 1`, no streaming) and turns whatever happens into ONE of a fixed set of
 * outcomes, each of which has a different next step for the person reading it.
 *
 * Two rules this module exists to keep:
 * - It never returns, logs, or wraps the provider's own error text, and never the API key.
 *   The result is an enum plus token usage — there is no string here that could carry a
 *   secret to a log file.
 * - It does NOT retry. fetchWithRetry would turn one 429 into three and hide a rate limit
 *   behind a longer wait; a diagnosis wants the FIRST answer, not the most persistent one.
 *
 * The call is real and is billed (a few tokens), so callers must meter it like any other.
 * Main exports: probeConnection, ConnectionProbeOutcome, ConnectionProbeResult.
 */
import { z } from "zod";
import type { LlmClientConfig } from "./client";
import { completionsUrl } from "./completionsUrl";
import type { TokenUsage } from "./pricing";

/**
 * What the one probe request found out. Every value here has to lead to a different sentence
 * and a different next step for the learner — that is the whole reason the set is this wide.
 *
 * - `ok` — the provider answered with a chat completion.
 * - `badUrl` — the address is not a usable URL, or would put the key on a plaintext link.
 *   Decided locally, so this one costs nothing and never leaves the machine.
 * - `offline` — the device reports no network, or the app's own network switch is off.
 * - `timeout` — nothing came back inside the probe's budget.
 * - `blockedByBrowser` — `fetch` threw a TypeError. In a browser that is the single shape
 *   used for BOTH a CORS refusal and a dead link: the page is not allowed to know which.
 * - `unreachable` — the request threw in some other way (the desktop build's HTTP client
 *   does not use TypeError), so all we know is that it did not arrive.
 * - `unauthorized` (401/403) — the key was rejected.
 * - `insufficientBalance` (402) — the account has no credit left.
 * - `notFound` (404, and a 200 that is not a chat completion) — something is at that address,
 *   but it is not an OpenAI-compatible chat endpoint.
 * - `rateLimited` (429) — too many requests, right now.
 * - `badRequest` (other 4xx) — the endpoint refused the request itself; a mistyped model
 *   name is by far the most common cause.
 * - `serverError` (5xx) — the provider's own fault.
 */
export type ConnectionProbeOutcome =
  | "ok"
  | "badUrl"
  | "offline"
  | "timeout"
  | "blockedByBrowser"
  | "unreachable"
  | "unauthorized"
  | "insufficientBalance"
  | "notFound"
  | "rateLimited"
  | "badRequest"
  | "serverError";

export interface ConnectionProbeResult {
  outcome: ConnectionProbeOutcome;
  /** What the provider says this probe cost, when it reported usage at all. The call is
   * charged like any other, so a caller that meters spend must record this. */
  usage?: TokenUsage;
}

/** Someone is watching a button spin. Long enough for a slow link on a poor connection,
 * short enough that "it is not going to answer" is itself an answer. */
export const PROBE_TIMEOUT_MS = 20_000;

/** The name gatedFetch (and any other network gate) gives the error it throws instead of
 * dialling out. Matched by name rather than by class so this package keeps no dependency on
 * the application that owns the switch. */
const NETWORK_DISABLED_ERROR_NAME = "NetworkDisabledError";

/** `choices` being a present array is what separates a real completion from an HTML error
 * page or a proxy's "hello" — both of which arrive as HTTP 200 and would otherwise be
 * reported as a working AI service. */
const probeEnvelopeSchema = z.object({
  choices: z.array(z.unknown()),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      prompt_cache_hit_tokens: z.number().nullish(),
    })
    .nullish(),
});

function classifyStatus(status: number): ConnectionProbeOutcome {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "insufficientBalance";
  if (status === 404) return "notFound";
  if (status === 429) return "rateLimited";
  if (status >= 500) return "serverError";
  return "badRequest";
}

function classifyThrow(error: unknown, expired: boolean): ConnectionProbeOutcome {
  if (expired) return "timeout";
  if (error instanceof Error && error.name === NETWORK_DISABLED_ERROR_NAME) return "offline";
  if (error instanceof TypeError) return "blockedByBrowser";
  return "unreachable";
}

function usageOf(envelope: z.infer<typeof probeEnvelopeSchema>): TokenUsage | undefined {
  if (!envelope.usage) return undefined;
  return {
    inputTokens: envelope.usage.prompt_tokens,
    outputTokens: envelope.usage.completion_tokens,
    cachedInputTokens: envelope.usage.prompt_cache_hit_tokens ?? undefined,
  };
}

/** The smallest thing that still exercises the whole path: authentication, the model name,
 * and the endpoint's willingness to generate. One token of output keeps the bill at rounding
 * error while still proving the service actually works. */
function probeBody(model: string): string {
  return JSON.stringify({
    model,
    messages: [{ role: "user", content: "hi" }],
    stream: false,
    max_tokens: 1,
  });
}

/**
 * One tiny chat request, classified. Never throws for a transport or provider failure — the
 * failure IS the return value; only a caller-side programming error could escape.
 */
export async function probeConnection(config: LlmClientConfig): Promise<ConnectionProbeResult> {
  // Asked before anything is spent: a device that knows it is offline can say so for free.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { outcome: "offline" };

  let url: string;
  try {
    url = completionsUrl(config.baseUrl);
  } catch {
    return { outcome: "badUrl" };
  }

  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    controller.abort();
  }, PROBE_TIMEOUT_MS);

  try {
    const response = await config.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: probeBody(config.model),
      signal: controller.signal,
    });
    if (!response.ok) return { outcome: classifyStatus(response.status) };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      // Not JSON at all: an error page, or a proxy that answers everything with a greeting.
      return { outcome: expired ? "timeout" : "notFound" };
    }
    const envelope = probeEnvelopeSchema.safeParse(payload);
    // A 200 that is not a chat completion means the address points at something else
    // entirely — the same thing a 404 means, and the same thing to do about it.
    if (!envelope.success) return { outcome: "notFound" };
    return { outcome: "ok", usage: usageOf(envelope.data) };
  } catch (error) {
    return { outcome: classifyThrow(error, expired) };
  } finally {
    clearTimeout(timer);
  }
}
