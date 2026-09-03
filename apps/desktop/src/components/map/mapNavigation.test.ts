/**
 * Purpose: the two input grammars of the map's navigation — a click enters at once under a
 * mouse; under a finger a tap selects, the same tap again enters, open sea clears, and moving
 * the finger never retargets the selection. Pixi is stubbed to the two things the navigation
 * reads (the canvas rect and the world root's transform); the world is the real demo model.
 */
import { buildWorldModel } from "@breadcrumb/feature-map";
import type { Application, Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { demoKnowledgeNodes } from "./demoWorld";
import type { MapLevel } from "./levels";
import type { HoverInfo, HoverResult } from "./mapHover";
import { createMapNavigation } from "./mapNavigation";

const world = buildWorldModel(demoKnowledgeNodes);
const island = world.islands[0];
if (island === undefined) throw new Error("demo world has no island");
const kingdom = island.kingdoms[0];
if (kingdom === undefined) throw new Error("demo island has no kingdom");

function harness(mode: "coarse" | "fine", startLevel: MapLevel = { kind: "world" }) {
  let level = startLevel;
  let hover: HoverInfo | null = null;
  const goToLevel = vi.fn((next: MapLevel) => {
    level = next;
  });
  const enterKingdom = vi.fn();
  const showHover = vi.fn((next: HoverResult | null) => {
    hover = next === null ? null : next.info;
  });
  const navigation = createMapNavigation({
    app: {
      canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    } as unknown as Application,
    worldRoot: { position: { x: 0, y: 0 }, scale: { x: 1 } } as unknown as Container,
    getWorld: () => world,
    getLevel: () => level,
    goToLevel,
    enterKingdom,
    showHover,
    currentHover: () => hover,
    getInputMode: () => mode,
  });
  const click = (x: number, y: number) =>
    navigation.onClick({ clientX: x, clientY: y } as MouseEvent);
  const move = (x: number, y: number) =>
    navigation.onPointerMove({ clientX: x, clientY: y } as PointerEvent);
  return { navigation, goToLevel, enterKingdom, showHover, click, move, hover: () => hover };
}

const sea = { x: -100_000, y: -100_000 };

describe("mouse", () => {
  it("enters an island on a single click and never selects", () => {
    const h = harness("fine");
    h.click(island.center.x, island.center.y);
    expect(h.goToLevel).toHaveBeenCalledWith({ kind: "island", islandId: island.nodeId });
    expect(h.showHover).not.toHaveBeenCalled();
  });

  it("opens a kingdom's subway map on a click at the island level", () => {
    const h = harness("fine", { kind: "island", islandId: island.nodeId });
    h.click(kingdom.labelPosition.x, kingdom.labelPosition.y);
    expect(h.enterKingdom).toHaveBeenCalledWith(kingdom.nodeId);
  });

  it("tracks hover from pointer movement", () => {
    const h = harness("fine");
    h.move(island.center.x, island.center.y);
    expect(h.hover()?.nodeId).toBe(island.nodeId);
  });
});

describe("finger", () => {
  it("selects on the first tap, enters on the second, clears on open sea", () => {
    const h = harness("coarse");
    h.click(island.center.x, island.center.y);
    expect(h.goToLevel).not.toHaveBeenCalled();
    expect(h.hover()?.nodeId).toBe(island.nodeId);
    h.click(sea.x, sea.y);
    expect(h.hover()).toBeNull();
    h.click(island.center.x, island.center.y);
    h.click(island.center.x, island.center.y);
    expect(h.goToLevel).toHaveBeenCalledWith({ kind: "island", islandId: island.nodeId });
  });

  it("does the same two-step for a kingdom at the island level", () => {
    const h = harness("coarse", { kind: "island", islandId: island.nodeId });
    h.click(kingdom.labelPosition.x, kingdom.labelPosition.y);
    expect(h.enterKingdom).not.toHaveBeenCalled();
    expect(h.hover()?.kind).toBe("kingdom");
    h.click(kingdom.labelPosition.x, kingdom.labelPosition.y);
    expect(h.enterKingdom).toHaveBeenCalledWith(kingdom.nodeId);
  });

  it("ignores pointer movement so a drag never retargets the selection", () => {
    const h = harness("coarse");
    h.click(island.center.x, island.center.y);
    h.move(sea.x, sea.y);
    expect(h.hover()?.nodeId).toBe(island.nodeId);
  });

  it("a pinch open enters what is under the fingers, else the selection", () => {
    const h = harness("coarse");
    h.navigation.enterAt(sea.x, sea.y);
    expect(h.goToLevel).not.toHaveBeenCalled();
    h.click(island.center.x, island.center.y);
    h.navigation.enterAt(sea.x, sea.y);
    expect(h.goToLevel).toHaveBeenCalledWith({ kind: "island", islandId: island.nodeId });
  });

  it("back leaves an island and is a no-op on the world", () => {
    const h = harness("coarse", { kind: "island", islandId: island.nodeId });
    h.navigation.back();
    expect(h.goToLevel).toHaveBeenCalledWith({ kind: "world" });
    h.navigation.back();
    expect(h.goToLevel).toHaveBeenCalledTimes(1);
  });
});
