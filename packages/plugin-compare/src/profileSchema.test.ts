/**
 * Purpose: unit tests for the profile definition contract (spec 023) — field boundaries,
 * mandatory sourceRef, and the structural forest checks (unique keys, existing parents,
 * cycles, roots).
 */
import { describe, expect, it } from "vitest";
import {
  findProfileStructureError,
  type ProfileDefinition,
  profileDefinitionSchema,
} from "./profileSchema";

function definition(items: ProfileDefinition["items"]): ProfileDefinition {
  return {
    id: "p1",
    title: "画像",
    description: "说明",
    sourceNote: "某真实资料，检索核实于 2026-08-09",
    items,
  };
}

const OK_ITEM = {
  key: "a",
  parentKey: null,
  label: "条目",
  aliases: [],
  sourceRef: "某资料 · 表1",
};

describe("profileDefinitionSchema", () => {
  it("accepts a minimal well-formed profile", () => {
    expect(profileDefinitionSchema.safeParse(definition([OK_ITEM])).success).toBe(true);
  });

  it("rejects an empty sourceRef — evidence is mandatory", () => {
    const bad = definition([{ ...OK_ITEM, sourceRef: "" }]);
    expect(profileDefinitionSchema.safeParse(bad).success).toBe(false);
  });
});

describe("findProfileStructureError", () => {
  it("returns null for a well-formed forest", () => {
    const ok = definition([
      OK_ITEM,
      { ...OK_ITEM, key: "b", parentKey: "a" },
      { ...OK_ITEM, key: "c", parentKey: "a" },
    ]);
    expect(findProfileStructureError(ok)).toBeNull();
  });

  it("flags duplicate keys", () => {
    const bad = definition([OK_ITEM, { ...OK_ITEM }]);
    expect(findProfileStructureError(bad)).toContain("duplicate");
  });

  it("flags missing parents", () => {
    const bad = definition([{ ...OK_ITEM, key: "b", parentKey: "ghost" }, OK_ITEM]);
    expect(findProfileStructureError(bad)).toContain("missing parent");
  });

  it("flags cycles", () => {
    const bad = definition([
      { ...OK_ITEM, key: "a", parentKey: "b" },
      { ...OK_ITEM, key: "b", parentKey: "a" },
      { ...OK_ITEM, key: "root", parentKey: null },
    ]);
    expect(findProfileStructureError(bad)).toContain("cycle");
  });

  it("flags a rootless profile", () => {
    const bad = definition([{ ...OK_ITEM, key: "a", parentKey: "a" }]);
    expect(findProfileStructureError(bad)).not.toBeNull();
  });
});
