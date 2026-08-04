/**
 * Purpose: tests for the pure visual-style resolvers behind GoalOverlayView's painters (spec 017
 * #2, ADR-0013) — which layers a node paints (ghost-only vs ghost+owned) and whether an edge
 * renders ghosted or solid, without touching a canvas.
 */
import { describe, expect, it } from "vitest";
import type { OverlayEdge } from "./overlayModel";
import { resolveEdgeVisual, resolveNodeVisual } from "./overlayVisualStyle";

describe("resolveNodeVisual", () => {
  it("target nodes are ghost-only — no owned layer", () => {
    const visual = resolveNodeVisual({ label: "Alpha", state: "target" });
    expect(visual.owned).toBeNull();
    expect(visual.ghost).not.toBeNull();
  });

  it("lit nodes get a fully opaque owned layer", () => {
    const visual = resolveNodeVisual({ label: "Alpha", state: "lit" });
    expect(visual.owned?.alpha).toBe(1);
  });

  it("dim nodes get a faded owned layer (partial ownership)", () => {
    const visual = resolveNodeVisual({ label: "Alpha", state: "dim" });
    expect(visual.owned?.alpha).toBeGreaterThan(0);
    expect(visual.owned?.alpha).toBeLessThan(1);
  });

  it("ghost and owned radii match — the two layers align on the same circle", () => {
    const visual = resolveNodeVisual({ label: "Beta", state: "lit" });
    expect(visual.owned?.radius).toBe(visual.ghost.radius);
  });
});

describe("resolveEdgeVisual", () => {
  const requires: OverlayEdge = { source: "a", target: "b", type: "requires", weight: 1 };
  const helps: OverlayEdge = { source: "a", target: "b", type: "helps", weight: 0.5 };

  it("requires edge is ghosted unless both endpoints are owned", () => {
    const bothTarget = resolveEdgeVisual(requires, "target", "target");
    const oneOwned = resolveEdgeVisual(requires, "lit", "target");
    const bothOwned = resolveEdgeVisual(requires, "lit", "dim");
    expect(bothTarget.color).not.toBe(bothOwned.color);
    expect(oneOwned.color).toBe(bothTarget.color);
    expect(bothOwned.arrow).toBe(true);
  });

  it("requires edges always carry an arrowhead; helps edges never do", () => {
    expect(resolveEdgeVisual(requires, "lit", "lit").arrow).toBe(true);
    expect(resolveEdgeVisual(helps, "lit", "lit").arrow).toBe(false);
  });

  it("helps edge keeps its hue (amber-200) in both ghost and solid states, only alpha changes", () => {
    const ghosted = resolveEdgeVisual(helps, "target", "target");
    const solid = resolveEdgeVisual(helps, "lit", "dim");
    expect(ghosted.color).toContain("253, 230, 138");
    expect(solid.color).toContain("253, 230, 138");
    expect(ghosted.color).not.toBe(solid.color);
  });

  it("helps edge width grows with weight", () => {
    const light = resolveEdgeVisual({ ...helps, weight: 0.1 }, "lit", "lit");
    const heavy = resolveEdgeVisual({ ...helps, weight: 1 }, "lit", "lit");
    expect(heavy.width).toBeGreaterThan(light.width);
  });
});
