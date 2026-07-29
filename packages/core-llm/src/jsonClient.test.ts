/**
 * Purpose: unit tests for the JSON-mode chat call (schema validation, usage, errors).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { chatJson } from "./jsonClient";

const petSchema = z.object({ name: z.string(), age: z.number() });

function makeConfig(response: Response) {
  return {
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    model: "test-model",
    fetchImpl: () => Promise.resolve(response),
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
    const response = completionResponse('{"name":"Momo","age":3}');
    const result = await chatJson(
      makeConfig(response),
      [{ role: "user", content: "pet?" }],
      petSchema,
    );

    expect(result.parsed).toEqual({ name: "Momo", age: 3 });
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 12 });
  });

  it("rejects content that does not match the schema", async () => {
    const response = completionResponse('{"name":"Momo"}');
    await expect(
      chatJson(makeConfig(response), [{ role: "user", content: "pet?" }], petSchema),
    ).rejects.toThrow();
  });

  it("throws a clear error on non-2xx responses", async () => {
    const response = new Response("nope", { status: 500 });
    await expect(
      chatJson(makeConfig(response), [{ role: "user", content: "pet?" }], petSchema),
    ).rejects.toThrow("HTTP 500");
  });

  it("throws when the response has no message content", async () => {
    const response = Response.json({ choices: [] });
    await expect(
      chatJson(makeConfig(response), [{ role: "user", content: "pet?" }], petSchema),
    ).rejects.toThrow("missing message content");
  });
});
