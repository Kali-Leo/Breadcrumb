/**
 * Purpose: unit tests for the non-streaming chat fallback, using a fake fetch (no network).
 */
import { describe, expect, it } from "vitest";
import { nonStreamingChat } from "./nonStreamingChat";

function makeConfig(response: Response) {
  return {
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: () => Promise.resolve(response),
  };
}

describe("nonStreamingChat", () => {
  it("returns the completion content and usage", async () => {
    const response = Response.json({
      choices: [{ message: { content: "你好" } }],
      usage: { prompt_tokens: 10, completion_tokens: 3 },
    });
    const result = await nonStreamingChat(makeConfig(response), [{ role: "user", content: "hi" }]);
    expect(result.content).toBe("你好");
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 3 });
  });

  it("defaults usage to zero when missing", async () => {
    const response = Response.json({ choices: [{ message: { content: "ok" } }] });
    const result = await nonStreamingChat(makeConfig(response), []);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("throws a clear error on non-2xx responses", async () => {
    const response = new Response("nope", { status: 500 });
    await expect(nonStreamingChat(makeConfig(response), [])).rejects.toThrow("HTTP 500");
  });

  it("throws when the response has no message content", async () => {
    const response = Response.json({ choices: [] });
    await expect(nonStreamingChat(makeConfig(response), [])).rejects.toThrow(
      "missing message content",
    );
  });
});
