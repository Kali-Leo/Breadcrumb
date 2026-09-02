/**
 * Purpose: where the ONNX runtime's WebAssembly comes from. Left to itself, transformers.js
 * fetches it from cdn.jsdelivr.net, which is unreachable from the mainland; this build serves
 * the same files from its own origin (copied into public/ort/ by copy-ort-assets.mjs before
 * every dev run and build), so the runtime loads from wherever the app itself loaded from.
 *
 * transformers.js hands Safari the plain build and every other browser the asyncify build;
 * that split is reproduced here, and its Safari test is ported verbatim (transformers.js,
 * Apache-2.0) so the two agree about which browser is which.
 * Main exports: ORT_FILES, isSafariLike, ortWasmPaths.
 */

export interface WasmPaths {
  mjs: string;
  wasm: string;
}

interface NavigatorLike {
  userAgent: string;
  vendor?: string;
}

const PLAIN = "ort-wasm-simd-threaded";
const ASYNCIFY = "ort-wasm-simd-threaded.asyncify";

/** Every file copy-ort-assets.mjs has to publish: both variants, glue and binary. */
export const ORT_FILES: readonly string[] = [
  `${PLAIN}.mjs`,
  `${PLAIN}.wasm`,
  `${ASYNCIFY}.mjs`,
  `${ASYNCIFY}.wasm`,
];

export function isSafariLike(nav: NavigatorLike | undefined): boolean {
  if (nav === undefined) return false;
  const userAgent = nav.userAgent;
  const vendor = nav.vendor ?? "";
  const isAppleVendor = vendor.includes("Apple");
  const notOtherBrowser =
    !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i.test(userAgent) &&
    !userAgent.includes("Chrome") &&
    !userAgent.includes("Android");
  return isAppleVendor && notOtherBrowser;
}

/** `ortBaseUrl` is the absolute URL of the published ort/ directory, trailing slash included. */
export function ortWasmPaths(ortBaseUrl: string, nav: NavigatorLike | undefined): WasmPaths {
  const variant = isSafariLike(nav) ? PLAIN : ASYNCIFY;
  return { mjs: `${ortBaseUrl}${variant}.mjs`, wasm: `${ortBaseUrl}${variant}.wasm` };
}
