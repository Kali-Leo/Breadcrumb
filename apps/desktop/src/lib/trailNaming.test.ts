/**
 * Purpose: unit tests for the zero-LLM trail-naming pure functions (spec 041 §1) —
 * "first -> last" auto naming at 0/1/2+ stations with truncation, first-touch station dedup
 * order, the rename-freezes-forever decision, and the display fallback.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  computeAutoTitle,
  computeInitialTitle,
  displayTrailTitle,
  shouldWriteAutoTitle,
  stationLabelsFromSightings,
} from "./trailNaming";

function sighting(
  nodeId: string,
  createdAt: string,
  id = `s-${nodeId}-${createdAt}`,
): NodeSightingRow {
  return {
    id,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
  };
}

describe("computeInitialTitle", () => {
  it("returns short content unchanged", () => {
    expect(computeInitialTitle("闭包是什么")).toBe("闭包是什么");
  });

  it("truncates content past 20 chars with an ellipsis", () => {
    const long = "一二三四五六七八九十一二三四五六七八九十还有更多字符在后面";
    expect(computeInitialTitle(long)).toBe(`${long.slice(0, 20)}…`);
  });
});

describe("computeAutoTitle", () => {
  it("returns null for zero stations", () => {
    expect(computeAutoTitle([])).toBeNull();
  });

  it("brackets a single station", () => {
    expect(computeAutoTitle(["闭包"])).toBe("「闭包」");
  });

  it("arrows first to last for two or more stations, ignoring the middle", () => {
    expect(computeAutoTitle(["闭包", "作用域链", "事件循环"])).toBe("闭包 → 事件循环");
  });

  it("truncates each label to 8 chars", () => {
    expect(computeAutoTitle(["引力透镜的多重成像效应", "视差测距法的基线原理"])).toBe(
      "引力透镜的多重成… → 视差测距法的基线…",
    );
  });
});

describe("stationLabelsFromSightings", () => {
  const labelsByNode = new Map([
    ["n1", "递归"],
    ["n2", "闭包"],
    ["n3", "作用域链"],
  ]);

  it("dedupes by node, keeping first-touch order regardless of input order", () => {
    const sightings = [
      sighting("n2", "2026-08-13T10:01:00.000Z"),
      sighting("n1", "2026-08-13T10:00:00.000Z"),
      sighting("n1", "2026-08-13T10:02:00.000Z"),
      sighting("n3", "2026-08-13T10:03:00.000Z"),
    ];
    expect(stationLabelsFromSightings(sightings, labelsByNode)).toEqual([
      "递归",
      "闭包",
      "作用域链",
    ]);
  });

  it("skips sightings for nodes with no known label", () => {
    const sightings = [sighting("missing", "2026-08-13T10:00:00.000Z")];
    expect(stationLabelsFromSightings(sightings, labelsByNode)).toEqual([]);
  });
});

describe("shouldWriteAutoTitle", () => {
  it("writes when auto_title is already system-owned (non-null)", () => {
    expect(shouldWriteAutoTitle({ title: "随便改的名字", auto_title: "闭包" }, "闭包是什么")).toBe(
      true,
    );
  });

  it("writes when auto_title is still null and title matches the untouched initial title", () => {
    expect(shouldWriteAutoTitle({ title: "闭包是什么", auto_title: null }, "闭包是什么")).toBe(
      true,
    );
  });

  it("refuses once a user rename has replaced the initial title (frozen)", () => {
    expect(shouldWriteAutoTitle({ title: "我的闭包笔记", auto_title: null }, "闭包是什么")).toBe(
      false,
    );
  });
});

describe("displayTrailTitle", () => {
  it("prefers auto_title when present", () => {
    expect(displayTrailTitle({ title: "原始标题", auto_title: "闭包 → 事件循环" })).toBe(
      "闭包 → 事件循环",
    );
  });

  it("falls back to title when auto_title is null", () => {
    expect(displayTrailTitle({ title: "原始标题", auto_title: null })).toBe("原始标题");
  });
});
