/**
 * Purpose: reading `data:` payloads out of an SSE byte stream. Its own module because the
 * chunk-boundary handling is the fiddliest code in the client and deserves to be tested
 * directly, with generated inputs rather than a few hand-written chunkings
 * (sseLines.property.test.ts).
 * Main exports: readSseDataLines.
 */

/** Yields the payload of every `data:` line across chunk boundaries of an SSE byte stream,
 * stopping at `[DONE]`. The stream is then drained to its natural end instead of being
 * cancelled: breaking out of `for await` cancels the underlying stream, and the Tauri http
 * plugin's cancel on an already-finished response rejects a detached promise with
 * "The resource id N is invalid" — an unhandled rejection we must never produce. */
export async function* readSseDataLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffered = "";
  let sawDone = false;
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    if (sawDone) continue;
    buffered += decoder.decode(chunk, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        sawDone = true;
        break;
      }
      yield payload;
    }
  }
}
