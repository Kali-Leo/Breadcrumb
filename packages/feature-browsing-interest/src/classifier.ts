/**
 * Purpose: the embedding-backed layer of browsing-interest classification — a 384-dim
 * multilingual-e5-small vector in, a 48-way topic distribution and a 9-way emotion
 * distribution out. Pure arithmetic over int8 coefficients kept in classifierCoefficients.json
 * (~32 KB); no model, no network, no state.
 *
 * It does NOT embed anything. `embedTexts` lives in the app (Rust on desktop, a worker in the
 * browser) and returns null whenever the model is missing or the network switch is off, so
 * this module takes the embedder as an argument and passes that null straight through. A null
 * here means "ask the n-gram layer", never "this text has no topics" — see classifierLayers.ts.
 *
 * Ported from Kali-Leo/feed-mode (interest-model/daemon/app.py, class Classifier), GPL-3.0,
 * re-licensed AGPL-3.0-only by the copyright holder; modified 2026-09 (Python/sklearn ->
 * TypeScript, bge-small-zh -> the multilingual-e5-small this app already runs, joblib ->
 * int8 JSON). Retrain with scripts/interest-model/train_classifiers.py.
 * Main exports: classifyVectors, classifyTexts, decodeHead, topicClassifierHead,
 * emotionClassifierHead.
 */
import coefficients from "./classifierCoefficients.json" with { type: "json" };
import { EMOTION_NAMES, TOPIC_LEAVES } from "./taxonomy";

/** Mirrors MAX_TEXT_CHARS in apps/desktop/src-tauri/src/embeddings.rs, which refuses a whole
 * batch when one text is longer. Titles are capped far below this upstream; a pathological
 * one is truncated here rather than costing every other text in the batch its vector. */
export const MAX_CLASSIFY_CHARS = 2000;

/** How the trained coefficients arrive: int8 rows, one scale per class. */
export interface QuantisedHead {
  readonly classes: number;
  readonly dims: number;
  readonly scales: readonly number[];
  readonly intercepts: readonly number[];
  readonly weightsBase64: string;
}

/** Dequantised and ready to multiply. `weights` is row-major, `classes` rows of `dims`. */
export interface ClassifierHead {
  readonly classes: number;
  readonly dims: number;
  readonly weights: Float32Array;
  readonly intercepts: Float32Array;
}

/** Shaped to drop straight into `EventClassification` (./events) once a layer name is added. */
export interface EmbeddingClassification {
  /** Sums to 1 over the 48 taxonomy leaves, indexed like TOPIC_LEAVES. */
  readonly topicProbabilities: readonly number[];
  /** Sums to 1 over the 9 emotions, indexed like EMOTION_NAMES. Valence is not computed here:
   * `classificationOf` in ./events owns that one weighted sum for both layers. */
  readonly emotionProbabilities: readonly number[];
}

/** The embedding model these coefficients were fitted on. A vector from anything else is
 * meaningless here — different models do not share a vector space — so a caller that stores
 * vectors should record this name alongside them. Matches EMBEDDING_MODEL in
 * apps/desktop/src/lib/platform/embeddings.ts (the q8 browser export counts as the same
 * space: the two agree to a cosine of ~0.995). */
export const CLASSIFIER_MODEL: string = coefficients.model;
/** The prefix the vectors must have been embedded with — E5 models are trained with it, and
 * dropping it moves the whole space. Mirrors QUERY_PREFIX in
 * apps/web/src/shims/embedding/textBatches.ts and the `format!("query: {t}")` in
 * apps/desktop/src-tauri/src/embeddings.rs. */
export const CLASSIFIER_PREFIX: string = coefficients.prefix;

/** The taxonomy the coefficients were fitted against, kept so a retrain against a changed
 * taxonomy is caught by a test instead of silently renumbering every stored topic. */
export const COEFFICIENT_TOPIC_LABELS: readonly string[] = coefficients.topicLabels;
export const COEFFICIENT_EMOTION_LABELS: readonly string[] = coefficients.emotionLabels;

/** `atob` is the one base64 decoder both editions have (Node 24 and every target browser),
 * so there is no runtime-specific branch here. */
function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** int8 -> float32, one scale per class row. Throws on a malformed head: the coefficients are
 * a build artefact of this repo, so a mismatch is a broken build, not user input. */
