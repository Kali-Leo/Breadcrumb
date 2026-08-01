/**
 * Purpose: unit tests for the tutor call — happy-path streaming, no system prompt sent, and
 * the non-streaming fallback when chatStream fails. All against a fake fetch, no network.
 */
import { describe, expect, it } from "vitest";
import { getTutorReply } from "./tutor";

function sseResponse(lines: readonly string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

describe("getTutorReply", () => {
  it("streams the reply and reports usage, sending exactly the given history (no system prompt)", async () => {
    const captured: RequestInit[] = [];
    const config = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "key",
      model: "test-model",
      fetchImpl: (_url: RequestInfo | URL, init?: RequestInit) => {
        if (init) captured.push(init);
        return Promise.resolve(
          sseResponse([
            'data: {"choices":[{"delta":{"content":"闭包"}}]}',
            'data: {"choices":[],"usage":{"prompt_tokens":8,"completion_tokens":4}}',
            "data: [DONE]",
          ]),
        );
      },
    };
    const history = [{ role: "user" as const, content: "什么是闭包？" }];
    const reply = await getTutorReply(config, history);

    expect(reply.content).toBe("闭包");
    expect(reply.usage).toEqual({ inputTokens: 8, outputTokens: 4 });
    const sentBody = JSON.parse(String(captured[0]?.body));
    expect(sentBody.messages).toEqual(history);
    expect(sentBody.messages.some((m: { role: string }) => m.role === "system")).toBe(false);
  });

  it("falls back to a non-streaming call when chatStream fails", async () => {
    const config = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "key",
      model: "test-model",
      fetchImpl: (_url: RequestInfo | URL, init?: RequestInit) => {
        const body = init?.body ? (JSON.parse(String(init.body)) as { stream?: boolean }) : {};
        if (body.stream === true) return Promise.reject(new Error("simulated streaming failure"));
        return Promise.resolve(
          Response.json({
            choices: [{ message: { content: "非流式回退" } }],
            usage: { prompt_tokens: 5, completion_tokens: 2 },
          }),
        );
      },
    };
    const reply = await getTutorReply(config, [{ role: "user", content: "hi" }]);
    expect(reply.content).toBe("非流式回退");
    expect(reply.usage).toEqual({ inputTokens: 5, outputTokens: 2 });
  });
});
