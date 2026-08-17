/**
 * Purpose: read a response body with a hard byte ceiling. Feed sizes are unbounded in the wild
 * (the channel survey measured an 18.5 MB podcast feed), so we stop pulling bytes at the cap,
 * cancel the stream, and tell the caller the payload was cut. Also honours the declared charset,
 * because several Chinese feeds still ship GB18030.
 * Main exports: readBoundedResponseBody, BoundedBody.
 */

export interface BoundedBody {
  text: string;
  /** Bytes actually kept — equals the cap when `truncated`. */
  byteLength: number;
  truncated: boolean;
}

/** `text/xml; charset=gb2312` -> `gb2312`. */
function readCharsetLabel(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*"?([\w-]+)"?/i.exec(contentType);
  return match?.[1] ?? null;
}

function createDecoder(label: string | null): TextDecoder {
  if (label === null) return new TextDecoder("utf-8");
  try {
    return new TextDecoder(label);
  } catch {
    return new TextDecoder("utf-8");
  }
}

async function readWholeBodyWithoutStream(
  response: Response,
  sizeCapBytes: number,
  decoder: TextDecoder,
): Promise<BoundedBody> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const truncated = bytes.byteLength > sizeCapBytes;
  const kept = truncated ? bytes.subarray(0, sizeCapBytes) : bytes;
  return { text: decoder.decode(kept), byteLength: kept.byteLength, truncated };
}

/**
 * Pulls the body chunk by chunk and stops at `sizeCapBytes`. Incomplete multi-byte characters at
 * the cut are dropped by the streaming decoder rather than turning into replacement noise.
 */
export async function readBoundedResponseBody(
  response: Response,
  sizeCapBytes: number,
): Promise<BoundedBody> {
  const decoder = createDecoder(readCharsetLabel(response.headers.get("content-type")));
  const body = response.body;
  if (!body) return readWholeBodyWithoutStream(response, sizeCapBytes, decoder);

  const reader = body.getReader();
  const pieces: string[] = [];
  let byteLength = 0;
  let truncated = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const remaining = sizeCapBytes - byteLength;
      if (chunk.value.byteLength > remaining) {
        pieces.push(decoder.decode(chunk.value.subarray(0, remaining), { stream: true }));
        byteLength += remaining;
        truncated = true;
        break;
      }
      pieces.push(decoder.decode(chunk.value, { stream: true }));
      byteLength += chunk.value.byteLength;
    }
  } finally {
    // On a cut, the decoder is holding the fragment of a character we deliberately did not
    // finish reading; flushing would turn it into a replacement character, so we drop it.
    if (!truncated) pieces.push(decoder.decode());
    await reader.cancel().catch(() => undefined);
  }
  return { text: pieces.join(""), byteLength, truncated };
}
