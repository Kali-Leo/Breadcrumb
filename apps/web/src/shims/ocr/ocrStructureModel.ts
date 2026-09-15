/**
 * Purpose: which layout and table models the browser edition downloads, from where, and
 * what each file has to be before it is trusted — the second and third models of a scanned
 * page, after the text pair in ocrModel.ts.
 *
 * PP-DocLayout-S finds the tables (the desktop runs PP-DocLayout-M; measured in a browser,
 * M costs 0.46 s a page on four WebAssembly threads and 1.6 s on one, S 0.08 s and 0.10 s,
 * against a page that already takes 1.3 s to read — so S is the one whose cost a reader
 * would not notice, at 4.9 MB). SLANet_plus reads a table's structure, 0.13 s a table in
 * WebAssembly, 7.8 MB, the same graph the desktop runs. Both are PaddleOCR's own ONNX
 * exports, unchanged, in the same repository as everything else the app fetches, each under
 * its own tag. With these the browser edition's first scanned page downloads 6.3 + 12.7 MB.
 * Numbers: docs/research/2026-09-15-公式与表格识别实测.md.
 * Main exports: LAYOUT_MODEL, TABLE_MODEL, StructureModelSet.
 */
import { MODEL_PACKS_REPO, modelMirrorDirectory } from "@breadcrumb/core-vectors";
import type { OcrModelFile } from "./ocrModel";

export interface StructureModelSet {
  dir: string;
  tag: string;
  files: readonly OcrModelFile[];
  /** The smallest file, which the host probe asks for. */
  probeFile: string;
}

/** jsDelivr first, raw GitHub second — the same order and reasons as the text pair's. */
export function structureModelSources(set: StructureModelSet): readonly string[] {
  const configured = import.meta.env.VITE_MODEL_BASE_URL;
  if (typeof configured === "string" && configured !== "") return [`${configured}${set.dir}/`];
  return [
    modelMirrorDirectory(set.dir, set.tag),
    `https://raw.githubusercontent.com/${MODEL_PACKS_REPO}/${set.tag}/models/${set.dir}/`,
  ];
}

/** PP-DocLayout-S, measured from PaddleOCR's `PP-DocLayout-S_infer` export (paddle3.0.0). */
export const LAYOUT_MODEL: StructureModelSet = {
  dir: "pp-doclayout-s",
  tag: "pp-doclayout-s-v1",
  files: [
    {
      name: "PP-DocLayout-S.onnx",
      bytes: 4_914_918,
      sha256: "c2336493a0a13cd9b9b457ca68aea370b327c362a4a7da4917c2bba96029bceb",
    },
  ],
  probeFile: "PP-DocLayout-S.onnx",
};

/** SLANet_plus with its token list, from PaddleOCR's `SLANet_plus_infer` export. */
export const TABLE_MODEL: StructureModelSet = {
  dir: "slanet-plus",
  tag: "slanet-plus-v1",
  files: [
    {
      name: "SLANet_plus.onnx",
      bytes: 7_782_138,
      sha256: "3a96a71719247c5d94992fca31266b598c54740388de371f0c75077e2a9e0b55",
    },
    {
      name: "SLANet_plus_dict.txt",
      bytes: 578,
      sha256: "68d344a84b726e043f390122240ff2b2ced2949b2a80ce9b61ae955054d190ef",
    },
  ],
  probeFile: "SLANet_plus_dict.txt",
};
