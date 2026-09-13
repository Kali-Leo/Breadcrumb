/**
 * Purpose: the words a follow-up is repaired with. Getting these wrong is not a cosmetic
 * failure — pasting the wrong word onto an elliptical question sends the retrieval somewhere
 * else entirely, and the measurement says the first stage is where that damage is permanent.
 */
import { describe, expect, it } from "vitest";
import { topicEntities } from "./entities";
import type { TopicPassage } from "./passages";

function passage(index: number, text: string): TopicPassage {
  return {
    index,
    source: "wikipedia",
    title: `标题${index}`,
    url: `https://example.org/${index}`,
    text,
  };
}

const EVEREST: TopicPassage[] = [
  passage(1, "珠穆朗玛峰是世界最高峰，位于中国与尼泊尔边界。珠穆朗玛峰的高度为 8848.86 米。"),
  passage(2, "2020 年中国与尼泊尔联合公布了珠穆朗玛峰的新高度。测量使用了卫星定位。"),
  passage(3, "攀登珠穆朗玛峰的路线有两条，分别从尼泊尔一侧和中国一侧出发。"),
];

describe("topicEntities", () => {
  it("names the topic with the word every passage keeps coming back to", () => {
    expect(topicEntities(EVEREST)[0]).toBe("珠穆朗玛峰");
  });

  it("returns at most two, because a third outweighs the question itself", () => {
    expect(topicEntities(EVEREST).length).toBeLessThanOrEqual(2);
  });

  it("prefers the recurring name over a recurring short word", () => {
    const entities = topicEntities(EVEREST);
    expect(entities.indexOf("珠穆朗玛峰")).toBeLessThan(
      entities.includes("高度") ? entities.indexOf("高度") : entities.length,
    );
  });

  it("never offers a bare figure as the topic's name", () => {
    expect(topicEntities(EVEREST)).not.toContain("2020");
    expect(topicEntities(EVEREST)).not.toContain("8848");
  });

  it("has nothing to say about no material, rather than guessing", () => {
    expect(topicEntities([])).toEqual([]);
  });
});
