/**
 * Purpose: unit tests for the continent naming schema — a praise/rank/digit-bearing name
 * must never survive Zod parsing, not just fail a manual post-check.
 */
import { describe, expect, it } from "vitest";
import { continentNamingSchema, isPlainContinentName } from "./continentNaming";

describe("continentNamingSchema", () => {
  it("accepts a plain, appropriately sized name", () => {
    const result = continentNamingSchema.safeParse({
      clusters: [{ id: "c0", name: "有机化学" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a name containing digits", () => {
    const result = continentNamingSchema.safeParse({
      clusters: [{ id: "c0", name: "第1名区域" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a name shorter than the minimum length", () => {
    const result = continentNamingSchema.safeParse({
      clusters: [{ id: "c0", name: "光" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a name longer than the maximum length", () => {
    const result = continentNamingSchema.safeParse({
      clusters: [{ id: "c0", name: "一二三四五六七八九十十一十二十三" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects the whole batch when only one cluster's name is unusable", () => {
    const result = continentNamingSchema.safeParse({
      clusters: [
        { id: "c0", name: "有机化学" },
        { id: "c1", name: "第1名" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("agrees with isPlainContinentName on acceptance (schema folds the same invariant)", () => {
    const name = "细胞生物学";
    expect(isPlainContinentName(name)).toBe(true);
    expect(continentNamingSchema.safeParse({ clusters: [{ id: "c0", name }] }).success).toBe(true);
  });
});
