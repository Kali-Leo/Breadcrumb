/**
 * Purpose: texture registry for the layered map — static asset imports (Vite-reliable),
 * loaded into an explicit map (no module-level state).
 * Main exports: loadMapTextures, textureFrom, MapTextures.
 */
import { Assets, type Texture } from "pixi.js";
import geoIslandUrl from "../../assets/map/geo/island.png";
import kingdomLargeUrl from "../../assets/map/kingdom/large.png";
import kingdomSmallUrl from "../../assets/map/kingdom/small.png";
import villageTier1Url from "../../assets/map/village/tier1.png";
import villageTier2Url from "../../assets/map/village/tier2.png";
import villageTier3Url from "../../assets/map/village/tier3.png";
import villageTier4Url from "../../assets/map/village/tier4.png";

const TEXTURE_URLS: Record<string, string> = {
  "geo/island": geoIslandUrl,
  "kingdom/small": kingdomSmallUrl,
  "kingdom/large": kingdomLargeUrl,
  "village/tier1": villageTier1Url,
  "village/tier2": villageTier2Url,
  "village/tier3": villageTier3Url,
  "village/tier4": villageTier4Url,
};

export type MapTextures = Map<string, Texture>;

export async function loadMapTextures(): Promise<MapTextures> {
  const textures: MapTextures = new Map();
  await Promise.all(
    Object.entries(TEXTURE_URLS).map(async ([key, assetUrl]) => {
      textures.set(key, await Assets.load(assetUrl));
    }),
  );
  return textures;
}

export function textureFrom(
  textures: MapTextures,
  layer: string,
  scaleSlot: string,
): Texture | undefined {
  return textures.get(`${layer}/${scaleSlot}`) ?? textures.get(`${layer}/tier1`);
}
