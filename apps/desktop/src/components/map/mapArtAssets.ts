/**
 * Purpose: loads the Nortantis hand-drawn building art (AGPL-3.0, see
 * THIRD_PARTY_NOTICES.md) — settlement icons for the map and kingdom seat
 * illustrations. Also readies the handwriting font before Pixi rasterizes labels.
 * Main exports: loadMapArt, resetMapArt, MapArt.
 */
import { Assets, type Texture } from "pixi.js";

const assetUrls = import.meta.glob("../../assets/map-art/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export interface MapArt {
  /** Small settlement icons by village tier (farm → walled city) for the map. */
  settlementByTier: [Texture, Texture, Texture, Texture];
  /** Kingdom seat illustrations, smallest to grandest — one large building per realm. */
  kingdomSeats: Texture[];
}

function urlNamed(folder: string, nameFragment: string): string {
  return (
    Object.entries(assetUrls).find(
      ([path]) => path.includes(`/map-art/${folder}/`) && path.includes(nameFragment),
    )?.[1] ?? ""
  );
}

/** Pixi Text rasterizes through canvas — the handwriting font must be ready first. */
async function ensureMapFontLoaded(): Promise<void> {
  try {
    await document.fonts.load('16px "LXGW WenKai"', "记忆宫殿");
  } catch {
    // Font loading is best-effort; serif fallbacks keep labels readable.
  }
}

let cachedArt: MapArt | null = null;

export async function loadMapArt(): Promise<MapArt> {
  if (cachedArt !== null) return cachedArt;
  await ensureMapFontLoaded();
  const load = (fragment: string): Promise<Texture> =>
    Assets.load<Texture>(urlNamed("cities", fragment));
  const [farm, smallVillage, town, walledCity, seatFarm, seatTown, seatCastleTown] =
    await Promise.all([
      load("small-farm"),
      load("small-village"),
      load("town-width"),
      load("walled-city"),
      load("flat-farm"),
      load("flat-town-width"),
      load("flat-town-with-castle"),
    ]);
  cachedArt = {
    settlementByTier: [farm, smallVillage, town, walledCity],
    kingdomSeats: [seatFarm, smallVillage, town, seatTown, walledCity, seatCastleTown],
  };
  return cachedArt;
}

/**
 * Textures must not outlive the renderer that uploaded them — a stale cache is how
 * the "tiled label texture" background bug happened. Call on map unmount.
 */
export function resetMapArt(): void {
  cachedArt = null;
}