export function decodeHead(spec: QuantisedHead): ClassifierHead {
  const bytes = decodeBase64(spec.weightsBase64);
  const expected = spec.classes * spec.dims;
  if (bytes.length !== expected) {
    throw new Error(`classifier head has ${bytes.length} weights, expected ${expected}`);
  }
  if (spec.scales.length !== spec.classes || spec.intercepts.length !== spec.classes) {
    throw new Error("classifier head has the wrong number of scales or intercepts");
  }
  const signed = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  const weights = new Float32Array(expected);
  for (let row = 0; row < spec.classes; row += 1) {
    const scale = spec.scales[row] ?? 0;
    const offset = row * spec.dims;
    for (let column = 0; column < spec.dims; column += 1) {
      weights[offset + column] = (signed[offset + column] ?? 0) * scale;
    }
  }
  return {
    classes: spec.classes,
    dims: spec.dims,
    weights,
    intercepts: Float32Array.from(spec.intercepts),
  };
}

let topicHead: ClassifierHead | null = null;
let emotionHead: ClassifierHead | null = null;

/** Decoded once, on first use — the decode is ~18 KB of arithmetic and most sessions never
 * classify anything. */
export function topicClassifierHead(): ClassifierHead {
  topicHead ??= decodeHead(coefficients.topic);
  if (topicHead.classes !== TOPIC_LEAVES.length) {
    throw new Error("classifier coefficients and the taxonomy disagree on the topic count");
  }
  return topicHead;
}

export function emotionClassifierHead(): ClassifierHead {
  emotionHead ??= decodeHead(coefficients.emotion);
  if (emotionHead.classes !== EMOTION_NAMES.length) {
    throw new Error("classifier coefficients and the taxonomy disagree on the emotion count");
  }
  return emotionHead;
}

/** softmax(W·x + b). Returns null when the vector is not what this head was fitted on —
 * wrong length, or a NaN from a half-failed embedder — because a wrong answer here would be
 * written to the profile as though it were evidence. */
export function scoreVector(head: ClassifierHead, vector: readonly number[]): number[] | null {
  if (vector.length !== head.dims) return null;
  const logits = new Float64Array(head.classes);
  let highest = Number.NEGATIVE_INFINITY;
  for (let row = 0; row < head.classes; row += 1) {
    let sum = head.intercepts[row] ?? 0;
    const offset = row * head.dims;
    for (let column = 0; column < head.dims; column += 1) {
      sum += (head.weights[offset + column] ?? 0) * (vector[column] ?? 0);
    }
    if (!Number.isFinite(sum)) return null;
    logits[row] = sum;
    if (sum > highest) highest = sum;
  }
  let total = 0;
  const probabilities = new Array<number>(head.classes);
  for (let row = 0; row < head.classes; row += 1) {
    const value = Math.exp((logits[row] ?? 0) - highest);
    probabilities[row] = value;
    total += value;
  }
  if (!(total > 0)) return null;
  for (let row = 0; row < head.classes; row += 1) {
    probabilities[row] = (probabilities[row] ?? 0) / total;
  }
  return probabilities;
}

/** Classifies vectors that are already embedded. One bad vector yields one null, so a single
 * malformed row never discards the rest of a batch. */
export function classifyVectors(
  vectors: readonly (readonly number[])[],
): (EmbeddingClassification | null)[] {
  const topics = topicClassifierHead();
  const emotions = emotionClassifierHead();
  return vectors.map((vector) => {
    const topicProbabilities = scoreVector(topics, vector);
    const emotionProbabilities = scoreVector(emotions, vector);
    if (topicProbabilities === null || emotionProbabilities === null) return null;
    return { topicProbabilities, emotionProbabilities };
  });
}

/** What the app's embedder looks like from here: many texts in, one vector each, or null for
 * "no embeddings right now" (model not downloaded, network switch off, worker refused). */
export type EmbedTexts = (texts: readonly string[]) => Promise<number[][] | null>;

/** The full path: text -> vector -> distributions. Null (not an array of nulls) when the
 * embedder gave nothing, which is the caller's signal to fall back to the n-gram layer. */
export async function classifyTexts(
  embed: EmbedTexts,
  texts: readonly string[],
): Promise<(EmbeddingClassification | null)[] | null> {
  if (texts.length === 0) return [];
  const vectors = await embed(texts.map((text) => text.slice(0, MAX_CLASSIFY_CHARS)));
  if (vectors === null || vectors.length !== texts.length) return null;
  return classifyVectors(vectors);
}
