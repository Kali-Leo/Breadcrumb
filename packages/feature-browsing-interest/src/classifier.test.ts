import { describe, expect, it } from "vitest";
import {
  CLASSIFIER_MODEL,
  CLASSIFIER_PREFIX,
  COEFFICIENT_EMOTION_LABELS,
  COEFFICIENT_TOPIC_LABELS,
  classifyTexts,
  classifyVectors,
  decodeHead,
  emotionClassifierHead,
  MAX_CLASSIFY_CHARS,
  type QuantisedHead,
  scoreVector,
  topicClassifierHead,
} from "./classifier";
import parity from "./classifierParity.json" with { type: "json" };
import { classificationOf } from "./events";
import { EMOTION_NAMES, EMOTION_VALENCES, TOPIC_LEAVES } from "./taxonomy";

function decodeVector(base64: string): number[] {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return Array.from(new Float32Array(bytes.buffer));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function argmax(values: readonly number[]): number {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] ?? 0) > (values[best] ?? 0)) best = index;
  }
  return best;
}

describe("coefficient loading and dequantisation", () => {
  it("dequantises int8 weights by their per-class scale", () => {
    // classes = 2, dims = 3; bytes are int8 two's complement: 127, -127, 0 / 1, 2, -3
    const head: QuantisedHead = {
      classes: 2,
      dims: 3,
      scales: [0.5, 2],
      intercepts: [0.25, -0.25],
      weightsBase64: btoa(String.fromCharCode(127, 129, 0, 1, 2, 253)),
    };
    const decoded = decodeHead(head);
    expect(Array.from(decoded.weights)).toEqual([63.5, -63.5, 0, 2, 4, -6]);
    expect(Array.from(decoded.intercepts)).toEqual([0.25, -0.25]);
  });

  it("refuses a head whose weight count does not match classes x dims", () => {
    expect(() =>
      decodeHead({
        classes: 2,
        dims: 3,
        scales: [1, 1],
        intercepts: [0, 0],
        weightsBase64: btoa("abcd"),
      }),
    ).toThrow(/expected 6/);
  });

  it("refuses a head with the wrong number of scales", () => {
    expect(() =>
      decodeHead({
        classes: 2,
        dims: 2,
        scales: [1],
        intercepts: [0, 0],
        weightsBase64: btoa("abcd"),
      }),
    ).toThrow(/scales or intercepts/);
  });

  it("ships heads of the shape the taxonomy describes", () => {
    const topics = topicClassifierHead();
    const emotions = emotionClassifierHead();
    expect(topics.classes).toBe(48);
    expect(topics.dims).toBe(384);
    expect(emotions.classes).toBe(EMOTION_VALENCES.length);
    expect(emotions.dims).toBe(384);
  });

  it("was trained against the taxonomy this package ships, in the same order", () => {
    // The index of a topic IS its column. A retrain against a reordered taxonomy would
    // renumber every stored row silently, so the training-time labels travel with the
    // coefficients and are compared here rather than trusted.
    expect(COEFFICIENT_TOPIC_LABELS).toEqual(TOPIC_LEAVES);
    expect(COEFFICIENT_EMOTION_LABELS).toEqual(EMOTION_NAMES);
    expect(CLASSIFIER_MODEL).toBe("multilingual-e5-small");
    expect(CLASSIFIER_PREFIX).toBe("query: ");
  });

  it("decodes the heads once and hands back the same object", () => {
    expect(topicClassifierHead()).toBe(topicClassifierHead());
  });
});

describe("scoring", () => {
  const head = decodeHead({
    classes: 2,
    dims: 2,
    scales: [1, 1],
    intercepts: [0, 0],
    weightsBase64: btoa(String.fromCharCode(1, 0, 0, 1)),
  });

  it("returns a softmax over the classes", () => {
    const scores = scoreVector(head, [1, 0]);
    expect(scores).not.toBeNull();
    expect(sum(scores ?? [])).toBeCloseTo(1, 12);
    expect((scores ?? [])[0]).toBeGreaterThan((scores ?? [])[1] ?? 0);
  });

  it("returns null rather than a wrong answer for a vector of the wrong length", () => {
    expect(scoreVector(head, [1, 0, 0])).toBeNull();
    expect(scoreVector(head, [])).toBeNull();
  });

  it("returns null when the vector carries NaN or Infinity", () => {
    expect(scoreVector(head, [Number.NaN, 0])).toBeNull();
    expect(scoreVector(head, [Number.POSITIVE_INFINITY, 0])).toBeNull();
  });
});

