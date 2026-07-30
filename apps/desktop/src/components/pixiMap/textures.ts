/**
 * Purpose: texture registry for the layered map — resolves (layer, scaleSlot) to the
 * approved asset URLs (Vite bundles them) and preloads them via PIXI Assets.
 * Main exports: loadMapTextures, textureFor.
 */
import { Assets, type Texture } from "pixi.js";

const url = (path: string) => new URL(`../../assets/map/${path}`, import.meta.url).href;

const TEXTURE_URLS: Record<string, string> = {
  "geo/island": url("geo/island.png"),
  "kingdom/small": url("kingdom/small.png"),
  "kingdom/large": url("kingdom/large.png"),
  "village/tier1": url("village/tier1.png"),
  "village/tier2": url("village/tier2.png"),
  "village/tier3": url("village/tier3.png"),
  "village/tier4": url("village/tier4.png"),
};

const loaded = new Map<string, Texture>();

export async function loadMapTextures(): Promise<void> {
  await Promise.all(
    Object.entries(TEXTURE_URLS).map(async ([key, assetUrl]) => {
      loaded.set(key, await Assets.load(assetUrl));
    }),
  );
}

export function textureFor(layer: string, scaleSlot: string): Texture | undefined {
  return loaded.get(`${layer}/${scaleSlot}`) ?? loaded.get(`${layer}/tier1`);
}
