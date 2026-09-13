/**
 * Purpose: the reassembly of the 311 MB graph from the pieces it is published in — that the
 * pieces go back together in the order the manifest gives, that nothing that fails a check is
 * handed to onnxruntime, and that a failure is an error rather than a silent short file.
 *
 * The digest is the part worth a test of its own. Pieces concatenated in the wrong order are
 * exactly the right length, and a graph of the right length and the wrong contents is the one
 * failure that could reach a reader as wrong vectors rather than as an error.
 */
import { describe, expect, it, vi } from "vitest";
import { type FetchLike, JSDELIVR_BASE } from "./embedding/modelSource";
import {
  fetchSplitGraph,
  GRAPH_FILE,
  isSplitGraphUrl,
  MANIFEST_FILE,
  parseManifest,
} from "./embedding/splitGraph";

const GRAPH_URL = `${JSDELIVR_BASE}${GRAPH_FILE}`;
const PIECES = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])];
/** SHA-256 of the six bytes above, in order. */
const DIGEST = "7192385c3c0605de55bb9476ce1d90748190ecb32a8eed7f5207b30cf6a1fe89";

interface Shard {
  name: string;
  bytes: number;
}

const SHARDS: Shard[] = PIECES.map((piece, index) => ({
  name: `onnx/model_int8.onnx.00${index}`,
  bytes: piece.length,
}));

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { file: GRAPH_FILE, bytes: 6, sha256: DIGEST, shards: SHARDS, ...overrides };
}

/** A host that answers with the manifest given and the three pieces, `served` recording the
 * order they were asked for. */
function host(body: Record<string, unknown> | null, served: string[] = []): FetchLike {
  return async (url) => {
    served.push(url);
    if (url.endsWith(MANIFEST_FILE)) {
      return body === null ? new Response(null, { status: 404 }) : Response.json(body);
    }
    const index = Number(url.slice(-1));
    const piece = PIECES[index];
    if (piece === undefined) return new Response(null, { status: 404 });
    return new Response(piece as unknown as BodyInit);
  };
}

describe("isSplitGraphUrl", () => {
  it("is true for the graph on a known host and nothing else", () => {
    expect(isSplitGraphUrl(GRAPH_URL)).toBe(true);
    expect(isSplitGraphUrl(`${JSDELIVR_BASE}tokenizer.json`)).toBe(false);
    expect(isSplitGraphUrl(`https://example.com/${GRAPH_FILE}`)).toBe(false);
  });
});

describe("parseManifest", () => {
  it("refuses a manifest it could only act on halfway", () => {
    expect(() => parseManifest(manifest({ shards: [] }))).toThrow(/pieces/);
    expect(() => parseManifest(manifest({ sha256: "nope" }))).toThrow(/SHA-256/);
    expect(() => parseManifest(manifest({ bytes: 0 }))).toThrow(/byte count/);
    expect(() => parseManifest("{}")).toThrow(/object/);
  });
});

describe("fetchSplitGraph", () => {
  it("asks for the manifest, then the pieces in order, and returns the whole file", async () => {
    const served: string[] = [];
    const response = await fetchSplitGraph(GRAPH_URL, host(manifest(), served));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6]),
    );
    expect(response.headers.get("content-length")).toBe("6");
    expect(served.map((url) => url.slice(JSDELIVR_BASE.length))).toEqual([
      MANIFEST_FILE,
      "onnx/model_int8.onnx.000",
      "onnx/model_int8.onnx.001",
      "onnx/model_int8.onnx.002",
    ]);
  });

  it("refuses pieces that do not hash to the whole file", async () => {
    // Right length, wrong order: the one failure onnxruntime could not be relied on to catch.
    const reversed = manifest({ shards: [...SHARDS].reverse() });
    await expect(fetchSplitGraph(GRAPH_URL, host(reversed))).rejects.toThrow(/digest/);
  });

  it("refuses a piece that is not the length the manifest records", async () => {
    const short = manifest({ shards: [{ name: SHARDS[0]?.name, bytes: 99 }] });
    await expect(fetchSplitGraph(GRAPH_URL, host(short))).rejects.toThrow(/99 bytes/);
  });

  it("refuses a run of pieces that does not add up to the recorded length", async () => {
    const missing = manifest({ shards: SHARDS.slice(0, 2) });
    await expect(fetchSplitGraph(GRAPH_URL, host(missing))).rejects.toThrow(/6 bytes/);
  });

  it("reports a piece the host will not serve rather than returning a short file", async () => {
    const extra = manifest({ shards: [...SHARDS, { name: "onnx/model_int8.onnx.009", bytes: 1 }] });
    await expect(fetchSplitGraph(GRAPH_URL, host(extra))).rejects.toThrow(/404/);
  });

  /** A base set with VITE_MODEL_BASE_URL may well hold the graph whole; that is not an error. */
  it("falls back to one plain request when there is no manifest", async () => {
    const fetchFn = vi.fn<FetchLike>(async (url) =>
      url.endsWith(MANIFEST_FILE) ? new Response(null, { status: 404 }) : new Response("whole"),
    );
    const response = await fetchSplitGraph(GRAPH_URL, fetchFn);
    await expect(response.text()).resolves.toBe("whole");
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      `${JSDELIVR_BASE}${MANIFEST_FILE}`,
      GRAPH_URL,
    ]);
  });
});
