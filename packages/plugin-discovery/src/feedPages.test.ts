/**
 * Purpose: unit tests for assembleFeedPages — the quotas hold on the SECOND page as well as the
 * first (the whole point of paging the assembly), every page gets the dial's share of unexplored
 * territory, nothing is dropped or repeated, and a pool too narrow to fill a page under the caps
 * still fills it.
 */
import { describe, expect, it } from "vitest";
import { assembleFeedPages } from "./feedPages";
import type { MmrCandidate } from "./mmr";

function candidate(item: string, topicLabel: string, score: number): MmrCandidate<string> {
  return { item, score, embedding: null, topicLabel, sourceId: topicLabel, contentKind: "article" };
}

/** `count` candidates on one topic, scored high to low. */
function topicRun(topicLabel: string, count: number, baseScore = 1): MmrCandidate<string>[] {
  return Array.from({ length: count }, (_unused, index) =>
    candidate(`${topicLabel}${index}`, topicLabel, baseScore - index / 100),
  );
}

function topicOf(item: string): string {
  return item.replace(/\d+$/, "");
}

function pagesOf(items: readonly string[], pageSize: number): string[][] {
  const pages: string[][] = [];
  for (let start = 0; start < items.length; start += pageSize) {
    pages.push([...items.slice(start, start + pageSize)]);
  }
  return pages;
}

describe("assembleFeedPages", () => {
  it("holds the topic cap on every page, not only the first", () => {
    const familiar = [
      ...topicRun("alpha", 10, 1),
      ...topicRun("beta", 10, 0.9),
      ...topicRun("gamma", 10, 0.8),
    ];
    const ordered = assembleFeedPages(
      { familiar, unexplored: [] },
      { pageSize: 6, perTopicCap: 2, perSourceCap: 2, explorationShare: 0 },
    );
    for (const page of pagesOf(ordered, 6)) {
      if (page.length < 6) continue; // the last, short page has nothing left to spread
      const counts = new Map<string, number>();
      for (const item of page) counts.set(topicOf(item), (counts.get(topicOf(item)) ?? 0) + 1);
      expect(
        [...counts.values()].every((count) => count <= 2),
        page.join(","),
      ).toBe(true);
    }
  });

  it("keeps every candidate exactly once", () => {
    const familiar = [...topicRun("alpha", 7), ...topicRun("beta", 5)];
    const unexplored = topicRun("stranger", 4);
    const ordered = assembleFeedPages({ familiar, unexplored }, { pageSize: 5 });
    expect(ordered).toHaveLength(16);
    expect(new Set(ordered).size).toBe(16);
  });

  it("gives every page the dial's share of unexplored territory", () => {
    const familiar = topicRun("known", 40);
    const unexplored = [...topicRun("newA", 20, 0.1), ...topicRun("newB", 20, 0.1)];
    const modest = assembleFeedPages(
      { familiar, unexplored },
      { pageSize: 8, explorationShare: 0.25, perTopicCap: 8, perSourceCap: 8 },
    );
    const adventurous = assembleFeedPages(
      { familiar, unexplored },
      { pageSize: 8, explorationShare: 0.5, perTopicCap: 8, perSourceCap: 8 },
    );
    const strangersOn = (page: readonly string[]): number =>
      page.filter((item) => item.startsWith("new")).length;
    for (const page of pagesOf(modest, 8).slice(0, 4)) expect(strangersOn(page)).toBe(2);
    for (const page of pagesOf(adventurous, 8).slice(0, 4)) expect(strangersOn(page)).toBe(4);
  });

  it("fills a page from a pool too narrow to spread it, rather than showing a short page", () => {
    const familiar = [...topicRun("alpha", 6), ...topicRun("beta", 6)];
    const ordered = assembleFeedPages(
      { familiar, unexplored: [] },
      { pageSize: 8, perTopicCap: 2, perSourceCap: 2, explorationShare: 0 },
    );
    const [firstPage] = pagesOf(ordered, 8);
    expect(firstPage).toHaveLength(8);
    // Two topics, eight positions: the caps are applied twice over rather than one topic taking
    // the whole overflow in score order.
    const alphas = firstPage?.filter((item) => item.startsWith("alpha")).length ?? 0;
    expect(alphas).toBe(4);
  });

  it("hands the whole page to unexplored territory when there is nothing familiar", () => {
    const ordered = assembleFeedPages(
      { familiar: [], unexplored: topicRun("stranger", 5) },
      { pageSize: 4, perTopicCap: 4, perSourceCap: 4 },
    );
    expect(ordered).toHaveLength(5);
  });

  it("returns nothing for a page size of zero rather than looping", () => {
    expect(
      assembleFeedPages({ familiar: topicRun("a", 3), unexplored: [] }, { pageSize: 0 }),
    ).toEqual([]);
  });
});
