/**
 * Purpose: unit tests for the streaming chat client (SSE parsing, deltas, usage, errors)
 * using an injected fake fetch — no network involved.
 */
import { describe, expect, it, vi } from "vitest";
import { createLlmClient, MAX_STREAM_CONTENT_CHARS } from "./client";
import { STREAM_FIRST_BYTE_TIMEOUT_MS, STREAM_IDLE_TIMEOUT_MS } from "./retry";

function sseResponseFromLines(lines: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

/** A client over an arbitrary fetch — for the tests that need to watch or fail the call. */
function clientWith(fetchImpl: typeof fetch) {
  return createLlmClient({
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });
}

function makeClient(response: Response, capturedRequests: RequestInit[] = []) {
  return createLlmClient({
    baseUrl: "https://api.example.com/v1/",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: (_url, init) => {
      if (init) capturedRequests.push(init);
      return Promise.resolve(response);
    },
  });
}

/** A client whose response body this test drives chunk by chunk, reacting to an abort the
 * way a real fetch does: by erroring the body stream from the inside. */
function clientOverDrivenBody(): {
  client: ReturnType<typeof clientWith>;
  push: (text: string) => void;
  close: () => void;
} {
  const encoder = new TextEncoder();
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      bodyController = controller;
    },
  });
  const client = clientWith((_url, init) => {
    init?.signal?.addEventListener("abort", () =>
      bodyController?.error(new Error("aborted by the deadline")),
    );
    return Promise.resolve(new Response(body, { status: 200 }));
  });
  return {
    client,
    push: (text) => bodyController?.enqueue(encoder.encode(text)),
    close: () => bodyController?.close(),
  };
}

