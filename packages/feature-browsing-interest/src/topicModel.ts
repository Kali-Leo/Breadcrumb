/**
 * Purpose: score one piece of browsed content (title + author) into a 48-way topic
 * probability distribution, with no network, no model download and no async — a multinomial
 * logistic regression over hashed character n-grams, its weights int8-quantised and carried in
 * `data/topicModel.json`.
 *
 * Ported from Kali-Leo/feed-mode (`interest-model/lite/interest_lite.js`, lines 8-9 and 32-53 —
 * `CFG`, `BIAS` and the scoring half of `proba`), GPL-3.0, same copyright holder (JavaScript →
 * TypeScript; the inline base64 weight blob moved out of the source file into a JSON data file;
 * feature extraction moved to ./hashing).
 *
 * Provenance of the weights, checked rather than assumed: `data/topicModel.json` is the base64
 * from `interest_lite.js:10` verbatim (524288 characters → 48 × 8192 int8), with `scale` and
 * `bias` from lines 8-9. Reconstruction is `w = int8 * scale`.
 *
 * Arithmetic order is deliberate: the score accumulates over the count Map in insertion order,
 * innermost loop over topics ascending, exactly as the reference does. Reordering it would
 * still be "the same formula" and would still change the last bits of every output.
 * Main exports: TOPIC_DIMENSIONS, classifierText, topicProbabilities.
 */
import model from "./data/topicModel.json" with { type: "json" };
import { countsL2Norm, hashedNgramCounts } from "./hashing";

export const TOPIC_DIMENSIONS = model.dims;
/** int8 → float multiplier, computed at training time as max|w| / 127. */
export const TOPIC_WEIGHT_SCALE = model.scale;
export const TOPIC_BIAS: readonly number[] = model.bias;
export const TOPIC_COUNT = model.bias.length;

let weights: Int8Array | null = null;

/** Decodes the 393,216-byte weight matrix once, on first classification. */
function weightMatrix(): Int8Array {
  if (weights !== null) return weights;
  const binary = atob(model.weightsBase64);
  const decoded = new Int8Array(binary.length);
  for (let i = 0; i < binary.length; i++) decoded[i] = (binary.charCodeAt(i) << 24) >> 24;
  weights = decoded;
  return decoded;
}

/**
 * The exact string the classifier was fitted on: title, a U+0001 separator, author; lowercased,
 * runs of whitespace collapsed. Exported because the parity test and any future re-training
 * need the one canonical answer to "what text goes in".
 */
export function classifierText(
  title: string | null | undefined,
  up: string | null | undefined,
): string {
  return `${title ?? ""} \u0001 ${up ?? ""}`.toLowerCase().replace(/\s\s+/g, " ");
}

/** Topic probabilities for one item, summing to 1, indexed like `TOPIC_LEAVES`. */
export function topicProbabilities(
  title: string | null | undefined,
  up: string | null | undefined,
): number[] {
  const counts = hashedNgramCounts(classifierText(title, up), TOPIC_DIMENSIONS);
  const norm = countsL2Norm(counts);
  const w = weightMatrix();
  const z = TOPIC_BIAS.slice();
  for (const [index, count] of counts) {
    const value = count / norm;
    for (let topic = 0; topic < TOPIC_COUNT; topic++) {
      z[topic] =
        (z[topic] ?? 0) + (w[topic * TOPIC_DIMENSIONS + index] ?? 0) * TOPIC_WEIGHT_SCALE * value;
    }
  }
  return softmax(z);
}

/** Max-shifted softmax, the reference's exact expression order. */
function softmax(z: readonly number[]): number[] {
  const max = Math.max(...z);
  let sum = 0;
  const exponentials = z.map((value) => {
    const x = Math.exp(value - max);
    sum += x;
    return x;
  });
  return exponentials.map((value) => value / sum);
}
