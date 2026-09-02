/**
 * Purpose: the JSON-column boundary must never throw and must never let a bad shape through —
 * malformed JSON, the wrong shape, and NaN/Infinity inside a vector all have to come back as
 * null so callers can skip that one row. Also pins parseVectorRows's dimension rule, which is
 * what keeps a half-re-embedded tree from producing meaningless cosines.
 */
import { describe, expect, it } from "vitest";
import {
  FsrsStabilitySchema,
  NodeIdsJsonSchema,
  parseJsonColumn,
  parseVectorColumn,
  parseVectorRows,
  StringListJsonSchema,
  VectorJsonSchema,
} from "./jsonColumns";

describe("parseJsonColumn", () => {
  it("returns the parsed value for a column that matches the schema", () => {
    expect(parseJsonColumn(NodeIdsJsonSchema, '["n1","n2"]')).toEqual(["n1", "n2"]);
    expect(parseJsonColumn(StringListJsonSchema, "[]")).toEqual([]);
  });

  it("returns null for malformed JSON instead of throwing", () => {
    expect(parseJsonColumn(NodeIdsJsonSchema, "")).toBeNull();
    expect(parseJsonColumn(NodeIdsJsonSchema, "{oops")).toBeNull();
    expect(parseJsonColumn(NodeIdsJsonSchema, '["n1",')).toBeNull();
  });

  it("returns null for well-formed JSON of the wrong shape", () => {
    expect(parseJsonColumn(NodeIdsJsonSchema, '{"ids":["n1"]}')).toBeNull();
    expect(parseJsonColumn(NodeIdsJsonSchema, "[1,2,3]")).toBeNull();
    expect(parseJsonColumn(NodeIdsJsonSchema, "null")).toBeNull();
    // An empty id is not a node id — half a list is worse than none.
    expect(parseJsonColumn(NodeIdsJsonSchema, '["n1",""]')).toBeNull();
    expect(parseJsonColumn(StringListJsonSchema, '["ok",7]')).toBeNull();
  });

  it("reads just the stability out of a serialized FSRS card, keeping the rest", () => {
    const parsed = parseJsonColumn(FsrsStabilitySchema, '{"stability":31.5,"reps":4}');
    expect(parsed?.stability).toBe(31.5);
    expect(parseJsonColumn(FsrsStabilitySchema, '{"reps":4}')).toBeNull();
  });
});

describe("VectorJsonSchema / parseVectorColumn", () => {
  it("accepts a plain number array", () => {
    expect(parseVectorColumn("[0.5,-0.25,0]")).toEqual([0.5, -0.25, 0]);
  });

  it("rejects a vector carrying NaN or Infinity", () => {
    // JSON has no NaN literal, so a corrupt writer lands it as null or a string.
    expect(parseVectorColumn("[0.5,null]")).toBeNull();
    expect(parseVectorColumn('[0.5,"NaN"]')).toBeNull();
    expect(VectorJsonSchema.safeParse([1, Number.NaN]).success).toBe(false);
    expect(VectorJsonSchema.safeParse([1, Number.POSITIVE_INFINITY]).success).toBe(false);
  });

  it("rejects a vector that is not an array of numbers", () => {
    expect(parseVectorColumn('{"0":1}')).toBeNull();
    expect(parseVectorColumn("nope")).toBeNull();
  });
});

describe("parseVectorRows", () => {
  const rows = [
    { node_id: "a", vector_json: "[1,0]" },
    { node_id: "b", vector_json: "[0,1]" },
    { node_id: "c", vector_json: "[1,1]" },
  ];

  it("keys the vectors by the caller's key and preserves row order", () => {
    expect([...parseVectorRows(rows, (row) => row.node_id).keys()]).toEqual(["a", "b", "c"]);
  });

  it("skips only the unreadable rows, never the batch", () => {
    const withBadRows = [
      rows[0] as { node_id: string; vector_json: string },
      { node_id: "broken", vector_json: "{{{" },
      { node_id: "nan", vector_json: "[1,null]" },
      { node_id: "empty", vector_json: "[]" },
      rows[1] as { node_id: string; vector_json: string },
    ];
    const parsed = parseVectorRows(withBadRows, (row) => row.node_id);
    expect([...parsed.keys()]).toEqual(["a", "b"]);
  });

  it("drops rows whose dimensionality disagrees with the batch majority", () => {
    const mixed = [
      { node_id: "stale", vector_json: "[1,2,3]" },
      ...rows, // three 2-dimension rows outvote the one 3-dimension leftover
    ];
    const parsed = parseVectorRows(mixed, (row) => row.node_id);
    expect([...parsed.keys()]).toEqual(["a", "b", "c"]);
  });

  it("returns an empty map when every row is unreadable", () => {
    expect(parseVectorRows([{ node_id: "x", vector_json: "oops" }], (r) => r.node_id).size).toBe(0);
  });
});
