/**
 * Purpose: unit tests for the streaming chat client (SSE parsing, deltas, usage, errors)
 * using an injected fake fetch — no network involved.
 */
import { describe, expect, it } from "vitest";
import { createLlmClient } from "./client";

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
