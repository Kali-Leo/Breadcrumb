/**
 * Purpose: unit tests for the JSON-mode chat call (schema validation, usage, retry-once on
 * malformed replies, errors).
 */
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatJson } from "./jsonClient";

const petSchema = z.object({ name: z.string(), age: z.number() });

function makeConfig(fetchImpl: typeof fetch) {
  return {
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  };
}

function completionResponse(content: string): Response {
  return Response.json({
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 30, completion_tokens: 12 },
  });
}

describe("chatJson", () => {
  it("parses valid JSON content through the given schema and returns usage", async () => {
    const fetchImpl = () => Promise.resolve(completionResponse('{"name":"Momo","age":3}'));
    const result = await chatJson(
      makeConfig(fetchImpl),
      [{ role: "user", content: "pet?" }],
      petSchema,
    );

    expect(result.parsed).toEqual({ name: "Momo", age: 3 });
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 12 });
  });

  it("rejects content that still does not match the schema after the retry", async () => {
    const fetchImpl = () => Promise.resolve(completionResponse('{"name":"Momo"}'));
    await expect(
      chatJson(makeConfig(fetchImpl), [{ role: "user", content: "pet?" }], petSchema),
    ).rejects.toThrow();
  });

  it("throws a clear error on non-2xx responses (no retry — the endpoint itself is broken)", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      chatJson(makeConfig(fetchImpl), [{ role: "user", content: "pet?" }], petSchema),
    ).rejects.toThrow("HTTP 500");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws when the response has no message content", async () => {
    const fetchImpl = () => Promise.resolve(Response.json({ choices: [] }));
    await expect(
      chatJson(makeConfig(fetchImpl), [{ role: "user", content: "pet?" }], petSchema),
    ).rejects.toThrow("missing message content");
  });

  it("retries once on invalid JSON and succeeds using the corrected reply", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completionResponse("not json at all"))
      .mockResolvedValueOnce(completionResponse('{"name":"Momo","age":3}'));

    const result = await chatJson(
      makeConfig(fetchImpl),
      [{ role: "user", content: "pet?" }],
      petSchema,
    );

    expect(result.parsed).toEqual({ name: "Momo", age: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Usage from both attempts is summed for the caller's metering.
    expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 24 });
  });

  it("retries once on a schema mismatch, appending the validation error as context", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completionResponse('{"name":"Momo"}'))
      .mockResolvedValueOnce(completionResponse('{"name":"Momo","age":3}'));

    const result = await chatJson(
      makeConfig(fetchImpl),
      [{ role: "user", content: "pet?" }],
      petSchema,
    );

    expect(result.parsed).toEqual({ name: "Momo", age: 3 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(retryBody.messages.at(-1).content).toContain("age");
  });

  it("throws after the retry also fails validation", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(completionResponse('{"name":"Momo"}'))
      .mockResolvedValueOnce(completionResponse('{"name":"Momo"}'));

    await expect(
      chatJson(makeConfig(fetchImpl), [{ role: "user", content: "pet?" }], petSchema),
    ).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
