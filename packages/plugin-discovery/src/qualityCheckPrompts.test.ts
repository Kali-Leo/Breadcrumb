/**
 * Purpose: unit tests for the batch quality-check contract — qualityCheckResponseSchema's
 * range/shape boundaries (out-of-range substance rejected, a short or partial score list
 * tolerated) and buildQualityCheckMessages' prompt assembly (batch cap, missing summary,
 * clipping, content-neutral instructions).
 */
import { describe, expect, it } from "vitest";
import {
  buildQualityCheckMessages,
  QUALITY_CHECK_BATCH_CAP,
  type QualityCheckItem,
  qualityCheckResponseSchema,
} from "./qualityCheckPrompts";

function item(index: number, overrides: Partial<QualityCheckItem> = {}): QualityCheckItem {
  return {
    id: `item-${index}`,
    title: `标题${index}`,
    summary: `摘要${index}`,
    ...overrides,
  };
}

describe("qualityCheckResponseSchema", () => {
  it("accepts scores at both ends of the range", () => {
    const parsed = qualityCheckResponseSchema.parse({
      scores: [
        { id: "a", substance: 0 },
        { id: "b", substance: 1 },
        { id: "c", substance: 0.37 },
      ],
    });
    expect(parsed.scores).toHaveLength(3);
  });

  it("accepts an empty score list (the model rated nothing)", () => {
    expect(qualityCheckResponseSchema.parse({ scores: [] }).scores).toEqual([]);
  });

  it("tolerates fewer scores than items were sent — missing ids are simply unrated", () => {
    const parsed = qualityCheckResponseSchema.parse({ scores: [{ id: "b", substance: 0.5 }] });
    expect(parsed.scores[0]?.id).toBe("b");
  });

  it("rejects a substance above 1", () => {
    expect(() =>
      qualityCheckResponseSchema.parse({ scores: [{ id: "a", substance: 1.2 }] }),
    ).toThrow();
  });

  it("rejects a negative substance", () => {
    expect(() =>
      qualityCheckResponseSchema.parse({ scores: [{ id: "a", substance: -0.1 }] }),
    ).toThrow();
  });

  it("rejects a non-numeric substance", () => {
    expect(() =>
      qualityCheckResponseSchema.parse({ scores: [{ id: "a", substance: "0.5" }] }),
    ).toThrow();
  });

  it("rejects a blank id", () => {
    expect(() =>
      qualityCheckResponseSchema.parse({ scores: [{ id: "   ", substance: 0.5 }] }),
    ).toThrow();
  });

  it("rejects a missing scores field", () => {
    expect(() => qualityCheckResponseSchema.parse({})).toThrow();
  });

  it("rejects more scores than one batch can hold", () => {
    const scores = Array.from({ length: QUALITY_CHECK_BATCH_CAP + 1 }, (_, i) => ({
      id: `x${i}`,
      substance: 0.5,
    }));
    expect(() => qualityCheckResponseSchema.parse({ scores })).toThrow();
  });
});

describe("buildQualityCheckMessages", () => {
  it("returns a system + user message pair", () => {
    const messages = buildQualityCheckMessages([item(1)]);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
  });

  it("demands strict JSON with an id and a 0-1 substance", () => {
    const system = buildQualityCheckMessages([item(1)])[0]?.content ?? "";
    expect(system).toContain("JSON");
    expect(system).toContain("substance");
    expect(system).toContain("0 到 1");
  });

  it("tells the model to ignore topic, stance and language", () => {
    const system = buildQualityCheckMessages([item(1)])[0]?.content ?? "";
    expect(system).toContain("不判断题材、立场");
    expect(system).toContain("语言本身不影响分数");
  });

  it("lists every item's id, title and summary", () => {
    const user = buildQualityCheckMessages([item(1), item(2)])[1]?.content ?? "";
    expect(user).toContain("item-1");
    expect(user).toContain("标题1");
    expect(user).toContain("摘要1");
    expect(user).toContain("item-2");
  });

  it("keeps English items verbatim (feeds are multilingual)", () => {
    const user =
      buildQualityCheckMessages([
        item(1, { title: "How the Suez Canal works", summary: "A ship, a lock, a bill." }),
      ])[1]?.content ?? "";
    expect(user).toContain("How the Suez Canal works");
    expect(user).toContain("A ship, a lock, a bill.");
  });

  it("marks a blank summary instead of sending an empty line", () => {
    const user = buildQualityCheckMessages([item(1, { summary: "   " })])[1]?.content ?? "";
    expect(user).toContain("（无摘要）");
  });

  it("clips an overlong summary", () => {
    const user =
      buildQualityCheckMessages([item(1, { summary: "长".repeat(1000) })])[1]?.content ?? "";
    expect(user).toContain("…");
    expect(user.length).toBeLessThan(900);
  });

  it("sends at most one batch's worth of items and says how many", () => {
    const items = Array.from({ length: QUALITY_CHECK_BATCH_CAP + 5 }, (_, i) => item(i));
    const user = buildQualityCheckMessages(items)[1]?.content ?? "";
    expect(user).toContain(`以下是 ${QUALITY_CHECK_BATCH_CAP} 个条目`);
    expect(user).toContain(`item-${QUALITY_CHECK_BATCH_CAP - 1}`);
    expect(user).not.toContain(`item-${QUALITY_CHECK_BATCH_CAP}`);
  });

  it("handles an empty batch without throwing", () => {
    const user = buildQualityCheckMessages([])[1]?.content ?? "";
    expect(user).toContain("以下是 0 个条目");
  });
});
