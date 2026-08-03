/**
 * Purpose: unit tests for shortenSegment / truncateLabel.
 */
import { describe, expect, it } from "vitest";
import { shortenSegment, truncateLabel } from "./overlayGeometry";

describe("shortenSegment", () => {
  it("moves both endpoints inward along the connecting line by their radius", () => {
    const result = shortenSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 20);
    expect(result.from).toEqual({ x: 10, y: 0 });
    expect(result.to).toEqual({ x: 80, y: 0 });
  });

  it("returns the original points unchanged when they coincide", () => {
    const point = { x: 5, y: 5 };
    const result = shortenSegment(point, point, 10, 10);
    expect(result.from).toEqual(point);
    expect(result.to).toEqual(point);
  });
});

describe("truncateLabel", () => {
  it("leaves short labels untouched", () => {
    expect(truncateLabel("导数", 8)).toBe("导数");
  });

  it("truncates long labels and appends an ellipsis, counting code points not bytes", () => {
    expect(truncateLabel("一二三四五六七八九十", 6)).toBe("一二三四五六…");
  });
});