describe("createLlmClient.chatStream", () => {
  it("concatenates deltas, reports usage, and fires onDelta per fragment", async () => {
    const response = sseResponseFromLines([
      'data: {"choices":[{"delta":{"content":"你"}}]}',
      'data: {"choices":[{"delta":{"content":"好"}}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":2}}',
      "data: [DONE]",
    ]);
    const deltas: string[] = [];
    const result = await makeClient(response).chatStream(
      [{ role: "user", content: "hi" }],
      (text) => deltas.push(text),
    );

    expect(result.content).toBe("你好");
    expect(deltas).toEqual(["你", "好"]);
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 2 });
  });

  it("handles SSE lines split across chunk boundaries", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"con'));
        controller.enqueue(encoder.encode('tent":"ab"}}]}\ndata: [DONE]\n'));
        controller.close();
      },
    });
    const result = await makeClient(new Response(body, { status: 200 })).chatStream(
      [{ role: "user", content: "hi" }],
      () => undefined,
    );
    expect(result.content).toBe("ab");
  });

  it("throws a clear error on non-2xx responses", async () => {
    const response = new Response("nope", { status: 401 });
    await expect(
      makeClient(response).chatStream([{ role: "user", content: "hi" }], () => undefined),
    ).rejects.toThrow("HTTP 401");
  });

  it("rejects with AbortError when the signal fires mid-stream (real-fetch behavior)", async () => {
    // A real fetch (browser or Tauri) reacts to its signal by erroring the body stream
    // from the inside; the fake reproduces that so the drain-not-cancel path is exercised.
    const encoder = new TextEncoder();
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
    });
    const client = clientWith((_url, init) => {
      init?.signal?.addEventListener("abort", () => {
        // Tauri's http plugin surfaces an internal resource error here, not AbortError —
        // the client must normalize it regardless.
        bodyController?.error(new Error("The resource id 7 is invalid"));
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });

    const abortController = new AbortController();
    const deltas: string[] = [];
    const streaming = client.chatStream([{ role: "user", content: "hi" }], (t) => deltas.push(t), {
      signal: abortController.signal,
    });
    bodyController?.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"部分"}}]}\n'));
    await vi.waitFor(() => expect(deltas).toEqual(["部分"]));
    abortController.abort();

    await expect(streaming).rejects.toMatchObject({ name: "AbortError" });
  });

  it("still resolves normally when the signal never fires", async () => {
    const response = sseResponseFromLines([
      'data: {"choices":[{"delta":{"content":"ok"}}]}',
      "data: [DONE]",
    ]);
    const result = await makeClient(response).chatStream(
      [{ role: "user", content: "hi" }],
      () => undefined,
      { signal: new AbortController().signal },
    );
    expect(result.content).toBe("ok");
  });

  it("retries a transient 503 before the stream ever opens", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("busy", { status: 503 }))
        .mockResolvedValueOnce(
          sseResponseFromLines(['data: {"choices":[{"delta":{"content":"ok"}}]}', "data: [DONE]"]),
        );
      const hi = [{ role: "user" as const, content: "hi" }];
      const streaming = clientWith(fetchImpl).chatStream(hi, () => undefined);
      await vi.advanceTimersByTimeAsync(5_000);

      expect((await streaming).content).toBe("ok");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a long answer alive far past the first-byte budget, one chunk at a time", async () => {
    vi.useFakeTimers();
    try {
      const { client, push, close } = clientOverDrivenBody();
      const deltas: string[] = [];
      const streaming = client.chatStream([{ role: "user", content: "hi" }], (t) => deltas.push(t));

      // Five chunks, each well inside the silence budget but the whole answer running for
      // longer than the first-byte budget — a total-duration timeout would have killed this.
      for (let index = 0; index < 5; index += 1) {
        push(`data: {"choices":[{"delta":{"content":"${index}"}}]}\n`);
        await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS - 1_000);
      }
      expect(STREAM_IDLE_TIMEOUT_MS * 5).toBeGreaterThan(STREAM_FIRST_BYTE_TIMEOUT_MS);
      push("data: [DONE]\n");
      close();

      expect((await streaming).content).toBe("01234");
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out when the stream goes silent mid-answer, instead of hanging forever", async () => {
    vi.useFakeTimers();
    try {
      const { client, push } = clientOverDrivenBody();
      const deltas: string[] = [];
      const streaming = client.chatStream([{ role: "user", content: "hi" }], (t) => deltas.push(t));
      const settled = expect(streaming).rejects.toMatchObject({
        name: "LlmTimeoutError",
        message: `LLM request timed out after ${STREAM_IDLE_TIMEOUT_MS}ms`,
      });

      push('data: {"choices":[{"delta":{"content":"半"}}]}\n');
      await vi.advanceTimersByTimeAsync(0);
      expect(deltas).toEqual(["半"]);

      // The endpoint then stalls without closing the connection.
      await vi.advanceTimersByTimeAsync(STREAM_IDLE_TIMEOUT_MS + 1);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("still reports the first-byte budget when nothing ever arrived", async () => {
    vi.useFakeTimers();
    try {
      const { client } = clientOverDrivenBody();
      const streaming = client.chatStream([{ role: "user", content: "hi" }], () => undefined);
      const settled = expect(streaming).rejects.toMatchObject({
        name: "LlmTimeoutError",
        message: `LLM request timed out after ${STREAM_FIRST_BYTE_TIMEOUT_MS}ms`,
      });
      await vi.advanceTimersByTimeAsync(STREAM_FIRST_BYTE_TIMEOUT_MS + 1);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses to keep accumulating past the content ceiling", async () => {
    // Five deltas, each a legal SSE line, that together overrun the ceiling.
    const part = "x".repeat(MAX_STREAM_CONTENT_CHARS / 4);
    const response = sseResponseFromLines([
      ...Array.from({ length: 5 }, () => `data: {"choices":[{"delta":{"content":"${part}"}}]}`),
      "data: [DONE]",
    ]);
    await expect(
      makeClient(response).chatStream([{ role: "user", content: "hi" }], () => undefined),
    ).rejects.toThrow("LLM stream exceeded");
  });

  it("posts to the validated completions URL and refuses a plaintext one", async () => {
    const urls: string[] = [];
    const client = createLlmClient({
      baseUrl: "https://api.example.com/v1/?token=abc",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: (url) => {
        urls.push(String(url));
        return Promise.resolve(sseResponseFromLines(["data: [DONE]"]));
      },
    });
    await client.chatStream([{ role: "user", content: "hi" }], () => undefined);
    expect(urls).toEqual(["https://api.example.com/v1/chat/completions"]);

    const plaintext = createLlmClient({
      baseUrl: "http://proxy.example.com/v1",
      apiKey: "test-key",
      model: "test-model",
      fetchImpl: () => Promise.reject(new Error("must never be called")),
    });
    await expect(
      plaintext.chatStream([{ role: "user", content: "hi" }], () => undefined),
    ).rejects.toThrow("must be https");
  });

  it("sends model, messages and stream flags in the request body", async () => {
    const captured: RequestInit[] = [];
    const response = sseResponseFromLines(["data: [DONE]"]);
    await makeClient(response, captured).chatStream(
      [{ role: "user", content: "hi" }],
      () => undefined,
    );

    const sentBody = JSON.parse(String(captured[0]?.body));
    expect(sentBody.model).toBe("test-model");
    expect(sentBody.stream).toBe(true);
    expect(sentBody.messages).toEqual([{ role: "user", content: "hi" }]);
  });
});
