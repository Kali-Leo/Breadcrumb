import { describe, expect, it } from "vitest";
import { bestTopicSimilarity, TOPIC_KEEP_THRESHOLD, topicStillCovered } from "./topicDrift";

/** A unit vector at `angle` radians in the first two dimensions — cosine between two of them
 * is the cosine of the angle between them, so a test can name the similarity it wants. */
function atAngle(angle: number): number[] {
  return [Math.cos(angle), Math.sin(angle), 0];
}

const SAME_TOPIC = atAngle(Math.acos(0.95));
const OFF_TOPIC = atAngle(Math.acos(0.4));

describe("topicStillCovered", () => {
  const passages = [atAngle(0)];

  it("keeps the passages when the follow-up is about the same thing", () => {
    expect(topicStillCovered(SAME_TOPIC, passages)).toBe(true);
  });

  it("asks for new ones when the question has moved", () => {
    expect(topicStillCovered(OFF_TOPIC, passages)).toBe(false);
  });

  it("re-fetches rather than guessing when there is no embedder", () => {
    expect(topicStillCovered(null, passages)).toBe(false);
  });

  it("re-fetches when there are no passages yet", () => {
    expect(topicStillCovered(SAME_TOPIC, [])).toBe(false);
  });

  it("takes the closest passage, not the average one", () => {
    expect(bestTopicSimilarity(SAME_TOPIC, [OFF_TOPIC, atAngle(0)])).toBeGreaterThan(
      TOPIC_KEEP_THRESHOLD,
    );
  });

  it("honours a caller-supplied threshold", () => {
    expect(topicStillCovered(OFF_TOPIC, passages, 0.3)).toBe(true);
  });
});
