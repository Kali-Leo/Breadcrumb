/**
 * Purpose: how the recognition model's files reach memory — the cache before the network,
 * the network switch before any request, the digest before any trust, and the next host
 * when the first one fails a download.
 */
import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./embedding/modelSource";
import { OCR_JSDELIVR_BASE, OCR_RAW_GITHUB_BASE } from "./ocr/ocrModel";
import { loadOcrModelFiles, OFFLINE_OCR_MESSAGE } from "./ocr/ocrModelFiles";

const bytes = (text: string) => new TextEncoder().encode(text);
/** SHA-256 of "det", "rec" and "a\nb\n". */
const FILES = {
  det: {
    name: "det.onnx",
    bytes: 3,
    sha256: "0a3ec9e2dbd0b6d5b7a2a4a1b8fbf5f7a8e6f8b3b3a3c5c0b1c9a2d4e1f6a7b8",
  },
  rec: { name: "rec.onnx", bytes: 3, sha256: "" },
  dict: { name: "dict.txt", bytes: 4, sha256: "" },
};

async function digest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes(text));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function table() {
  return {
    det: { ...FILES.det, sha256: await digest("det") },
    rec: { ...FILES.rec, sha256: await digest("rec") },
    dict: { ...FILES.dict, sha256: await digest("a\nb\n") },
  };
}

const CONTENT: Record<string, string> = {
  "det.onnx": "det",
  "rec.onnx": "rec",
  "dict.txt": "a\nb\n",
};

function host(base: string, broken: string[] = []): FetchLike {
  return async (url) => {
    if (!url.startsWith(base)) return new Response(null, { status: 404 });
    const name = url.slice(base.length);
    if (broken.includes(name)) return new Response("nope", { status: 403 });
    return new Response(bytes(CONTENT[name] ?? ""), { status: 200 });
  };
}

function memoryCache() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    match: async (key: string) => {
      const hit = store.get(key);
      return hit === undefined ? undefined : new Response(hit.slice());
    },
    put: async (key: string, response: Response) => {
      store.set(key, new Uint8Array(await response.arrayBuffer()));
    },
  };
}

describe("loadOcrModelFiles", () => {
  it("downloads, checks and caches every file, then reads the dictionary as lines", async () => {
    const cache = memoryCache();
    const fetchFn = vi.fn(host(OCR_JSDELIVR_BASE));
    const files = await table();
    const model = await loadOcrModelFiles(true, {
      fetch: fetchFn,
      cache,
      sources: { resolve: async () => OCR_JSDELIVR_BASE },
      files,
    });
    expect(new TextDecoder().decode(model.det)).toBe("det");
    expect(model.dict).toEqual(["a", "b"]);
    expect([...cache.store.keys()]).toEqual([
      `${OCR_JSDELIVR_BASE}det.onnx`,
      `${OCR_JSDELIVR_BASE}rec.onnx`,
      `${OCR_JSDELIVR_BASE}dict.txt`,
    ]);
  });

  it("serves a cached model with the switch off and no request at all", async () => {
    const cache = memoryCache();
    const files = await table();
    for (const [name, text] of Object.entries(CONTENT)) {
      cache.store.set(`${OCR_JSDELIVR_BASE}${name}`, bytes(text));
    }
    const fetchFn = vi.fn<FetchLike>();
    const resolve = vi.fn(async () => OCR_JSDELIVR_BASE);
    const model = await loadOcrModelFiles(false, {
      fetch: fetchFn,
      cache,
      sources: { resolve },
      files,
    });
    expect(model.dict).toEqual(["a", "b"]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("refuses to download with the switch off, before naming a host", async () => {
    const resolve = vi.fn(async () => OCR_JSDELIVR_BASE);
    await expect(
      loadOcrModelFiles(false, {
        fetch: vi.fn<FetchLike>(),
        cache: memoryCache(),
        sources: { resolve },
        files: await table(),
      }),
    ).rejects.toThrow(OFFLINE_OCR_MESSAGE);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("treats a cached file with the wrong digest as absent and downloads it again", async () => {
    const cache = memoryCache();
    cache.store.set(`${OCR_JSDELIVR_BASE}det.onnx`, bytes("xxx"));
    const model = await loadOcrModelFiles(true, {
      fetch: host(OCR_JSDELIVR_BASE),
      cache,
      sources: { resolve: async () => OCR_JSDELIVR_BASE },
      files: await table(),
    });
    expect(new TextDecoder().decode(model.det)).toBe("det");
  });

  it("moves to the next host when the chosen one fails a download", async () => {
    const jsdelivr = host(OCR_JSDELIVR_BASE, ["rec.onnx"]);
    const github = host(OCR_RAW_GITHUB_BASE);
    const fetchFn: FetchLike = async (url, init) =>
      url.startsWith(OCR_JSDELIVR_BASE) ? jsdelivr(url, init) : github(url, init);
    const model = await loadOcrModelFiles(true, {
      fetch: fetchFn,
      cache: memoryCache(),
      sources: { resolve: async () => OCR_JSDELIVR_BASE },
      files: await table(),
    });
    expect(new TextDecoder().decode(model.rec)).toBe("rec");
  });

  it("names every host that refused when none delivers", async () => {
    await expect(
      loadOcrModelFiles(true, {
        fetch: host("https://nowhere.example/"),
        cache: memoryCache(),
        sources: { resolve: async () => OCR_JSDELIVR_BASE },
        files: await table(),
      }),
    ).rejects.toThrow(/could not be downloaded — .*404.*; .*404/);
  });
});
