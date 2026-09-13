/**
 * Purpose: runs gte-multilingual-base in the browser, inside a Worker. transformers.js loads
 * the ONNX export we published ourselves and onnxruntime does the arithmetic — on the graphics
 * card where there is one, on several WebAssembly threads where the page is cross-origin
 * isolated, and on one thread otherwise (backend.ts). It has to be a Worker: one passage is
 * hundreds of milliseconds of synchronous work, which on the page would be a dropped frame
 * per paragraph.
 *
 * Loading is cache-first. The first attempt refuses every request to a model host, so an
 * already-downloaded model loads with no network at all — the app's network switch off
 * included. Only when that fails, and only with the switch on, is a source probed and the
 * download allowed. Every failure becomes an `ok: false` reply; the page degrades from there.
 *
 * Two things this file does that the e5 version did not. It pools CLS rather than mean and
 * sends no task prefix, because that is what this model was trained for and the previous
 * habit would now be quietly wrong. And it truncates to 384 dimensions and renormalizes,
 * which for this model costs nothing measurable and keeps every stored vector, on both
 * editions, the same width under the same model name.
 * Main exports: none (worker entry).
 */
import { EMBEDDING_DIMENSIONS, truncateToStoredWidth } from "@breadcrumb/core-vectors";
import { env, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { createModelCache, MODEL_CACHE_NAME } from "./modelCache";
import { isModelSourceUrl, MODEL_PATH_TEMPLATE, MODEL_SOURCES } from "./modelSource";
import { ortWasmPaths } from "./ortAssets";
import type { LoadedPipeline } from "./pipelineLoader";
import { allowNetwork, loadPipeline, OFFLINE_MESSAGE } from "./pipelineLoader";
import type { EmbedReply, EmbedRequest } from "./protocol";
import { splitIntoBatches } from "./textBatches";

let loading: Promise<LoadedPipeline> | null = null;
let queue: Promise<void> = Promise.resolve();

function configure(): void {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = createModelCache(() => caches.open(MODEL_CACHE_NAME), MODEL_SOURCES);
  env.remotePathTemplate = MODEL_PATH_TEMPLATE;
  // The runtime's wasm is an asset of this site like any script; the browser's HTTP cache
  // keeps it fresh across deploys, where a copy in the Cache API would outlive the JS it
  // was built with.
  env.useWasmCache = false;
  // Every model-host request goes through here, so the network switch is enforced in one
  // place rather than trusted to a flag the library might not consult for every file.
  env.fetch = (input, init) => {
    if (!allowNetwork() && isModelSourceUrl(String(input))) {
      return Promise.reject(new Error(OFFLINE_MESSAGE));
    }
    return fetch(input, init);
  };
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("onnxruntime-web has no wasm backend in this build");
  const ortBase = new URL("ort/", new URL(import.meta.env.BASE_URL, self.location.href)).href;
  wasm.wasmPaths = ortWasmPaths(ortBase, navigator);
}

function getPipeline(allowDownload: boolean): Promise<LoadedPipeline> {
  loading ??= loadPipeline(allowDownload).catch((error: unknown) => {
    // A failed load is not held against the next request: the switch may be on by then.
    loading = null;
    throw error;
  });
  return loading;
}

function toVectors(value: unknown): number[][] {
  if (!Array.isArray(value)) throw new Error("model output is not a list");
  return value.map((row: unknown) => {
    if (!Array.isArray(row) || !row.every((x) => typeof x === "number")) {
      throw new Error("model output row is not a vector");
    }
    return truncateToStoredWidth(row as number[], EMBEDDING_DIMENSIONS);
  });
}

async function embed(pipe: FeatureExtractionPipeline, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const batch of splitIntoBatches(texts)) {
    // CLS, not mean: this model's sentence vector is its first token, and mean pooling would
    // produce vectors that are plausible, comparable to each other, and worse.
    const output = await pipe(batch, { pooling: "cls", normalize: true });
    vectors.push(...toVectors(output.tolist()));
  }
  return vectors;
}

async function handle(request: EmbedRequest): Promise<EmbedReply> {
  try {
    const { pipe, tier } = await getPipeline(request.allowDownload);
    const startedAt = performance.now();
    const vectors = await embed(pipe, request.texts);
    const elapsed = performance.now() - startedAt;
    return {
      id: request.id,
      ok: true,
      vectors,
      loaded: true,
      backend: tier.id,
      msPerText: request.texts.length === 0 ? 0 : elapsed / request.texts.length,
    };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      loaded: loading !== null,
    };
  }
}

configure();

self.onmessage = (event: MessageEvent<EmbedRequest>) => {
  // One at a time: the pipeline is not reentrant, and a burst of callers should share one load.
  queue = queue.then(async () => {
    self.postMessage(await handle(event.data));
  });
};
