#!/usr/bin/env node
/**
 * Purpose: publishes the ONNX runtime's WebAssembly under public/ort/ so the browser edition
 * serves it from its own origin instead of cdn.jsdelivr.net (see ortAssets.ts). Runs before
 * every `dev` and `build` from apps/web/package.json.
 *
 * The files come from the onnxruntime-web that @huggingface/transformers itself resolves,
 * so the copied binary always matches the JavaScript that will load it. Copies are skipped
 * when the published file already has the source's size, which keeps a dev restart instant.
 * Zero dependencies, Node 24.
 */
import { copyFileSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Kept in step with ORT_FILES in ortAssets.ts; this script cannot import TypeScript.
const FILES = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
];

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const transformersDir = realpathSync(join(webRoot, "node_modules/@huggingface/transformers"));
const ortEntry = createRequire(join(transformersDir, "package.json")).resolve("onnxruntime-web");
const sourceDir = dirname(ortEntry);
const targetDir = join(webRoot, "public/ort");
mkdirSync(targetDir, { recursive: true });

function sizeOf(path) {
  try {
    return statSync(path).size;
  } catch {
    return -1;
  }
}

let copied = 0;
for (const file of FILES) {
  const source = join(sourceDir, file);
  const target = join(targetDir, file);
  if (sizeOf(source) === sizeOf(target)) continue;
  copyFileSync(source, target);
  copied += 1;
}
console.log(
  `ort assets: ${copied} copied, ${FILES.length - copied} already current (${targetDir})`,
);
