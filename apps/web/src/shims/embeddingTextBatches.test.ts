/**
 * Purpose: the two things the worker does to texts before the model sees them, checked
 * without a model — the E5 prefix the desktop build also adds, and the batch split.
 */
import { describe, expect, it } from "vitest";
import {
  MAX_TEXTS_PER_BATCH,
  prefixForE5,
  QUERY_PREFIX,
  splitIntoBatches,
} from "./embedding/textBatches";

describe("prefixForE5", () => {
  it("prepends the same task prefix the desktop build uses", () => {
    expect(QUERY_PREFIX).toBe("query: ");
    expect(prefixForE5("导数: 函数在一点的变化率")).toBe("query: 导数: 函数在一点的变化率");
  });

  it("does not double a prefix the caller already added", () => {
    // The caller never should; if one did, the vector would still differ from the desktop's.
    expect(prefixForE5("query: x")).toBe("query: query: x");
  });
});

describe("splitIntoBatches", () => {
  it("splits at the batch size and keeps order", () => {
    const items = Array.from({ length: 150 }, (_, i) => i);
    const batches = splitIntoBatches(items);
    expect(MAX_TEXTS_PER_BATCH).toBe(64);
    expect(batches.map((b) => b.length)).toEqual([64, 64, 22]);
    expect(batches.flat()).toEqual(items);
  });

  it("returns no batches for no items and one for a short list", () => {
    expect(splitIntoBatches([])).toEqual([]);
    expect(splitIntoBatches(["a", "b"])).toEqual([["a", "b"]]);
  });

  it("refuses a batch size below one", () => {
    expect(() => splitIntoBatches([1], 0)).toThrow(RangeError);
  });
});
