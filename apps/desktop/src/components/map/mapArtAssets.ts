/**
 * Purpose: loads the Nortantis hand-drawn art (AGPL-3.0, see THIRD_PARTY_NOTICES.md) —
 * kingdom seat illustrations and the sea decorations (compass rose, creatures, ship),
 * mipmapped so they stay crisp when drawn small. Village settlement icons went away with
 * the village scene (2026-08-11). Also readies the handwriting font before Pixi rasterizes
 * labels.
 * Main exports: loadMapArt, resetMapArt, MapArt, urlNamed, adoptMapTexture,
 * heldMapArtCacheKeys.
 */
import { Cache, Texture } from "pixi.js";

const assetUrls = import.meta.glob("../../assets/map-art/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export interface MapArt {
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

/**
 * Resolves one art file by folder and file-name prefix. The match is anchored to the start
 * of the *file name*, never a substring of the whole path: a plain `includes` let the
 * dictionary-ordered glob hand `town-width` to `flat-town-width=30.png`, which silently drew
 * kingdom tiers 2 and 3 with the same picture. Exported for the resolution test.
 */
export function urlNamed(folder: string, nameFragment: string): string {
  return (
    Object.entries(assetUrls).find(
      ([path]) =>
        path.includes(`/map-art/${folder}/`) &&
        (path.split("/").pop() ?? "").startsWith(nameFragment),
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

/** This mount's textures, in load order — the unload list. */
let loadedTextures: Texture[] = [];
/**
 * The resources this module handed to `Texture.from`, which is exactly what Pixi's GLOBAL
 * Cache keys the resulting textures by (rendering/renderers/shared/texture/utils/textureFrom).
 * Held weakly and kept PAST an unload on purpose: "is anything of ours still in the Cache?" is
 * only answerable if the keys outlive the reset, and a key the collector has already taken was
 * by definition not being held by the Cache.
 */
let registeredCacheKeys: WeakRef<object>[] = [];

/**
 * Records a texture this module uploaded so resetMapArt can free it, and returns it unchanged.
 * `cacheKey` is the resource `Texture.from` was given. Exported for the unload test, which
 * cannot decode a PNG in a node test runner.
 */
export function adoptMapTexture(cacheKey: object, texture: Texture): Texture {
  registeredCacheKeys.push(new WeakRef(cacheKey));
  loadedTextures.push(texture);
  return texture;
}

/** How many of this module's Cache keys Pixi's global Cache still holds. Zero after
 * resetMapArt; anything else is a texture outliving the renderer that uploaded it. */
export function heldMapArtCacheKeys(): number {
  let held = 0;
  for (const weak of registeredCacheKeys) {
    const key = weak.deref();
    if (key !== undefined && Cache.has(key)) held += 1;
  }
  return held;
}

/** Plain per-mount decode — deliberately NOT Assets.load: Pixi's global asset cache hands a
 * second renderer the first renderer's textures, which then resolve to the new renderer's
 * text atlas (sea decor drew as label glyphs). A fresh HTMLImageElement per mount cannot
 * be shared across renderers. */
async function loadTexture(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const texture = adoptMapTexture(image, Texture.from(image));
  // These stamps are drawn far below their native pixel size; mipmaps (requested before the
  // first render, while the source is still uploadable) keep the hatching from crawling.
  texture.source.autoGenerateMipmaps = true;
  texture.source.scaleMode = "linear";
  return texture;
}

export async function loadMapArt(): Promise<MapArt> {
  if (cachedArt !== null) return cachedArt;
  // A fresh mount starts a fresh unload list; the previous mount's keys have served their
  // purpose and holding them any longer would pin the images they name.
  registeredCacheKeys = [];
  loadedTextures = [];
  await ensureMapFontLoaded();
  const load = (fragment: string): Promise<Texture> => loadTexture(urlNamed("cities", fragment));
  const loadDecor = (fragment: string): Promise<Texture> =>
    loadTexture(urlNamed("decor", fragment));
  const [smallVillage, town, walledCity, seatFarm, seatTown, seatCastleTown] = await Promise.all([
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
    kingdomSeats: [seatFarm, smallVillage, town, seatTown, walledCity, seatCastleTown],
    decor: { compassRose, seaSerpent, octopus, ship },
  };
  return cachedArt;
}

/**
 * Textures must not outlive the renderer that uploaded them — a stale cache is how the
 * "tiled label texture" background bug happened, and Pixi's GLOBAL Cache has the same problem
 * (a second mount got first-renderer textures that resolved to the new renderer's text atlas —
 * sea decor drew as label glyphs). Call on map unmount.
 *
 * Forgetting `cachedArt` was never enough (bug hunt 2026-09-03): `Texture.from` puts every one
 * of these in that global Cache keyed by its decoded image, so the whole art set survived the
 * unmount — a leak, and a loaded gun for the next mount. Destroying each texture with its
 * source is what frees the upload, and Pixi drops the Cache entry on the texture's own
 * "destroy" event; the sweep afterwards is belt and braces for anything that missed.
 */
export function resetMapArt(): void {
  for (const texture of loadedTextures) {
    if (!texture.destroyed) texture.destroy(true);
  }
  for (const weak of registeredCacheKeys) {
    const key = weak.deref();
    if (key !== undefined && Cache.has(key)) Cache.remove(key);
  }
  loadedTextures = [];
  cachedArt = null;
}
