/**
 * Purpose: generated-input tests for the SSE reader (backlog: "属性测试引入（fast-check）：
 * SSE 解析器是好靶子"). The hand-written cases in client.test.ts cover the chunkings someone
 * thought of; these cover the ones nobody would — a chunk boundary inside "data:", inside a
 * multi-byte character, between "[DON" and "E]", one byte at a time.
 *
 * The property under test: however the same bytes are cut up, the reader yields exactly the
 * payloads that were written, and stops at [DONE].
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { readSseDataLines } from "./sseLines";

/** A ReadableStream over the given byte chunks, the shape the client feeds the reader. */
function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

/** Cuts a byte array at the given (arbitrary, unsorted) offsets. */
function cutAt(bytes: Uint8Array, offsets: readonly number[]): Uint8Array[] {
  const points = [...new Set(offsets.map((offset) => offset % (bytes.length + 1)))].sort(
    (a, b) => a - b,
  );
  const chunks: Uint8Array[] = [];
  let previous = 0;
  for (const point of [...points, bytes.length]) {
    if (point > previous) chunks.push(bytes.slice(previous, point));
    previous = point;
  }
  return chunks.length > 0 ? chunks : [bytes];
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const seen: string[] = [];
  for await (const payload of readSseDataLines(stream)) seen.push(payload);
  return seen;
}

/** Payloads as a provider writes them: no newlines (they are the line separator) and no
 * leading/trailing spaces (the reader trims, so those were never data). */
const payload = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((text) => text.replaceAll("\n", " ").trim())
  .filter((text) => text.length > 0 && text !== "[DONE]");

describe("reading SSE data lines", () => {
  it("yields every payload, however the bytes were cut up", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(payload, { minLength: 1, maxLength: 12 }),
        fc.array(fc.nat(), { maxLength: 20 }),
        async (payloads, cuts) => {
          const text = `${payloads.map((one) => `data: ${one}\n`).join("")}data: [DONE]\n`;
          const bytes = new TextEncoder().encode(text);
          expect(await collect(streamOf(cutAt(bytes, cuts)))).toEqual(payloads);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("ignores everything that is not a data line", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(payload, { minLength: 1, maxLength: 6 }),
        fc.array(fc.nat(), { maxLength: 12 }),
        async (payloads, cuts) => {
          // Comments, event lines and the blank lines between events are all SSE, all noise.
          const text = payloads
            .map((one) => `: keep-alive\nevent: message\ndata: ${one}\n\n`)
            .join("");
          const bytes = new TextEncoder().encode(`${text}data: [DONE]\n`);
          expect(await collect(streamOf(cutAt(bytes, cuts)))).toEqual(payloads);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("stops at [DONE] and never yields what follows it", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(payload, { minLength: 1, maxLength: 5 }),
        fc.array(payload, { minLength: 1, maxLength: 5 }),
        fc.array(fc.nat(), { maxLength: 12 }),
        async (before, after, cuts) => {
          const text = `${before.map((one) => `data: ${one}\n`).join("")}data: [DONE]\n${after
            .map((one) => `data: ${one}\n`)
            .join("")}`;
          const bytes = new TextEncoder().encode(text);
          expect(await collect(streamOf(cutAt(bytes, cuts)))).toEqual(before);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("survives a cut inside a multi-byte character", async () => {
    const bytes = new TextEncoder().encode("data: 闭包与作用域链 🍞\ndata: [DONE]\n");
    for (let cut = 1; cut < bytes.length; cut += 1) {
      expect(await collect(streamOf([bytes.slice(0, cut), bytes.slice(cut)]))).toEqual([
        "闭包与作用域链 🍞",
      ]);
    }
  });

  it("yields nothing for a stream that never carried data", async () => {
    const bytes = new TextEncoder().encode(": keep-alive\n\nevent: ping\n");
    expect(await collect(streamOf([bytes]))).toEqual([]);
  });
});
