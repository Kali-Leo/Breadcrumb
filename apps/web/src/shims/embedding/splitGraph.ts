/**
 * Purpose: putting the ONNX graph back together. It is 311 MB and every host this edition can
 * read from has a per-file ceiling below that — jsDelivr's is 20 MB, and a file in a git
 * repository may not exceed 100 MB at all — so the published graph is seventeen 18 MiB pieces
 * beside a `manifest.json` that names them in order. One request from transformers.js for
 * `onnx/model_int8.onnx` becomes eighteen requests here and one Response going back.
 *
 * The interception is in `env.fetch` rather than in the cache: the library then treats what
 * comes back exactly as it treats a download, which means it stores it in the Cache API under
 * the ordinary key and the second visit never reaches this file at all. A failure here is a
 * rejected fetch, which is the path the "model could not be downloaded" message already comes
 * out of; it is deliberately not swallowed into a retry, because seventeen pieces that will
 * not arrive are seventeen pieces that will not arrive.
 *
 * The whole file's SHA-256 is checked before it is handed over. Onnxruntime will not tell a
 * graph assembled in the wrong order from a valid one — it will refuse to parse it, or worse,
 * parse it and produce numbers — and a truncated piece is exactly the failure a CDN edge is
 * most likely to produce.
 * Main exports: GRAPH_FILE, MANIFEST_FILE, isSplitGraphUrl, parseManifest, fetchSplitGraph,
 * sha256Hex.
 */
import { type FetchLike, isModelSourceUrl } from "./modelSource";

/** What transformers.js asks for: `onnx/` is the library's own convention for where a graph
 * lives, and `_int8` is the dtype suffix it appends. Neither is ours to choose. */
export const GRAPH_FILE = "onnx/model_int8.onnx";
export const MANIFEST_FILE = "manifest.json";

/** Generous rather than tight. A piece is 18 MiB, and the connections this exists for are the
 * slow ones; what this bounds is the case where a request never resolves at all, which would
 * otherwise leave the worker waiting forever with nothing to report. */
export const SHARD_TIMEOUT_MS = 300_000;

export interface ShardManifest {
  /** Byte count and digest of the reassembled file, not of any one piece. */
  bytes: number;
  sha256: string;
  shards: readonly { readonly name: string; readonly bytes: number }[];
}

export function isSplitGraphUrl(url: string): boolean {
  return isModelSourceUrl(url) && url.endsWith(`/${GRAPH_FILE}`);
}

/** The directory the graph was asked for out of, which is where its pieces are too. */
function baseOf(graphUrl: string): string {
  return graphUrl.slice(0, graphUrl.length - GRAPH_FILE.length);
}

function isShardEntry(value: unknown): value is { name: string; bytes: number } {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.name === "string" && entry.name !== "" && typeof entry.bytes === "number";
}

/** Refuses anything it cannot act on rather than filling in a default: a manifest half-read is
 * a graph half-assembled, and that failure would surface as an onnxruntime parse error. */
export function parseManifest(value: unknown): ShardManifest {
  if (typeof value !== "object" || value === null)
    throw new Error("the model manifest is not an object");
  const manifest = value as Record<string, unknown>;
  const { bytes, sha256, shards } = manifest;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0) {
    throw new Error("the model manifest records no byte count");
  }
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(sha256)) {
    throw new Error("the model manifest records no SHA-256");
  }
  if (!Array.isArray(shards) || shards.length === 0 || !shards.every(isShardEntry)) {
    throw new Error("the model manifest lists no pieces");
  }
  return { bytes, sha256: sha256.toLowerCase(), shards };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchPiece(url: string, fetchFn: FetchLike): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHARD_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Downloads the pieces named by the manifest, in order, into one buffer.
 *
 * A base that has no manifest is a base that publishes the graph whole — a local file server
 * or a mirror set up with VITE_MODEL_BASE_URL — so that case falls through to an ordinary
 * request rather than failing. Every other failure is thrown.
 */
export async function fetchSplitGraph(graphUrl: string, fetchFn: FetchLike): Promise<Response> {
  const base = baseOf(graphUrl);
  const manifestResponse = await fetchFn(`${base}${MANIFEST_FILE}`);
  if (!manifestResponse.ok) return fetchFn(graphUrl);

  const manifest = parseManifest(await manifestResponse.json());
  const assembled = new Uint8Array(manifest.bytes);
  let offset = 0;
  for (const shard of manifest.shards) {
    const piece = await fetchPiece(`${base}${shard.name}`, fetchFn);
    if (piece.length !== shard.bytes) {
      throw new Error(`${shard.name} should be ${shard.bytes} bytes and this is ${piece.length}`);
    }
    if (offset + piece.length > assembled.length) {
      throw new Error("the model's pieces add up to more than the manifest records");
    }
    assembled.set(piece, offset);
    offset += piece.length;
  }
  if (offset !== manifest.bytes) {
    throw new Error(`the model should be ${manifest.bytes} bytes and this is ${offset}`);
  }
  if ((await sha256Hex(assembled)) !== manifest.sha256) {
    throw new Error("the reassembled embedding model does not match its recorded digest");
  }
  return new Response(assembled as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(assembled.length),
    },
  });
}
