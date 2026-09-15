/**
 * Purpose: the second half of reading a scanned page in the browser — after the text lines,
 * the layout model looks for tables and the table model reads each one into rows. Kept
 * apart from the worker so the worker stays about sessions and messages and this stays
 * about what a page's tables are.
 *
 * The layout model runs on every page, because it is how a page is known to have a table
 * at all, and it is cheap enough for that: 0.08 s at four threads on a page the text
 * recogniser takes 1.3 s over. The table model runs only for the boxes the layout model
 * found, 0.13 s each. Measured with the desktop's larger layout model, the pipeline reads
 * six OpenStax tables at a tree edit similarity of 0.978, 98.7% of cells right; the small
 * model here finds five of the six tables (docs/research/2026-09-15-公式与表格识别实测.md).
 * Main exports: StructureEngine, loadStructureEngine, findTables.
 */
import type { OcrBlock, OcrLine } from "@desktop/lib/library/ocrPage";
import type * as ort from "onnxruntime-web/webgpu";
import { cropRegion } from "./ocrImage";
import { dedupeBoxes, layoutBoxes, layoutTensor, TABLE_SCORE } from "./ocrLayout";
import { dictionaryLines, loadModelSet, modelSetDeps } from "./ocrModelFiles";
import {
  LAYOUT_MODEL,
  type StructureModelSet,
  structureModelSources,
  TABLE_MODEL,
} from "./ocrStructureModel";
import { decodeStructure, gridOf, TABLE_SIZE, tableDictionary, tableTensor } from "./ocrTable";
import { tableRows } from "./ocrTableText";

type Ort = typeof ort;
const TABLE_MARGIN = 6;

export interface StructureEngine {
  layout: ort.InferenceSession;
  table: ort.InferenceSession;
  dictionary: string[];
}

async function fetchSet(allowDownload: boolean, set: StructureModelSet) {
  const sources = structureModelSources(set);
  return loadModelSet(allowDownload, modelSetDeps(sources, set.probeFile), set.files, sources);
}

/** Both models, cache first. Loading is done with the same session options the text
 * models use, on the same runtime. */
export async function loadStructureEngine(
  runtime: Ort,
  allowDownload: boolean,
  options: ort.InferenceSession.SessionOptions,
): Promise<StructureEngine> {
  const [layoutFiles, tableFiles] = await Promise.all([
    fetchSet(allowDownload, LAYOUT_MODEL),
    fetchSet(allowDownload, TABLE_MODEL),
  ]);
  const layoutBytes = layoutFiles.get(LAYOUT_MODEL.probeFile) ?? new Uint8Array();
  const tableBytes = tableFiles.get("SLANet_plus.onnx") ?? new Uint8Array();
  const [layout, table] = await Promise.all([
    runtime.InferenceSession.create(layoutBytes, options),
    runtime.InferenceSession.create(tableBytes, options),
  ]);
  return {
    layout,
    table,
    dictionary: tableDictionary(dictionaryLines(tableFiles.get("SLANet_plus_dict.txt"))),
  };
}

interface Output {
  data: Float32Array;
  dims: readonly number[];
}

function outputs(results: ort.InferenceSession.ReturnType): Output[] {
  return Object.values(results).map((tensor) => ({
    data: tensor.data as Float32Array,
    dims: tensor.dims,
  }));
}

/**
 * The tables on a page as blocks: where each is, and its rows of text taken from `lines`.
 * A table the model reads as fewer than two rows or columns is not one, and is left to the
 * lines it would have owned.
 */
export async function findTables(
  runtime: Ort,
  engine: StructureEngine,
  page: { rgba: Uint8Array; width: number; height: number },
  lines: readonly OcrLine[],
): Promise<OcrBlock[]> {
  const input = layoutTensor(page.rgba, page.width, page.height);
  const [imageName = "image", scaleName = "scale_factor"] = engine.layout.inputNames;
  const found = outputs(
    await engine.layout.run({
      [imageName]: new runtime.Tensor("float32", input.image, [1, 3, 480, 480]),
      [scaleName]: new runtime.Tensor("float32", input.scaleFactor, [1, 2]),
    }),
  );
  const rows = found.find((output) => output.dims[1] === 6);
  if (rows === undefined) return [];
  const tables = dedupeBoxes(
    layoutBoxes(rows.data, rows.dims, page).filter(
      (box) => box.label === "table" && box.score >= TABLE_SCORE,
    ),
  );
  const blocks: OcrBlock[] = [];
  for (const table of tables) {
    const crop = cropRegion(page.rgba, page.width, page.height, table.box, TABLE_MARGIN);
    const tensor = tableTensor(crop);
    const [inputName = "x"] = engine.table.inputNames;
    const read = outputs(
      await engine.table.run({
        [inputName]: new runtime.Tensor("float32", tensor.data, [1, 3, TABLE_SIZE, TABLE_SIZE]),
      }),
    );
    const logits = read.find((output) => output.dims[2] !== 8);
    const boxes = read.find((output) => output.dims[2] === 8);
    if (logits === undefined || boxes === undefined) continue;
    const tokens = decodeStructure(
      logits.data,
      logits.dims,
      boxes.data,
      boxes.dims,
      engine.dictionary,
      tensor.longestSide,
    );
    const grid = tableRows(gridOf(tokens), lines, table.box, { x: crop.box.x0, y: crop.box.y0 });
    if (grid !== null) blocks.push({ kind: "table", box: table.box, rows: grid });
  }
  return blocks;
}
