/**
 * Purpose: proving the probe can actually TELL APART the failures it claims to distinguish.
 * The whole point of the feature is that "it doesn't work" becomes a specific sentence with
 * a specific next step, so every branch here stands for one of those sentences. Also guards
 * the two rules the module exists to keep: it never retries, and it never carries the
 * provider's own text (or the key) out with it.
 */
import { describe, expect, it, vi } from "vitest";
import { type ConnectionProbeOutcome, probeConnection } from "./connectionProbe";

const CONFIG = {
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-secret-value",
  model: "some-model",
};

function completionResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const GOOD_BODY = {
  choices: [{ message: { content: "hi" } }],
  usage: { prompt_tokens: 7, completion_tokens: 1 },
};

async function probeWith(fetchImpl: typeof fetch): Promise<ConnectionProbeOutcome> {
  return (await probeConnection({ ...CONFIG, fetchImpl })).outcome;
}

describe("probeConnection", () => {
  it("reports ok, with the usage the provider billed, for a real completion", async () => {
    const result = await probeConnection({
      ...CONFIG,
      fetchImpl: async () => completionResponse(GOOD_BODY),
    });
    expect(result.outcome).toBe("ok");
    expect(result.usage).toEqual({
      inputTokens: 7,
      outputTokens: 1,
      cachedInputTokens: undefined,
    });
  });

  it("asks for one token and no stream — the call is real money, however little", async () => {
    const fetchImpl = vi.fn(async () => completionResponse(GOOD_BODY));
    await probeConnection({ ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    expect(JSON.parse(String(init.body))).toMatchObject({ max_tokens: 1, stream: false });
  });

  it.each([
    [401, "unauthorized"],
    [403, "unauthorized"],
    [402, "insufficientBalance"],
    [404, "notFound"],
    [429, "rateLimited"],
    [400, "badRequest"],
    [422, "badRequest"],
    [500, "serverError"],
    [503, "serverError"],
  ] as const)("turns HTTP %i into %s", async (status, outcome) => {
    expect(await probeWith(async () => completionResponse({ error: "x" }, status))).toBe(outcome);
  });

  it("does not blame the key for a 403 that is really a WAF challenge page", async () => {
    // Regression: an airport proxy / CDN / corporate gateway answers 403 with an HTML
    // challenge, and the learner was told "your key was rejected" — sending them off to
    // reissue a key that was fine. A real OpenAI-compatible 401/403 is always JSON.
    const html = (status: number) =>
      new Response("<!doctype html><title>Attention Required!</title>", {
        status,
        headers: { "Content-Type": "text/html; charset=UTF-8" },
      });
    expect(await probeWith(async () => html(403))).toBe("blockedByBrowser");
    expect(await probeWith(async () => html(401))).toBe("blockedByBrowser");
  });

  it("still blames the key when the provider itself rejects it (JSON, as real APIs do)", async () => {
    expect(await probeWith(async () => completionResponse({ error: "bad key" }, 401))).toBe(
      "unauthorized",
    );
    expect(await probeWith(async () => completionResponse({ error: "forbidden" }, 403))).toBe(
      "unauthorized",
    );
  });

  it("leaves the other statuses alone when the body happens to be HTML", async () => {
    const html = (status: number) =>
      new Response("<html>proxy error</html>", {
        status,
        headers: { "Content-Type": "text/html" },
      });
    expect(await probeWith(async () => html(502))).toBe("serverError");
    expect(await probeWith(async () => html(404))).toBe("notFound");
    expect(await probeWith(async () => html(429))).toBe("rateLimited");
  });

  it("still reports ok when the provider's usage object is missing a count", async () => {
    // Regression: an all-or-nothing usage schema made a perfectly working endpoint read as
    // "no AI service at that address" purely because it reported tokens its own way.
    const result = await probeConnection({
      ...CONFIG,
      fetchImpl: async () =>
        completionResponse({
          choices: [{ message: { content: "hi" } }],
          usage: { prompt_tokens: 8 },
        }),
    });
    expect(result.outcome).toBe("ok");
    expect(result.usage).toMatchObject({ inputTokens: 8, outputTokens: 0 });
  });

  it("does not retry — one 429 must read as a rate limit, not as a long wait", async () => {
    const fetchImpl = vi.fn(async () => completionResponse({}, 429));
    await probeConnection({ ...CONFIG, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("calls a 200 that is not a chat completion what it is: no AI service there", async () => {
    expect(await probeWith(async () => new Response("<html>hello</html>", { status: 200 }))).toBe(
      "notFound",
    );
    expect(await probeWith(async () => completionResponse({ message: "welcome" }))).toBe(
      "notFound",
    );
  });

  it("names a browser refusal separately — a TypeError is all a page is told", async () => {
    expect(await probeWith(() => Promise.reject(new TypeError("Failed to fetch")))).toBe(
      "blockedByBrowser",
    );
  });

  it("keeps the app's own network switch apart from a broken link", async () => {
    const disabled = new Error("the network switch is off");
    disabled.name = "NetworkDisabledError";
    expect(await probeWith(() => Promise.reject(disabled))).toBe("offline");
    expect(await probeWith(() => Promise.reject(new Error("connection refused")))).toBe(
      "unreachable",
    );
  });

  it("rejects an unusable address before spending anything", async () => {
    const fetchImpl = vi.fn(async () => completionResponse(GOOD_BODY));
    const impl = fetchImpl as unknown as typeof fetch;
    for (const baseUrl of ["not-a-url", "http://api.example.com/v1", ""]) {
      expect((await probeConnection({ ...CONFIG, baseUrl, fetchImpl: impl })).outcome).toBe(
        "badUrl",
      );
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports a timeout when the request never comes back", async () => {
    vi.useFakeTimers();
    try {
      const probe = probeWith(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = (init as RequestInit).signal as AbortSignal;
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await probe).toBe("timeout");
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries neither the key nor the provider's words in its result", async () => {
    const result = await probeConnection({
      ...CONFIG,
      fetchImpl: async () =>
        completionResponse({ error: { message: "Invalid API key sk-secret-value" } }, 401),
    });
    // The result is an enum and numbers: there is no string here that could reach a log.
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).toBe('{"outcome":"unauthorized"}');
  });
});
