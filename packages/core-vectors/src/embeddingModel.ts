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
 * MODEL_PACKS_REPO, MODEL_FILE_BASE_URL_ENV, EMBEDDING_MODEL_TAG, modelMirrorDirectory,
 * isCurrentEmbedding, truncateToStoredWidth.
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

/** The GitHub repository the two editions pull their model files out of. Both the desktop's
 * release assets and the browser's split graph live here, so the owner/name is stated once. */
export const MODEL_PACKS_REPO = "Kali-Leo/breadcrumb-language-packs";

/**
 * Where the desktop fetches model files from, and the environment variable that overrides it.
 * The browser reads `VITE_MODEL_BASE_URL` instead, and neither edition has the same URL shape,
 * which is why this constant is the desktop's alone — see MODEL_PACKS_REPO for the part they
 * share.
 *
 * GitHub release assets, not the repository tree: the graphs are 311 MB and 570 MB, well past
 * the 100 MB a file in a git repository may be. The browser cannot use these — release asset
 * downloads redirect to a host that sends no CORS headers, so a page's fetch of one fails —
 * but the desktop's HTTP client does not care, and this is the only place a file that size can
 * sit without Git LFS.
 */
export const MODEL_FILE_BASE_URL_ENV = "BREADCRUMB_MODEL_BASE_URL";
export const DEFAULT_MODEL_FILE_BASE_URL = `https://github.com/${MODEL_PACKS_REPO}/releases/download/`;

/** Directory name: where a model's files sit on disk, and the folder they are published under
 * in the repository tree the browser reads. */
export const EMBEDDING_MODEL_DIR = "gte-multilingual-base";
export const RERANKER_MODEL_DIR = "bge-reranker-v2-m3";

/**
 * The release tag each model's files hang off, which is also the git tag the browser pins its
 * downloads to.
 *
 * A release asset has no folder — every asset of one release shares one flat namespace — so
 * the tag is the only thing keeping one model's `model_int8.onnx` from the other's, and there
 * is one release per model rather than one per version of the pair. The version suffix moves
 * when the exported files change, never when the code around them does: a tag that already
 * exists is one the caches of the world have already answered for.
 */
export const EMBEDDING_MODEL_TAG = "gte-multilingual-base-int8-v1";
export const RERANKER_MODEL_TAG = "bge-reranker-v2-m3-int8-v1";

/**
 * The CDN that serves the repository tree, where each graph sits in 18 MiB pieces beside a
 * manifest. The browser's only way to the files (release assets carry no CORS headers) and
 * the desktop's second, after the release — and the one a user on the mainland actually gets,
 * since jsDelivr is reachable there and GitHub's release host mostly is not. Mirrored in
 * apps/desktop/src-tauri/src/model_sources.rs (MIRROR_BASE).
 */
export const MODEL_MIRROR_BASE = "https://cdn.jsdelivr.net/gh/";

/** The directory a model's pieces are read from on the mirror, trailing slash included. */
export function modelMirrorDirectory(dir: string, tag: string): string {
  return `${MODEL_MIRROR_BASE}${MODEL_PACKS_REPO}@${tag}/models/${dir}/`;
}

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
