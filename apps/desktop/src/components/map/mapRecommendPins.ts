/**
 * Purpose: the recommendation pins riding above the map's bands — one pin over the label of
 * every place that holds a visible recommendation on the current level (spec 048 follow-up +
 * spec 060 §2, Leo: pins on every zoom level). One pin per place, however many candidates it
 * holds; markers counter-scale in the controller's tick so they keep their on-screen size
 * like the names do.
 * Main exports: RecommendTarget, drawRecommendMarkers.
 *
 * Directory note: the non-component .ts files in components/map/ are the Pixi rendering
 * layer and belong to the view layer; logic with no DOM or Pixi lives in lib/.
 */
import { Container, Graphics } from "pixi.js";
import type { MapLevel } from "./levels";
import type { WorldScene } from "./sceneBuild";

export interface RecommendTarget {
  islandId: string;
  kingdomId: string | null;
}

/** Google Material Icons "place" (Apache-2.0) — the classic upside-down teardrop with a
 * hole (Leo 2026-08-31: 经典的地图选点标). Official asset used verbatim per the art
 * discipline's "官方资产直用" rule; only fill/stroke colors are ours (the map's amber
 * accent). 24×24 viewBox, tip at (12, ~21.5). */
const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
  '<path fill="#f59e0b" stroke="#92400e" stroke-width="1" d="M12 2C8.13 2 5 5.13 5 8.5c0 ' +
  "5.25 7 13 7 13s7-7.75 7-13C19 5.13 15.87 2 12 2zm0 9.5c-1.66 0-3-1.34-3-3s1.34-3 3-3 " +
  '3 1.34 3 3-1.34 3-3 3z"/></svg>';

export function drawRecommendMarkers(
  recommendLayer: Container,
  scene: WorldScene | null,
  level: MapLevel,
  recommendTargets: readonly RecommendTarget[],
): void {
  for (const child of recommendLayer.removeChildren()) child.destroy({ children: true });
  if (scene === null || recommendTargets.length === 0) return;
  const targetNodeIds = new Set<string>();
  for (const target of recommendTargets) {
    const nodeId =
      level.kind === "world"
        ? target.islandId
        : level.islandId === target.islandId
          ? target.kingdomId
          : null;
    if (nodeId !== null) targetNodeIds.add(nodeId);
  }
  for (const targetNodeId of targetNodeIds) {
    const label = scene.labels.find((candidate) => candidate.nodeId === targetNodeId);
    if (label === undefined) continue;
    const marker = new Container();
    marker.position.set(label.text.x, label.text.y - 10);
    const pin = new Graphics().svg(PIN_SVG);
    // Tip of the teardrop sits on the container origin, pointing at the place name.
    pin.position.set(-12, -21.5);
    marker.addChild(pin);
    recommendLayer.addChild(marker);
  }
}
