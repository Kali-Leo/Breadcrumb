/**
 * Purpose: getting a model's files into memory — from the Cache API when a previous visit
 * downloaded them, from a reachable host otherwise, and never from anywhere behind a
 * switched-off network switch. One loader for every model the OCR worker runs: the text
 * pair (ocrModel.ts) and the layout and table models (ocrStructureModel.ts) differ only in
 * which directory of the packs repository they sit in.
 *
 * The same rules as the embedding model, through the same pieces: the host is chosen by
 * probing (createSourceResolver), the cache is keyed to one host whichever one answered
 * (createModelCache), and nothing is kept — or handed to onnxruntime — until it is exactly
 * the length the table records and hashes to exactly the digest beside it. A file that is
 * wrong is deleted from the cache as well, so a corrupt copy costs one download and not a
 * session of unreadable pages.
 * Main exports: OCR_CACHE_NAME, loadModelSet, loadOcrModelFiles, modelSetDeps,
 * defaultOcrModelDeps, OcrModelBytes, OFFLINE_OCR_MESSAGE, dictionaryLines.
 */
import { createModelCache, type ModelCache } from "../embedding/modelCache";
import {
  createSourceResolver,
  type FetchLike,
  type SourceResolver,
} from "../embedding/modelSource";
import { sha256Hex } from "../embedding/splitGraph";
import { OCR_MODEL_FILES as FILES, type OcrModelFile, ocrModelSources } from "./ocrModel";

export const OCR_CACHE_NAME = "breadcrumb-ocr-model";
export const OFFLINE_OCR_MESSAGE =
  "the recognition model is not downloaded and the network switch is off";

export interface OcrModelBytes {
  det: Uint8Array;
  rec: Uint8Array;
  /** The recognition model's characters, index order; a decoded class index `i` (past the
   * blank at 0) is `dict[i - 1]`, and the class after the last entry is a space. */
  dict: string[];
}

export interface OcrModelFilesDeps {
  fetch: FetchLike;
  cache: ModelCache;
  sources: SourceResolver;
  /** The published table, or a test's own. */
  files?: { det: OcrModelFile; rec: OcrModelFile; dict: OcrModelFile };
}

async function checked(file: OcrModelFile, bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length !== file.bytes) {
    throw new Error(`${file.name} should be ${file.bytes} bytes and this is ${bytes.length}`);
  }
  if ((await sha256Hex(bytes)) !== file.sha256) {
    throw new Error(`${file.name} does not match its recorded digest`);
  }
  return bytes;
}

/** The cache first; a copy that fails its check is treated as absent. */
async function fromCache(deps: OcrModelFilesDeps, key: string, file: OcrModelFile) {
  const hit = await deps.cache.match(key);
  if (hit === undefined) return null;
  try {
    return await checked(file, new Uint8Array(await hit.arrayBuffer()));
  } catch {
    return null;
  }
}

async function download(deps: OcrModelFilesDeps, base: string, file: OcrModelFile) {
  const url = `${base}${file.name}`;
  const response = await deps.fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const bytes = await checked(file, new Uint8Array(await response.arrayBuffer()));
  // Stored only once it has passed: the cache holds files this build trusts, nothing else.
  await deps.cache.put(url, new Response(bytes.slice() as unknown as BodyInit));
  return bytes;
}

/**
 * Every file of one model, cache first, by name. Only when something is missing is a host
 * probed, and only with `allowDownload` — the switch is answered before any request is
 * built, which is what makes "zero requests" true. A host that answered the probe and then
 * fails a download is passed over for the next, as the desktop does; the error a caller
 * finally sees names each. `sources` are the model's own directory on each host.
 */
export async function loadModelSet(
  allowDownload: boolean,
  deps: OcrModelFilesDeps,
  files: readonly OcrModelFile[],
  sources: readonly string[],
): Promise<Map<string, Uint8Array>> {
  const preferred = sources[0] ?? "";
  const loaded = new Map<string, Uint8Array>();
  for (const file of files) {
    const hit = await fromCache(deps, `${preferred}${file.name}`, file);
    if (hit !== null) loaded.set(file.name, hit);
  }
  if (loaded.size < files.length) {
    if (!allowDownload) throw new Error(OFFLINE_OCR_MESSAGE);
    const host = await deps.sources.resolve();
    if (host === null) throw new Error("no model source is reachable");
    const refusals: string[] = [];
    for (const base of [host, ...sources.filter((source) => source !== host)]) {
      try {
        for (const file of files) {
          if (!loaded.has(file.name)) loaded.set(file.name, await download(deps, base, file));
        }
        break;
      } catch (error) {
        refusals.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (loaded.size < files.length) {
      throw new Error(`the recognition model could not be downloaded — ${refusals.join("; ")}`);
    }
  }
  return loaded;
}

/** A one-entry-per-line list file as its entries; the newline that ends it is not one. */
export function dictionaryLines(bytes: Uint8Array | undefined): string[] {
  return new TextDecoder()
    .decode(bytes)
    .replace(/\r?\n$/, "")
    .split(/\r?\n/);
}

/** The text recognition pair with its character list. */
export async function loadOcrModelFiles(
  allowDownload: boolean,
  deps: OcrModelFilesDeps,
): Promise<OcrModelBytes> {
  const table = deps.files ?? FILES;
  const loaded = await loadModelSet(
    allowDownload,
    deps,
    [table.det, table.rec, table.dict],
    ocrModelSources(),
  );
  return {
    det: loaded.get(table.det.name) ?? new Uint8Array(),
    rec: loaded.get(table.rec.name) ?? new Uint8Array(),
    dict: dictionaryLines(loaded.get(table.dict.name)),
  };
}

/** The production wiring for one model directory: the worker's own fetch, the Cache API,
 * the probe over that directory on the published hosts. Every model shares one cache, keyed
 * by URL, so directories cannot collide. */
export function modelSetDeps(sources: readonly string[], probeFile: string): OcrModelFilesDeps {
  const fetchFn: FetchLike = (input, init) => fetch(input, init);
  return {
    fetch: fetchFn,
    cache: createModelCache(() => caches.open(OCR_CACHE_NAME), sources),
    sources: createSourceResolver({ fetch: fetchFn, sources, probeFile }),
  };
}

export function defaultOcrModelDeps(): OcrModelFilesDeps {
  return modelSetDeps(ocrModelSources(), FILES.dict.name);
}
