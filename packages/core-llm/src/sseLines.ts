/**
 * Purpose: reading `data:` payloads out of an SSE byte stream. Its own module because the
 * chunk-boundary handling is the fiddliest code in the client and deserves to be tested
 * directly, with generated inputs rather than a few hand-written chunkings
 * (sseLines.property.test.ts).
 * Main exports: readSseDataLines, MAX_SSE_LINE_CHARS.
 */

/** Ceiling on one unterminated line. A response that never sends a newline would otherwise
 * grow `buffered` without bound until the renderer runs out of memory — the endpoint is
 * user-configured, so a hostile or hijacked one must not be able to do that. Well past any
 * real SSE frame: providers keep a `data:` line to a few kilobytes. */
export const MAX_SSE_LINE_CHARS = 1_000_000;

/** Yields the payload of every `data:` line across chunk boundaries of an SSE byte stream,
 * stopping at `[DONE]`. The stream is then drained to its natural end instead of being
 * cancelled: cancelling mid-flight makes the Tauri http plugin reject a detached promise
 * with "The resource id N is invalid" — an unhandled rejection we must never produce.
 *
 * Read through a reader rather than `for await (… of body)`: async iteration over a
 * ReadableStream is still unimplemented in WebKit, so the iterating version threw on every
 * answer in Safari and on iPad while working in every browser we test with (2026-09-03).
 *
 * `onChunk` fires once per received chunk, before it is parsed — the hook the client uses to
 * re-arm its silence deadline. It has to be per chunk rather than per payload so that a
 * provider's keep-alive comments (which carry no `data:` line) still count as liveness. */
export async function* readSseDataLines(
  body: ReadableStream<Uint8Array>,
  onChunk?: () => void,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffered = "";
  let sawDone = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk?.();
    if (sawDone || value === undefined) continue;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    // Checked on the leftover, not on the whole append: a big chunk full of newlines is a
    // perfectly healthy fast stream, an ever-growing leftover is the pathological one.
    if (buffered.length > MAX_SSE_LINE_CHARS) {
      throw new Error(`SSE line exceeded ${MAX_SSE_LINE_CHARS} characters`);
    }
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        sawDone = true;
        break;
      }
      // Some reverse proxies send a bare `data:` as a heartbeat. Yielding "" would reach
      // JSON.parse and kill the whole answer with a SyntaxError.
      if (payload.length === 0) continue;
      yield payload;
    }
  }
}
