/**
 * Purpose: building the pipeline — which of the three backends it runs on, where its files
 * come from, and the one warning that is not worth a reader's console.
 *
 * Split out of embeddingWorker.ts because it is a different job: the worker owns the request
 * queue and the vectors, this owns the model. Everything about the network switch lives here
 * too, so there is one place that decides whether a request to a model host may go out.
 * Main exports: loadPipeline, allowNetwork, OFFLINE_MESSAGE, LoadedPipeline.
 */
import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";
import { availableTiers, type BackendTier, gpuIsUsable } from "./backend";
import { configuredModelBase, createSourceResolver, MODEL_ID } from "./modelSource";
import { safariSimdIsBroken } from "./ortAssets";

export const OFFLINE_MESSAGE = "embedding model is not downloaded and the network switch is off";

export interface LoadedPipeline {
  pipe: FeatureExtractionPipeline;
  tier: BackendTier;
}

let networkAllowed = false;
const sources = createSourceResolver({ fetch: (input, init) => fetch(input, init) });

/** Read by the worker's env.fetch override, which is the single gate every model-host request
 * passes through. A flag rather than an argument because transformers.js does its own fetching
 * several layers down and there is nothing to thread a parameter through. */
export function allowNetwork(): boolean {
  return networkAllowed;
}

/**
 * This model declares a `model_type` transformers.js has no entry for, so the library builds
 * it from the base class and says so out loud. The result is correct — checked against the
 * reference implementation, cosine 1.0000 — so the warning describes something that is not a
 * problem. Only that one sentence is swallowed, and only while a pipeline is being built;
 * every other warning the library has to make still arrives.
 */
async function withoutUnknownClassWarning<T>(build: () => Promise<T>): Promise<T> {
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Unknown model class")) return;
    original.apply(console, args as []);
  };
  try {
    return await build();
  } finally {
    console.warn = original;
  }
}

function createPipeline(tier: BackendTier): Promise<FeatureExtractionPipeline> {
  const wasm = env.backends.onnx.wasm;
  if (wasm !== undefined) wasm.numThreads = tier.threads;
  return withoutUnknownClassWarning(() =>
    pipeline("feature-extraction", MODEL_ID, { dtype: tier.dtype, device: tier.device }),
  );
}

/** Tries each tier in turn. No capability flag reliably predicts a failure deep in a graphics
 * driver, so the probe is the attempt itself; the last tier always exists. */
async function firstWorkingTier(tiers: readonly BackendTier[]): Promise<LoadedPipeline> {
  let lastError: unknown = new Error("no embedding backend is available in this browser");
  for (const tier of tiers) {
    try {
      return { pipe: await createPipeline(tier), tier };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function loadPipeline(allowDownload: boolean): Promise<LoadedPipeline> {
  if (safariSimdIsBroken(navigator)) {
    // Refusing leaves every caller on its existing "no embeddings" path; running would write
    // wrong vectors into the database, where nothing downstream could tell they were wrong.
    throw new Error("this Safari version computes WebAssembly SIMD incorrectly");
  }
  const tiers = availableTiers(navigator, self, await gpuIsUsable(navigator));
  networkAllowed = false;
  try {
    return await firstWorkingTier(tiers);
  } catch (cacheMiss) {
    if (!allowDownload) throw cacheMiss;
    const host = configuredModelBase() ?? (await sources.resolve());
    if (host === null) throw new Error("no model source is reachable");
    env.remoteHost = host;
    networkAllowed = true;
    try {
      return await firstWorkingTier(tiers);
    } finally {
      networkAllowed = false;
    }
  }
}
