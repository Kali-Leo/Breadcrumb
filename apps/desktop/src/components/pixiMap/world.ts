/**
 * Purpose: builds the living three-layer world inside the viewport — sprites per layer,
 * name labels, ink fade-in on birth, zoom-band cross-fading, memory dimming, and the
 * deepest-zoom knowledge labels used for anchoring.
 * Main exports: buildWorld, updateLayerFades, WorldHandles, LAYER_BANDS.
 */
import type { LayerCluster, LayeredMap } from "@breadcrumb/plugin-map";
import gsap from "gsap";
import { Container, Sprite, Text, type TextStyleOptions } from "pixi.js";
import { textureFor } from "./textures";

export interface WorldHandles {
  layers: Record<"geo" | "kingdom" | "village" | "nodes", Container>;
  villageSprites: Map<string, Sprite>;
}

/** Visibility bands: [fullyVisibleFrom, fullyVisibleTo] in viewport scale. */
export const LAYER_BANDS = {
  geo: { fadeInBelow: 0.5, fadeOutAbove: 0.75 },
  kingdom: { from: 0.55, to: 1.25 },
  village: { fadeInAbove: 1.0 },
  nodes: { fadeInAbove: 2.1 },
} as const;

const LABEL_STYLE: Partial<TextStyleOptions> = {
  fontFamily: '"Ma Shan Zheng", "KaiTi", serif',
  fill: 0x1a1a1a,
  align: "center",
};

function spriteSize(layer: string, cluster: LayerCluster): number {
  const base = { geo: 340, kingdom: 300, village: 170 }[layer as "geo"] ?? 170;
  return base + Math.sqrt(cluster.nodeIds.length) * 26;
}

function addCluster(
  layerName: "geo" | "kingdom" | "village",
  container: Container,
  cluster: LayerCluster,
  retention: number,
  onTap?: (cluster: LayerCluster) => void,
): Sprite | null {
  const texture = textureFor(layerName, cluster.scaleSlot);
  if (!texture) return null;
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const size = spriteSize(layerName, cluster);
  sprite.scale.set(size / Math.max(texture.width, texture.height));
  sprite.position.set(cluster.x, cluster.y);
  // Memory as ink: faded knowledge draws paler (never below readability).
  sprite.alpha = 0.45 + 0.55 * retention;
  if (onTap) {
    sprite.eventMode = "static";
    sprite.cursor = "pointer";
    sprite.on("pointertap", () => onTap(cluster));
  }
  container.addChild(sprite);

  const label = new Text({
    text: cluster.name,
    style: { ...LABEL_STYLE, fontSize: layerName === "village" ? 20 : 26 },
  });
  label.anchor.set(0.5, 0);
  label.position.set(cluster.x, cluster.y + size / 2 + 8);
  container.addChild(label);

  // Ink birth: elements breathe in instead of popping.
  const targetAlpha = sprite.alpha;
  sprite.alpha = 0;
  label.alpha = 0;
  gsap.to(sprite, { alpha: targetAlpha, duration: 0.9, ease: "power2.out" });
  gsap.to(label, { alpha: 1, duration: 0.9, delay: 0.15, ease: "power2.out" });
  return sprite;
}

export function buildWorld(
  root: Container,
  layered: LayeredMap,
  retentionByNode: ReadonlyMap<string, number>,
  nodeLabels: ReadonlyMap<string, string>,
  handlers: {
    onVillageTap(cluster: LayerCluster): void;
    onNodeTap(nodeId: string): void;
  },
): WorldHandles {
  root.removeChildren();
  const layers = {
    geo: new Container(),
    kingdom: new Container(),
    village: new Container(),
    nodes: new Container(),
  };
  root.addChild(layers.geo, layers.kingdom, layers.village, layers.nodes);

  const meanRetention = (cluster: LayerCluster) => {
    const values = cluster.nodeIds.map((id) => retentionByNode.get(id) ?? 1);
    return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  };

  for (const cluster of layered.geo) addCluster("geo", layers.geo, cluster, meanRetention(cluster));
  for (const cluster of layered.kingdom)
    addCluster("kingdom", layers.kingdom, cluster, meanRetention(cluster));

  const villageSprites = new Map<string, Sprite>();
  for (const cluster of layered.village) {
    const sprite = addCluster(
      "village",
      layers.village,
      cluster,
      meanRetention(cluster),
      (tapped) => handlers.onVillageTap(tapped),
    );
    if (sprite) villageSprites.set(cluster.id, sprite);

    // Deepest zoom: the knowledge points themselves, clickable to anchor.
    for (const member of cluster.internal ?? []) {
      const nodeLabel = new Text({
        text: `· ${nodeLabels.get(member.nodeId) ?? "…"}`,
        style: { ...LABEL_STYLE, fontSize: 13 },
      });
      nodeLabel.anchor.set(0.5);
      nodeLabel.position.set(cluster.x + member.dx * 0.9, cluster.y + member.dy * 0.9);
      nodeLabel.alpha = 0.45 + 0.55 * (retentionByNode.get(member.nodeId) ?? 1);
      nodeLabel.eventMode = "static";
      nodeLabel.cursor = "pointer";
      nodeLabel.on("pointertap", () => handlers.onNodeTap(member.nodeId));
      layers.nodes.addChild(nodeLabel);
    }
  }
  return { layers, villageSprites };
}

/** Cross-fades the four layers as the camera travels between zoom bands. */
export function updateLayerFades(handles: WorldHandles, scale: number): void {
  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const geoBand = LAYER_BANDS.geo;
  handles.layers.geo.alpha = clamp01(
    (geoBand.fadeOutAbove - scale) / (geoBand.fadeOutAbove - geoBand.fadeInBelow),
  );
  const kingdomBand = LAYER_BANDS.kingdom;
  const kingdomIn = clamp01((scale - kingdomBand.from + 0.15) / 0.15);
  const kingdomOut = clamp01((kingdomBand.to - scale + 0.15) / 0.15);
  handles.layers.kingdom.alpha = Math.min(kingdomIn, kingdomOut);
  handles.layers.village.alpha = clamp01((scale - LAYER_BANDS.village.fadeInAbove) / 0.25);
  handles.layers.nodes.alpha = clamp01((scale - LAYER_BANDS.nodes.fadeInAbove) / 0.3);
}
