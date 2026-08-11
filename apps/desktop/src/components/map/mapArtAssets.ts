/**
 * Purpose: loads the Nortantis hand-drawn art (AGPL-3.0, see THIRD_PARTY_NOTICES.md) —
 * settlement icons, kingdom seat illustrations and the sea decorations (compass rose,
 * creatures, ship). Also readies the handwriting font before Pixi rasterizes labels.
 * Main exports: loadMapArt, resetMapArt, MapArt.
 */
import { Texture } from "pixi.js";

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
  /** Open-sea fillers: the corner compass rose and the three drifting pieces. */
  decor: {
    compassRose: Texture;
    seaSerpent: Texture;
    octopus: Texture;
    ship: Texture;
  };
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

/** Plain per-mount decode — deliberately NOT Assets.load: Pixi's global asset cache hands a
 * second renderer the first renderer's textures, which then resolve to the new renderer's
 * text atlas (sea decor drew as label glyphs). A fresh HTMLImageElement per mount cannot
 * be shared across renderers. */
async function loadTexture(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return Texture.from(image);
}

export async function loadMapArt(): Promise<MapArt> {
  if (cachedArt !== null) return cachedArt;
  await ensureMapFontLoaded();
  const load = (fragment: string): Promise<Texture> => loadTexture(urlNamed("cities", fragment));
  const loadDecor = (fragment: string): Promise<Texture> =>
    loadTexture(urlNamed("decor", fragment));
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
  const [compassRose, seaSerpent, octopus, ship] = await Promise.all([
    loadDecor("compass-rose-1"),
    loadDecor("sea-serpent"),
    loadDecor("octopus"),
    loadDecor("ship-6"),
  ]);
  cachedArt = {
    settlementByTier: [farm, smallVillage, town, walledCity],
    kingdomSeats: [seatFarm, smallVillage, town, seatTown, walledCity, seatCastleTown],
    decor: { compassRose, seaSerpent, octopus, ship },
  };
  return cachedArt;
}

/**
 * Textures must not outlive the renderer that uploaded them — a stale cache is how the
 * "tiled label texture" background bug happened, and Pixi's GLOBAL Assets cache has the
 * same problem (a second mount got first-renderer textures that resolved to the new
 * renderer's text atlas — sea decor drew as label glyphs). Call on map unmount.
 */
export function resetMapArt(): void {
  cachedArt = null;
}
