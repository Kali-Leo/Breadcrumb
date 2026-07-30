/**
 * Purpose: unit tests for the map engine — similarity, clustering, tiers, and
 * deterministic layout with related-near / unrelated-far geometry.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { clusterNodes } from "./clustering";
import { computeMapLayout, placeTier } from "./layout";
import { cosineSimilarity } from "./similarity";

function node(id: string, label: string): KnowledgeNodeRow {
  return {
    id,
    parent_id: null,
    label,
    summary: "s",
    created_at: `2026-07-29T00:00:0${id.length}Z`,
  };
}

describe("cosineSimilarity", () => {
  it("is 1 for identical vectors and 0 for orthogonal ones", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("clusterNodes", () => {
  it("groups similar vectors and separates dissimilar ones", () => {
    const clusters = clusterNodes(
      [
        { nodeId: "a", vector: [1, 0, 0] },
        { nodeId: "b", vector: [0.99, 0.1, 0] },
        { nodeId: "c", vector: [0, 0, 1] },
      ],
      0.9,
    );
    const sizes = clusters.map((cluster) => cluster.length).sort();
    expect(sizes).toEqual([1, 2]);
  });
});

describe("placeTier", () => {
  it("grows house -> village -> city with knowledge count", () => {
    expect(placeTier(1)).toBe("house");
    expect(placeTier(3)).toBe("village");
    expect(placeTier(8)).toBe("city");
  });
});

describe("computeMapLayout", () => {
  const nodes = [node("a", "闭包"), node("bb", "作用域"), node("ccc", "光合作用")];
  const embeddings = new Map<string, readonly number[]>([
    ["a", [1, 0, 0.05]],
    ["bb", [0.98, 0.12, 0]],
    ["ccc", [0, 0.05, 1]],
  ]);

  it("puts related knowledge in one place and unrelated across the sea", () => {
    const places = computeMapLayout(nodes, embeddings);
    expect(places).toHaveLength(2);
    const together = places.find((place) => place.nodeIds.length === 2);
    expect(together?.nodeIds.sort()).toEqual(["a", "bb"]);
  });

  it("is deterministic for identical input", () => {
    const first = computeMapLayout(nodes, embeddings);
    const second = computeMapLayout(nodes, embeddings);
    expect(second).toEqual(first);
  });

  it("names a place after its earliest-learned node", () => {
    const places = computeMapLayout(nodes, embeddings);
    const together = places.find((place) => place.nodeIds.length === 2);
    expect(together?.name).toBe("闭包");
  });

  it("skips nodes without embeddings instead of crashing", () => {
    const places = computeMapLayout([...nodes, node("dddd", "无向量")], embeddings);
    expect(places.flatMap((place) => place.nodeIds)).not.toContain("dddd");
  });
});

describe("computePlaceInternalLayout", () => {
  const embeddings = new Map<string, readonly number[]>([
    ["a", [1, 0]],
    ["b", [0.97, 0.2]],
    ["c", [0.2, 1]],
  ]);

  it("centers a lone member", async () => {
    const { computePlaceInternalLayout } = await import("./internalLayout");
    expect(computePlaceInternalLayout(["a"], embeddings, 40)).toEqual([
      { nodeId: "a", dx: 0, dy: 0 },
    ]);
  });

  it("keeps every member inside the disc and is deterministic", async () => {
    const { computePlaceInternalLayout } = await import("./internalLayout");
    const first = computePlaceInternalLayout(["a", "b", "c"], embeddings, 40);
    const second = computePlaceInternalLayout(["a", "b", "c"], embeddings, 40);
    expect(second).toEqual(first);
    for (const position of first) {
      expect(Math.hypot(position.dx, position.dy)).toBeLessThanOrEqual(40 * 1.35 + 1e-6);
    }
  });

  it("places similar members closer than dissimilar ones", async () => {
    const { computePlaceInternalLayout } = await import("./internalLayout");
    const positions = computePlaceInternalLayout(["a", "b", "c"], embeddings, 40);
    const byId = new Map(positions.map((position) => [position.nodeId, position]));
    const ab = Math.hypot(
      (byId.get("a")?.dx ?? 0) - (byId.get("b")?.dx ?? 0),
      (byId.get("a")?.dy ?? 0) - (byId.get("b")?.dy ?? 0),
    );
    const ac = Math.hypot(
      (byId.get("a")?.dx ?? 0) - (byId.get("c")?.dx ?? 0),
      (byId.get("a")?.dy ?? 0) - (byId.get("c")?.dy ?? 0),
    );
    expect(ab).toBeLessThan(ac);
  });
});

describe("computeLayeredMap", () => {
  const nodes = [node("a", "闭包"), node("bb", "作用域"), node("ccc", "光合作用")];
  const embeddings = new Map<string, readonly number[]>([
    ["a", [1, 0, 0.05]],
    ["bb", [0.98, 0.12, 0]],
    ["ccc", [0, 0.05, 1]],
  ]);

  it("keeps parents at the centroid of their children", async () => {
    const { computeLayeredMap } = await import("./hierarchy");
    const layered = computeLayeredMap(nodes, embeddings);
    for (const kingdom of layered.kingdom) {
      const children = layered.village.filter((v) =>
        v.nodeIds.some((id) => kingdom.nodeIds.includes(id)),
      );
      const cx = children.reduce((s, c) => s + c.x, 0) / children.length;
      expect(kingdom.x).toBeCloseTo(cx, 5);
    }
  });

  it("assigns scale slots by member count", async () => {
    const { computeLayeredMap } = await import("./hierarchy");
    const layered = computeLayeredMap(nodes, embeddings);
    for (const village of layered.village) {
      expect(["tier1", "tier2", "tier3", "tier4"]).toContain(village.scaleSlot);
    }
    for (const geo of layered.geo) {
      expect(geo.scaleSlot).toBe("island");
    }
  });

  it("total node coverage is identical across layers", async () => {
    const { computeLayeredMap } = await import("./hierarchy");
    const layered = computeLayeredMap(nodes, embeddings);
    const count = (clusters: { nodeIds: string[] }[]) =>
      clusters.reduce((s, c) => s + c.nodeIds.length, 0);
    expect(count(layered.kingdom)).toBe(count(layered.village));
    expect(count(layered.geo)).toBe(count(layered.village));
  });
});
