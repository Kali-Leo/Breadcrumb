/**
 * Purpose: unit tests for the trail card's read side — a blank row never reaches the card,
 * the window is asked for by date key, and "yesterday" is judged on the local calendar.
 */
import { describe, expect, it, vi } from "vitest";

const listSinceMock = vi.fn();
vi.mock("../platform/db", () => ({
  getRepos: vi.fn(async () => ({ trailSummaries: { listSince: listSinceMock } })),
}));

const { isYesterday, loadRecentTrailSummaries } = await import("./trailSummaryData");

const NOW = new Date(2026, 8, 2, 9, 0);

describe("loadRecentTrailSummaries", () => {
  it("drops a row whose sentence is blank and keeps the rest in the order given", async () => {
    listSinceMock.mockResolvedValue([
      { date: "2026-09-01", content: "   ", created_at: "t" },
      { date: "2026-08-31", content: "昨天你搞懂了闭包。", created_at: "t" },
    ]);
    const rows = await loadRecentTrailSummaries(NOW);
    expect(rows.map((row) => row.date)).toEqual(["2026-08-31"]);
  });

  it("asks for the last seven days by date key", async () => {
    listSinceMock.mockResolvedValue([]);
    await loadRecentTrailSummaries(NOW);
    expect(listSinceMock).toHaveBeenCalledWith("2026-08-26");
  });
});

describe("isYesterday", () => {
  it("is true only for the local calendar day before now", () => {
    expect(isYesterday("2026-09-01", NOW)).toBe(true);
    expect(isYesterday("2026-08-31", NOW)).toBe(false);
    expect(isYesterday("2026-09-02", NOW)).toBe(false);
  });
});
