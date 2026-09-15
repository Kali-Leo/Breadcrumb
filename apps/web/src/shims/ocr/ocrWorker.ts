/**
 * Purpose: runs PP-OCRv6 tiny in the browser, inside a Worker: the detector over the page,
 * the recogniser over each line it found, then the layout model for tables and the table
 * model over each one (ocrStructure.ts) — all on the same onnxruntime WebAssembly the
 * embedding worker uses, the same files from public/ort/, so no model costs a second runtime
 * download. It has to be a Worker: a page is a second or more of synchronous arithmetic.
 * The reply is the page as the desktop's Rust command returns it: lines with their boxes,
 * and the blocks that are not running text.
 *
 * Threads follow the page's isolation, as the embedding worker's do: four where the page is
 * cross-origin isolated and one otherwise. The research note measured 1.3 s a page on four
 * threads and 3.2 s on one. WebGPU is deliberately not tried here — the detector's graph
 * produced empty maps on it in every configuration tested, and a wrong page is worse than a
 * slow one.
 *
 * Loading is cache-first and the network switch is honoured before any request is built
 * (ocrModelFiles.ts). Every failure becomes an `ok: false` reply; the page degrades from
 * there.
 * Main exports: none (worker entry).
 */
import * as ort from "onnxruntime-web/webgpu";
import { isCrossOriginIsolated } from "../embedding/backend";
import { ortWasmPaths } from "../embedding/ortAssets";
import { boxesFromMap, detectorInputSize, detectorTensor, sortBoxes } from "./ocrDetect";
import type { Quad } from "./ocrGeometry";
import { defaultOcrModelDeps, loadOcrModelFiles } from "./ocrModelFiles";
import type { OcrLine, OcrPageResult, OcrReply, OcrRequest } from "./ocrProtocol";
import { decodeCtc, planRecognitionBatches, recognitionTensor } from "./ocrRecognize";
import { findTables, loadStructureEngine, type StructureEngine } from "./ocrStructure";

interface Engine {
  det: ort.InferenceSession;
  rec: ort.InferenceSession;
  alphabet: string[];
  structure: StructureEngine;
}

let loading: Promise<Engine> | null = null;
let queue: Promise<void> = Promise.resolve();

function configure(): void {
  const cores = navigator.hardwareConcurrency ?? 1;
  ort.env.wasm.numThreads = isCrossOriginIsolated(self) && cores > 1 ? Math.min(cores, 4) : 1;
  const ortBase = new URL("ort/", new URL(import.meta.env.BASE_URL, self.location.href)).href;
  ort.env.wasm.wasmPaths = ortWasmPaths(ortBase, navigator);
}

async function loadEngine(allowDownload: boolean): Promise<Engine> {
  const files = await loadOcrModelFiles(allowDownload, defaultOcrModelDeps());
  const options: ort.InferenceSession.SessionOptions = {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  };
  const det = await ort.InferenceSession.create(files.det, options);
  const rec = await ort.InferenceSession.create(files.rec, options);
  const structure = await loadStructureEngine(ort, allowDownload, options);
  return { det, rec, alphabet: [...files.dict, " "], structure };
}

function getEngine(allowDownload: boolean): Promise<Engine> {
  loading ??= loadEngine(allowDownload).catch((error: unknown) => {
    // A failed load is not held against the next request: the switch may be on by then.
    loading = null;
    throw error;
  });
  return loading;
}

async function runSession(
  session: ort.InferenceSession,
  data: Float32Array,
  dims: readonly number[],
): Promise<{ data: Float32Array; dims: readonly number[] }> {
  const inputName = session.inputNames[0] ?? "x";
  const outputName = session.outputNames[0] ?? "";
  const results = await session.run({ [inputName]: new ort.Tensor("float32", data, [...dims]) });
  const output = results[outputName];
  if (output === undefined) throw new Error("the model produced no output");
  return { data: output.data as Float32Array, dims: output.dims };
}

/** The axis-aligned box around a detected line's four corners. */
function boxOf(quad: Quad): OcrLine["box"] {
  const xs = quad.map((point) => point[0]);
  const ys = quad.map((point) => point[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

async function readPage(engine: Engine, request: OcrRequest): Promise<OcrPageResult> {
  const { rgba, width, height } = request;
  const target = detectorInputSize(width, height);
  const input = detectorTensor(rgba, width, height, target);
  const map = await runSession(engine.det, input, [1, 3, target.height, target.width]);
  const [, , mapHeight = target.height, mapWidth = target.width] = map.dims;
  const boxes = sortBoxes(boxesFromMap(map.data, mapWidth, mapHeight, { width, height }));
  const lines: (OcrLine | null)[] = boxes.map(() => null);
  for (const batch of planRecognitionBatches(boxes)) {
    const tensor = recognitionTensor(rgba, width, height, batch);
    const output = await runSession(engine.rec, tensor.data, tensor.dims);
    const decoded = decodeCtc(output.data, output.dims, engine.alphabet);
    batch.forEach((line, slot) => {
      const read = decoded[slot];
      lines[line.index] = read === undefined ? null : { ...read, box: boxOf(line.quad) };
    });
  }
  const kept = lines.filter((line): line is OcrLine => line !== null && line.text.trim() !== "");
  const blocks = await findTables(ort, engine.structure, request, kept);
  return { lines: kept, blocks };
}

async function handle(request: OcrRequest): Promise<OcrReply> {
  try {
    const engine = await getEngine(request.allowDownload);
    const startedAt = performance.now();
    const page = await readPage(engine, request);
    return { id: request.id, ok: true, page, msPerPage: performance.now() - startedAt };
  } catch (error) {
    return {
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

configure();

self.onmessage = (event: MessageEvent<OcrRequest>) => {
  // One page at a time: the sessions are not reentrant, and a burst of pages shares one load.
  queue = queue.then(async () => {
    self.postMessage(await handle(event.data));
  });
};
