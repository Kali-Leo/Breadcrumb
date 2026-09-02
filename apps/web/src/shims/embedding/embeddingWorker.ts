/**
 * Purpose: runs multilingual-e5-small in the browser, inside a Worker. transformers.js loads
 * the q8 ONNX export of the same model the desktop build runs through fastembed (vectors
 * agree to a cosine of ~0.995), and ORT-wasm does the arithmetic. It has to be a Worker: one
 * text costs ~130 ms of synchronous wasm on a single thread, which on the page would be a
 * dropped frame per sentence.
 *
 * Loading is cache-first. The first attempt refuses every request to a model host, so an
 * already-downloaded model loads with no network at all — the app's network switch off
 * included. Only when that fails, and only with the switch on, is a source probed and the
 * download allowed. Every failure becomes an `ok: false` reply; the page degrades from there.
 * Main exports: none (worker entry).
 */
import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";
import { createModelCache, MODEL_CACHE_NAME } from "./modelCache";
import { createSourceResolver, isModelSourceUrl, MODEL_ID, MODEL_SOURCES } from "./modelSource";
import { ortWasmPaths } from "./ortAssets";
import type { EmbedReply, EmbedRequest } from "./protocol";
import { prefixForE5, splitIntoBatches } from "./textBatches";

const OFFLINE_MESSAGE = "embedding model is not downloaded and the network switch is off";

let networkAllowed = false;
let loading: Promise<FeatureExtractionPipeline> | null = null;
let queue: Promise<void> = Promise.resolve();
const sources = createSourceResolver({ fetch: (input, init) => fetch(input, init) });

function configure(): void {
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = false;
  env.useCustomCache = true;
  env.customCache = createModelCache(() => caches.open(MODEL_CACHE_NAME), MODEL_SOURCES);
  // The runtime's wasm is an asset of this site like any script; the browser's HTTP cache
  // keeps it fresh across deploys, where a copy in the Cache API would outlive the JS it
  // was built with.
  env.useWasmCache = false;
  // Every model-host request goes through here, so the network switch is enforced in one
  // place rather than trusted to a flag the library might not consult for every file.
  env.fetch = (input, init) => {
    if (!networkAllowed && isModelSourceUrl(String(input))) {
      return Promise.reject(new Error(OFFLINE_MESSAGE));
    }
    return fetch(input, init);
  };
  const wasm = env.backends.onnx.wasm;
  if (wasm === undefined) throw new Error("onnxruntime-web has no wasm backend in this build");
  const ortBase = new URL("ort/", new URL(import.meta.env.BASE_URL, self.location.href)).href;
  wasm.wasmPaths = ortWasmPaths(ortBase, navigator);
  // No cross-origin isolation on static hosting means no SharedArrayBuffer, so one thread;
  // saying so skips the runtime's own probing.
  wasm.numThreads = 1;
}

function createPipeline(): Promise<FeatureExtractionPipeline> {
  return pipeline("feature-extraction", MODEL_ID, { dtype: "q8", device: "wasm" });
}

async function loadPipeline(allowDownload: boolean): Promise<FeatureExtractionPipeline> {
  networkAllowed = false;
  try {
    return await createPipeline();
  } catch (cacheMiss) {
    if (!allowDownload) throw cacheMiss;
    const host = await sources.resolve();
    if (host === null) throw new Error("no model source is reachable");
    env.remoteHost = host;
    networkAllowed = true;
    try {
      return await createPipeline();
    } finally {
      networkAllowed = false;
    }
  }
}

function getPipeline(allowDownload: boolean): Promise<FeatureExtractionPipeline> {
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
    return row as number[];
  });
}

async function embed(pipe: FeatureExtractionPipeline, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const batch of splitIntoBatches(texts.map(prefixForE5))) {
    const output = await pipe(batch, { pooling: "mean", normalize: true });
    vectors.push(...toVectors(output.tolist()));
  }
  return vectors;
}

async function handle(request: EmbedRequest): Promise<EmbedReply> {
  try {
    const pipe = await getPipeline(request.allowDownload);
    return { id: request.id, ok: true, vectors: await embed(pipe, request.texts), loaded: true };
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
