/**
 * Purpose: the batch split, checked without a model — plus the one thing the worker no longer
 * does to texts. The e5 model needed "query: " on every text; this one takes no prefix, and a
 * prefix left behind by habit would silently cost accuracy on every vector in the database.
 */

import { EMBEDDING_QUERY_PREFIX } from "@breadcrumb/core-vectors";
import { describe, expect, it } from "vitest";
import { MAX_TEXTS_PER_BATCH, splitIntoBatches } from "./embedding/textBatches";

describe("the task prefix", () => {
  it("is gone, because this model was not trained with one", async () => {
    const module: Record<string, unknown> = await import("./embedding/textBatches");
    expect(EMBEDDING_QUERY_PREFIX).toBe("");
    expect(module.prefixForE5).toBeUndefined();
    expect(module.QUERY_PREFIX).toBeUndefined();
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
