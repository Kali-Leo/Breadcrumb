/**
 * Purpose: unit tests for the response size cap — that an oversized body stops exactly at the
 * ceiling and is flagged, that a body at or under the ceiling is passed through untouched, and
 * that a declared non-UTF-8 charset is honoured.
 */
import { describe, expect, it } from "vitest";
import { readBoundedResponseBody } from "./boundedBody";

function streamingResponse(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, { headers });
}

function asciiChunk(character: string, length: number): Uint8Array {
  return new TextEncoder().encode(character.repeat(length));
}

describe("readBoundedResponseBody", () => {
  it("passes a body smaller than the cap through unchanged", async () => {
    const response = streamingResponse([asciiChunk("a", 100)]);
    const bounded = await readBoundedResponseBody(response, 1024);
    expect(bounded.truncated).toBe(false);
    expect(bounded.byteLength).toBe(100);
    expect(bounded.text).toHaveLength(100);
  });

  it("keeps a body that lands exactly on the cap without flagging it", async () => {
    const response = streamingResponse([asciiChunk("a", 64)]);
    const bounded = await readBoundedResponseBody(response, 64);
    expect(bounded.truncated).toBe(false);
    expect(bounded.byteLength).toBe(64);
  });

  it("stops at the cap across chunk boundaries and flags the cut", async () => {
    const response = streamingResponse([
      asciiChunk("a", 40),
      asciiChunk("b", 40),
      asciiChunk("c", 40),
    ]);
    const bounded = await readBoundedResponseBody(response, 50);
    expect(bounded.truncated).toBe(true);
    expect(bounded.byteLength).toBe(50);
    expect(bounded.text).toBe(`${"a".repeat(40)}${"b".repeat(10)}`);
  });

  it("drops the incomplete multi-byte character at the cut instead of emitting noise", async () => {
    // "中" is three bytes; cutting after four bytes leaves one whole character plus a fragment.
    const response = streamingResponse([new TextEncoder().encode("中文")]);
    const bounded = await readBoundedResponseBody(response, 4);
    expect(bounded.truncated).toBe(true);
    expect(bounded.text).toBe("中");
  });

  it("decodes with the charset the response declares", async () => {
    const gbkBytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]); // 你好 in GBK
    const response = streamingResponse([gbkBytes], {
      "content-type": "application/xml; charset=gbk",
    });
    const bounded = await readBoundedResponseBody(response, 1024);
    expect(bounded.text).toBe("你好");
  });

  it("falls back to UTF-8 when the declared charset is unknown", async () => {
    const response = streamingResponse([new TextEncoder().encode("hello")], {
      "content-type": "text/xml; charset=x-nonsense",
    });
    const bounded = await readBoundedResponseBody(response, 1024);
    expect(bounded.text).toBe("hello");
  });

  it("caps a body that arrives without a readable stream", async () => {
    const response = new Response(null, { status: 200 });
    Object.defineProperty(response, "body", { value: null });
    const bounded = await readBoundedResponseBody(response, 8);
    expect(bounded.byteLength).toBe(0);
    expect(bounded.truncated).toBe(false);
  });
});