describe("parity with the Python training side", () => {
  const rows = parity.rows;

  it("uses the model these coefficients were fitted on", () => {
    expect(parity.model).toBe("multilingual-e5-small");
    expect(parity.prefix).toBe("query: ");
    expect(rows.length).toBe(50);
  });

  it("agrees with numpy on the top-1 topic and emotion for every text", () => {
    const results = classifyVectors(rows.map((row) => decodeVector(row.vectorBase64)));
    const topicDisagreements: string[] = [];
    const emotionDisagreements: string[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const result = results[index];
      if (row === undefined || result == null) throw new Error(`row ${index} did not classify`);
      const topic = argmax(result.topicProbabilities);
      const emotion = argmax(result.emotionProbabilities);
      if (topic !== row.topicTop1) {
        topicDisagreements.push(
          `[${index}] "${row.text.slice(0, 24)}" py=${TOPIC_LEAVES[row.topicTop1]} ts=${TOPIC_LEAVES[topic]}`,
        );
      }
      if (emotion !== row.emotionTop1) {
        emotionDisagreements.push(
          `[${index}] "${row.text.slice(0, 24)}" py=${EMOTION_NAMES[row.emotionTop1]} ts=${EMOTION_NAMES[emotion]}`,
        );
      }
    }
    // Listed rather than counted: a disagreement is a fact about a specific text, and the
    // 98% floor exists for float-ordering ties, not for a systematic difference.
    expect(topicDisagreements).toEqual([]);
    expect(emotionDisagreements).toEqual([]);
  });

  it("agrees on the probabilities themselves, not only on the argmax", () => {
    const results = classifyVectors(rows.map((row) => decodeVector(row.vectorBase64)));
    let worstTopic = 0;
    let worstEmotion = 0;
    let worstValence = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const result = results[index];
      if (row === undefined || result == null) throw new Error(`row ${index} did not classify`);
      for (let klass = 0; klass < row.topics.length; klass += 1) {
        worstTopic = Math.max(
          worstTopic,
          Math.abs((result.topicProbabilities[klass] ?? 0) - (row.topics[klass] ?? 0)),
        );
      }
      for (let klass = 0; klass < row.emotions.length; klass += 1) {
        worstEmotion = Math.max(
          worstEmotion,
          Math.abs((result.emotionProbabilities[klass] ?? 0) - (row.emotions[klass] ?? 0)),
        );
      }
      // Valence is the one number the panels actually plot, and ./events owns the weighted
      // sum for both layers — so it is checked through that, not recomputed here.
      const { valence } = classificationOf({ ...result, classifier: "embedding" });
      worstValence = Math.max(worstValence, Math.abs((valence ?? 0) - row.valence));
    }
    expect(worstTopic).toBeLessThan(1e-6);
    expect(worstEmotion).toBeLessThan(1e-6);
    expect(worstValence).toBeLessThan(1e-6);
  });

  it("still returns a valid distribution for empty, blank, symbol-only and huge texts", () => {
    const awkward = rows.filter(
      (row) =>
        row.text.trim() === "" ||
        row.text.length > MAX_CLASSIFY_CHARS - 1 ||
        /^[^\p{L}\p{N}]+$/u.test(row.text),
    );
    expect(awkward.length).toBeGreaterThanOrEqual(4);
    for (const row of awkward) {
      const [result] = classifyVectors([decodeVector(row.vectorBase64)]);
      expect(result).not.toBeNull();
      expect(sum(result?.topicProbabilities ?? [])).toBeCloseTo(1, 6);
      expect(sum(result?.emotionProbabilities ?? [])).toBeCloseTo(1, 6);
      expect((result?.topicProbabilities ?? []).every((p) => p >= 0)).toBe(true);
    }
  });
});

describe("classifyTexts", () => {
  const vector = decodeVector(parity.rows[0]?.vectorBase64 ?? "");

  it("returns [] without calling the embedder for no texts", async () => {
    let calls = 0;
    const result = await classifyTexts(async () => {
      calls += 1;
      return [];
    }, []);
    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });

  it("falls through with null when embeddings are unavailable", async () => {
    expect(await classifyTexts(async () => null, ["深度学习"])).toBeNull();
  });

  it("falls through with null when the embedder returns the wrong number of vectors", async () => {
    expect(await classifyTexts(async () => [vector], ["一", "二"])).toBeNull();
  });

  it("truncates a text to what the embedder will accept", async () => {
    let seen = "";
    await classifyTexts(
      async (texts) => {
        seen = texts[0] ?? "";
        return [vector];
      },
      ["长".repeat(MAX_CLASSIFY_CHARS + 500)],
    );
    expect(seen.length).toBe(MAX_CLASSIFY_CHARS);
  });

  it("yields one null per unusable vector without losing the rest of the batch", async () => {
    const result = await classifyTexts(async () => [[1, 2, 3], vector], ["坏的", "好的"]);
    expect(result?.[0]).toBeNull();
    expect(result?.[1]).not.toBeNull();
  });
});
