/**
 * Purpose: golden-sample tests for the symbolic atlas renderer, the empty-atlas fallback line,
 * and a pressure/praise blacklist gate over the rendered copy (spec 039 acceptance 9).
 */
import { describe, expect, it } from "vitest";
import type { ExplorationAtlas } from "./atlas";
import { renderAtlasText } from "./atlasText";

/** Product principle 1: no praise, no performed warmth, no pressure — and spec 039 explicitly
 * bans judgmental detour language ("走错"/"浪费") in the atlas copy. */
const BANNED_WORDS = ["走错", "浪费", "加油", "真棒", "厉害", "不错哦", "继续努力"];

function emptyAtlas(): ExplorationAtlas {
  return { trail: [], structure: [], detours: [], unusedLinks: [], frontier: [], staleness: [] };
}

describe("renderAtlasText", () => {
  it("returns the plain fallback line for an empty atlas", () => {
    expect(renderAtlasText(emptyAtlas())).toBe("这次还没有留下足迹。");
  });

  it("renders a trail with direct edges as connectors, and a dot when there is no edge", () => {
    const atlas: ExplorationAtlas = {
      trail: [
        { nodeId: "A", label: "光合作用" },
        { nodeId: "B", label: "光反应" },
        { nodeId: "C", label: "暗反应" },
      ],
      structure: [
        {
          id: "e1",
          source_id: "A",
          target_id: "B",
          edge_type: "requires",
          weight: 1,
          confidence: 1,
          origin: "llm",
          created_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "e2",
          source_id: "B",
          target_id: "C",
          edge_type: "helps",
          weight: 1,
          confidence: 1,
          origin: "llm",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      detours: [],
      unusedLinks: [],
      frontier: [],
      staleness: [],
    };
    const text = renderAtlasText(atlas);
    expect(text).toContain("本次走过 3 站：");
    expect(text).toContain("● 光合作用 → ● 光反应 ⇢ ● 暗反应");
  });

  it("renders the backfill section with the plain 'met later' framing", () => {
    const atlas: ExplorationAtlas = {
      trail: [
        { nodeId: "B", label: "光反应" },
        { nodeId: "A", label: "光合作用" },
      ],
      structure: [],
      detours: [{ kind: "backfill", nodeId: "A", relatedNodeId: "B" }],
      unusedLinks: [],
      frontier: [],
      staleness: [],
    };
    const text = renderAtlasText(atlas);
    expect(text).toContain("回头补的前置：");
    expect(text).toContain("↩ 光合作用 ——你先遇到 光反应，后来回头补了它的前置 光合作用");
  });

  it("renders revisits as a single condensed line", () => {
    const atlas: ExplorationAtlas = {
      trail: [
        { nodeId: "A", label: "光合作用" },
        { nodeId: "B", label: "光反应" },
      ],
      structure: [],
      detours: [{ kind: "revisit", nodeId: "A", relatedNodeId: null }],
      unusedLinks: [],
      frontier: [],
      staleness: [],
    };
    const text = renderAtlasText(atlas);
    expect(text).toContain("走了回头路的站：● 光合作用");
  });

  it("renders unused links between visited nodes", () => {
    const atlas: ExplorationAtlas = {
      trail: [
        { nodeId: "A", label: "光合作用" },
        { nodeId: "B", label: "光反应" },
        { nodeId: "C", label: "暗反应" },
      ],
      structure: [
        {
          id: "e1",
          source_id: "A",
          target_id: "C",
          edge_type: "helps",
          weight: 1,
          confidence: 1,
          origin: "llm",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      detours: [],
      unusedLinks: [
        {
          id: "e1",
          source_id: "A",
          target_id: "C",
          edge_type: "helps",
          weight: 1,
          confidence: 1,
          origin: "llm",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      frontier: [],
      staleness: [],
    };
    const text = renderAtlasText(atlas);
    expect(text).toContain("没走的联结：");
    expect(text).toContain("● 光合作用 ⇢ ● 暗反应 ——这两站之间还有一条没走过的路");
  });

  it("renders frontier lines with direction semantics for both requires directions and helps", () => {
    const atlas: ExplorationAtlas = {
      trail: [{ nodeId: "A", label: "光合作用" }],
      structure: [],
      detours: [],
      unusedLinks: [],
      frontier: [
        {
          nodeId: "D",
          label: "叶绿体",
          viaNodeId: "A",
          edgeType: "requires",
          isPrerequisiteOfVisited: true,
        },
        {
          nodeId: "E",
          label: "类囊体",
          viaNodeId: "A",
          edgeType: "requires",
          isPrerequisiteOfVisited: false,
        },
        {
          nodeId: "F",
          label: "水",
          viaNodeId: "A",
          edgeType: "helps",
          isPrerequisiteOfVisited: false,
        },
      ],
      staleness: [],
    };
    const text = renderAtlasText(atlas);
    expect(text).toContain("相邻的未访之地：");
    expect(text).toContain("○ 叶绿体 ——它是你走过的 光合作用 的前置");
    expect(text).toContain("○ 类囊体 ——它的前置正是你走过的 光合作用");
    expect(text).toContain("○ 水 ——你走过的 光合作用 对它有帮助");
  });

  it("renders staleness as a header plus one bullet per node", () => {
    const atlas: ExplorationAtlas = {
      trail: [{ nodeId: "A", label: "光合作用" }],
      structure: [],
      detours: [],
      unusedLinks: [],
      frontier: [],
      staleness: [{ nodeId: "A", label: "光合作用" }],
    };
    const text = renderAtlasText(atlas);
    expect(text).toContain("生疏的老朋友：\n● 光合作用");
  });

  it("never uses judgmental or praise/pressure language in any section", () => {
    const atlas: ExplorationAtlas = {
      trail: [
        { nodeId: "A", label: "光合作用" },
        { nodeId: "B", label: "光反应" },
        { nodeId: "C", label: "暗反应" },
      ],
      structure: [],
      detours: [
        { kind: "backfill", nodeId: "A", relatedNodeId: "B" },
        { kind: "revisit", nodeId: "C", relatedNodeId: null },
      ],
      unusedLinks: [
        {
          id: "e1",
          source_id: "A",
          target_id: "C",
          edge_type: "requires",
          weight: 1,
          confidence: 1,
          origin: "llm",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      frontier: [
        {
          nodeId: "D",
          label: "叶绿体",
          viaNodeId: "A",
          edgeType: "requires",
          isPrerequisiteOfVisited: true,
        },
      ],
      staleness: [{ nodeId: "B", label: "光反应" }],
    };
    const text = renderAtlasText(atlas);
    for (const banned of BANNED_WORDS) {
      expect(text).not.toContain(banned);
    }
  });
});
