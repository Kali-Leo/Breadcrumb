/**
 * Purpose: which of the three ways a browser can run this model is available, in the order
 * worth trying, and how to tell when the one that worked is too slow to leave the reader in.
 *
 * The three are a real hierarchy, not preferences:
 *  1. WebGPU. The graph runs on the graphics card. Where it exists it is the only tier that
 *     makes indexing a whole book feel like a progress bar rather than an afternoon.
 *  2. WebAssembly across several threads. Needs SharedArrayBuffer, which a page only gets when
 *     it is cross-origin isolated — the service worker adds the two headers that do that
 *     (see vite.pwa.ts), so this tier is available on a second visit and not a first.
 *  3. WebAssembly on one thread. Always available, and slow enough that a large import is
 *     measured in tens of minutes.
 *
 * Each tier is tried in turn and the first that builds a session wins; there is no capability
 * flag that reliably predicts a failure three layers down in a driver, so the probe is the
 * attempt itself.
 *
 * None of this vocabulary reaches the reader. What reaches the reader is a sentence about
 * which browser to use, and only when the measured cost per passage says it would help — that
 * decision lives in the desktop source (lib/library/librarySpeedHint.ts), because it is copy,
 * not capability.
 * Main exports: BACKEND_TIERS, availableTiers, gpuIsUsable, isCrossOriginIsolated, BackendTier.
 */

export interface BackendTier {
  /** Names the onnxruntime execution provider transformers.js should use. */
  device: "webgpu" | "wasm";
  /**
   * Which published graph to fetch — the same one on every tier, which is worth saying
   * because it looks like a missed opportunity and is not.
   *
   * "int8" here means int8 *weights*: they are dequantized to fp32 and every multiplication,
   * on the card and on the processor alike, is fp32. So the graphics card is already doing
   * full-precision arithmetic and a separate fp32 export would buy it nothing but a 1.2 GB
   * download in place of a 311 MB one. (Measured: this file agrees with the reference
   * implementation to a cosine of 0.9994. An ordinary dynamically-quantized export of this
   * model manages 0.918 and costs 0.045 of Chinese nDCG@10 — see the research note. The
   * difference is entirely in how it was made.)
   */
  dtype: "int8";
  threads: number;
  /** Stable identifier for logs and for the store; never shown to a reader. */
  id: "webgpu" | "wasm-threads" | "wasm-single";
}

/** Best first. */
export const BACKEND_TIERS: readonly BackendTier[] = [
  { id: "webgpu", device: "webgpu", dtype: "int8", threads: 1 },
  { id: "wasm-threads", device: "wasm", dtype: "int8", threads: 4 },
  { id: "wasm-single", device: "wasm", dtype: "int8", threads: 1 },
];

interface NavigatorWithGpu {
  gpu?: { requestAdapter(): Promise<unknown> };
  hardwareConcurrency?: number;
}

/**
 * Whether the graphics card is actually usable, asked rather than assumed.
 *
 * `navigator.gpu` exists in plenty of places that cannot produce an adapter — a headless
 * browser, a virtual machine, a laptop whose driver the browser has blocklisted. Finding that
 * out by trying to build a session is expensive and, worse, not free of consequences: the
 * runtime that failed to start on the card stayed broken for the WebAssembly attempts that
 * followed, so all three tiers reported the graphics card's error and the page ended up with
 * no embeddings at all when it should have had slow ones. Asking for an adapter first is one
 * cheap call and it cannot poison anything.
 */
export async function gpuIsUsable(nav: NavigatorWithGpu | undefined): Promise<boolean> {
  if (nav?.gpu === undefined) return false;
  try {
    return (await nav.gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}

/** SharedArrayBuffer exists but throws on construction outside a cross-origin-isolated page in
 * some browsers, and is simply absent in others; `crossOriginIsolated` is the one answer that
 * means what it says. */
export function isCrossOriginIsolated(scope: { crossOriginIsolated?: boolean }): boolean {
  return scope.crossOriginIsolated === true;
}

/**
 * The tiers this environment could plausibly run, in order. A tier that is certainly absent is
 * dropped rather than attempted, because attempting it costs a model download before it fails.
 */
export function availableTiers(
  navigatorLike: NavigatorWithGpu | undefined,
  scope: { crossOriginIsolated?: boolean },
  gpuUsable = false,
): BackendTier[] {
  const cores = navigatorLike?.hardwareConcurrency ?? 1;
  return BACKEND_TIERS.filter((tier) => {
    if (tier.id === "webgpu") return gpuUsable;
    if (tier.id === "wasm-threads") return isCrossOriginIsolated(scope) && cores > 1;
    return true;
  }).map((tier) =>
    tier.id === "wasm-threads" ? { ...tier, threads: Math.min(cores, 4) } : { ...tier },
  );
}
