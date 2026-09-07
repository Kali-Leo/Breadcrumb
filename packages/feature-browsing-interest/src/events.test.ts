import { describe, expect, it } from "vitest";
import {
  browsingEventSchema,
  classificationOf,
  MAX_EVENT_AGE_SECONDS,
  MAX_EVENT_SKEW_SECONDS,
  normalizeEvent,
  trustedEventTime,
} from "./events";
import { EMOTION_VALENCES } from "./taxonomy";

const NOW = 1_800_000_000;

describe("browsingEventSchema", () => {
  it("accepts what a collector actually sends", () => {
    const parsed = browsingEventSchema.parse({
      type: "watch",
      id: "BV1xx411c7mD",
      t: "标题",
      u: "作者",
      pic: "https://example.invalid/a.jpg",
      dwell: 123.5,
      dur: 600,
      site: "bilibili",
      ts: NOW,
    });
    expect(parsed.type).toBe("watch");
    expect(parsed.dwell).toBe(123.5);
  });

  it("falls back to an exposure for an unknown event kind rather than rejecting the batch", () => {
    expect(browsingEventSchema.parse({ type: "like" }).type).toBe("expose");
  });

  it("reads missing and wrongly-typed fields as empty and zero", () => {
    const parsed = browsingEventSchema.parse({ t: 42, dwell: "90", dur: null });
    expect(parsed.t).toBe("");
    expect(parsed.dwell).toBe(90);
    expect(parsed.dur).toBe(0);
    expect(parsed.ts).toBeUndefined();
  });
});

describe("trustedEventTime", () => {
  it("keeps a plausible timestamp", () => {
    expect(trustedEventTime(NOW - 3600, NOW)).toBe(NOW - 3600);
  });

  it("absorbs small clock skew forward", () => {
    expect(trustedEventTime(NOW + MAX_EVENT_SKEW_SECONDS - 1, NOW)).toBe(
      NOW + MAX_EVENT_SKEW_SECONDS - 1,
    );
  });

  it("replaces a timestamp from the future — a fast clock must not fast-forward the decay", () => {
    expect(trustedEventTime(NOW + 365 * 86400, NOW)).toBe(NOW);
  });

  it("replaces a timestamp older than the trust window", () => {
    expect(trustedEventTime(NOW - MAX_EVENT_AGE_SECONDS - 1, NOW)).toBe(NOW);
  });

  it("takes an absent timestamp as now", () => {
    expect(trustedEventTime(undefined, NOW)).toBe(NOW);
  });
});

describe("classificationOf", () => {
  it("takes the top-1 topic and leaves emotion unknown when no emotion model ran", () => {
    const result = classificationOf({
      topicProbabilities: [0.1, 0.7, 0.2],
      classifier: "ngram",
    });
    expect(result).toEqual({ topic: 1, emo: null, valence: null });
  });

  it("weighs valence over the whole emotion distribution, not just the winner", () => {
    const emotions = new Array<number>(EMOTION_VALENCES.length).fill(0);
    emotions[0] = 0.6;
    emotions[EMOTION_VALENCES.length - 1] = 0.4;
    const result = classificationOf({
      topicProbabilities: [1],
      emotionProbabilities: emotions,
      classifier: "ngram",
    });
    expect(result.emo).toBe(0);
    const expected =
      0.6 * (EMOTION_VALENCES[0] ?? 0) + 0.4 * (EMOTION_VALENCES[EMOTION_VALENCES.length - 1] ?? 0);
    expect(result.valence).toBeCloseTo(expected, 12);
    // The winner's own valence would be a different, more confident-looking number.
    expect(result.valence).not.toBe(EMOTION_VALENCES[0]);
  });
});

describe("normalizeEvent", () => {
  const classification = { topicProbabilities: [0, 1], classifier: "ngram" };

  it("caps long strings by code point, so a cap never splits a character", () => {
    const row = normalizeEvent(
      browsingEventSchema.parse({ t: "🐱".repeat(200), u: "猫".repeat(80), id: "x".repeat(99) }),
      classification,
      NOW,
    );
    expect(Array.from(row.title)).toHaveLength(120);
    expect(row.title.endsWith("🐱")).toBe(true);
    expect(Array.from(row.up)).toHaveLength(40);
    expect(row.vid).toHaveLength(30);
  });

  it("names an unknown site rather than storing an empty one", () => {
    const row = normalizeEvent(browsingEventSchema.parse({}), classification, NOW);
    expect(row.site).toBe("?");
    expect(row.ts).toBe(NOW);
    expect(row.topic).toBe(1);
    expect(row.classifier).toBe("ngram");
  });
});
