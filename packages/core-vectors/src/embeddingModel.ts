/**
 * Purpose: the single place that says which embedding model this product runs, how wide its
 * vectors are stored, and under what name every row is stamped. Three editions have to agree
 * on all three facts — the desktop's Rust bridge, the browser's Worker, and the SQL that
 * decides what still needs embedding — and the only way three copies stay equal is if there
 * is one.
 *
 * Why gte-multilingual-base: measured against five corpora and 4,085 human-labelled queries
 * (docs/research/2026-09-12-向量模型中英文对比.md), it is the strongest model on Chinese and
 * English at this size — Chinese nDCG@10 +0.134 over the multilingual-e5-small it replaces —
 * and the only candidate whose score survives truncation to 384 dimensions intact (0.744 →
 * 0.744, where bge-m3 loses 0.027 and e5-large 0.038). That Matryoshka property is what lets
 * the stored width stay where it was while the quality moves.
 *
 * Why the model name is a hard constraint rather than a label: 384 → 384 is the one model
 * swap the dimension-majority guard in jsonColumns.ts cannot see. Two vectors of equal length
 * from two different models are not comparable, and a cosine between them is a plausible
 * number with no meaning. So `model` is read, not just written: anything that is not
 * EMBEDDING_MODEL is treated as absent everywhere, and nothing mixes.
 * Main exports: EMBEDDING_MODEL, EMBEDDING_MODEL_REPO, EMBEDDING_DIMENSIONS, RERANKER_MODEL,
 * MODEL_FILE_BASE_URL_ENV, isCurrentEmbedding, truncateToStoredWidth.
 */
import { l2Normalize } from "./similarity";

/** The upstream weights, Apache-2.0. Our own ONNX is exported from these rather than from a
 * third-party conversion: the readily available int8 export agrees with fp32 only to a cosine
 * of 0.918 and costs 0.045 of Chinese nDCG@10, and its repository declares no licence. */
export const EMBEDDING_MODEL_REPO = "Alibaba-NLP/gte-multilingual-base";

/**
 * What goes in `node_embeddings.model` and `library_passage_embeddings.model`. The suffixes
 * are load-bearing, not decoration: they name the two things that change the numbers — the
 * quantisation and the stored width. Mirrored verbatim in apps/desktop/src-tauri/src (Rust
 * const EMBEDDING_MODEL); if you change it here, change it there in the same commit.
 *
 * Both editions run the same int8 ONNX at the same width this time, so unlike the e5 era
 * there is no `-q8` fork: a library exported from the browser and one from the desktop hold
 * comparable vectors.
 */
export const EMBEDDING_MODEL = "gte-multilingual-base-int8-384";

/** Vectors are truncated to this many dimensions and re-normalized. Free for this model and
 * this model only — see the Matryoshka note above. */
export const EMBEDDING_DIMENSIONS = 384;

/** gte takes no task prefix. e5 did (`query: `), and carrying that habit over would silently
 * cost accuracy, so the absence is stated rather than left implicit. */
export const EMBEDDING_QUERY_PREFIX = "";

/** The optional second stage. int8 because the built-in fastembed entry for this model pulls
 * a 2.3 GB fp32 graph, which no one is downloading to reorder fifty passages. */
export const RERANKER_MODEL = "bge-reranker-v2-m3-int8";

/**
 * Where the model files are fetched from. Ours are not published yet, so this is deliberately
 * overridable: the desktop reads the environment variable of this name, the browser reads
 * `VITE_MODEL_BASE_URL`, and both fall back to the constant below.
 */
export const MODEL_FILE_BASE_URL_ENV = "BREADCRUMB_MODEL_BASE_URL";
export const DEFAULT_MODEL_FILE_BASE_URL =
  "https://huggingface.co/Kali-Leo/breadcrumb-language-packs/resolve/main/";

/** Directory name under the base url, for both editions. */
export const EMBEDDING_MODEL_DIR = "gte-multilingual-base";
export const RERANKER_MODEL_DIR = "bge-reranker-v2-m3";

/** True only for vectors this build can compare against the ones it computes now. Every
 * caller that reads a stored vector goes through this rather than trusting the row. */
export function isCurrentEmbedding(model: string): boolean {
  return model === EMBEDDING_MODEL;
}

/**
 * The stored form of a model output: first EMBEDDING_DIMENSIONS values, re-normalized.
 *
 * The re-normalization is not cosmetic. Truncating a unit vector leaves it shorter than unit
 * length, and while cosine is scale-invariant for a pair, the packed path
 * (packedVectors.ts) and every stored-dot-product shortcut assume unit rows. A vector that is
 * 0.93 long there reads as a weaker match than it is.
 *
 * A vector shorter than the target is returned normalized but unpadded: padding with zeros
 * would invent a direction, and the length check in cosineSimilarity is there to catch this
 * exact case loudly instead.
 */
export function truncateToStoredWidth(
  vector: readonly number[],
  dimensions: number = EMBEDDING_DIMENSIONS,
): number[] {
  return l2Normalize(vector.length > dimensions ? vector.slice(0, dimensions) : vector);
}
