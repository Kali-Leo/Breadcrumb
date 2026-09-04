/**
 * Purpose: pins which art file each fragment in loadMapArt resolves to (a substring match used
 * to hand `town-width` to `flat-town-width=30.png` — dictionary order, `f` < `t` — so kingdom
 * tiers 2 and 3 drew the same picture and `town-width=24.png` never loaded), and pins that
 * unloading the map actually frees its textures.
 *
 * The unload test registers plain buffer-backed textures instead of the real PNGs: a node test
 * runner cannot decode an image, and what is under test is the bookkeeping, not the decode.
 * `Texture.from` keys Pixi's GLOBAL Cache by the resource object either way.
 */
import { Cache, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { adoptMapTexture, heldMapArtCacheKeys, resetMapArt, urlNamed } from "./mapArtAssets";

const fileNameOf = (url: string): string => url.split("/").pop() ?? "";

describe("urlNamed", () => {
  it("resolves each kingdom seat fragment to its own file", () => {
    const expected: ReadonlyArray<readonly [string, string]> = [
      ["small-village", "small-village-width=18.png"],
      ["town-width", "town-width=24.png"],
      ["walled-city", "walled-city-width=32.png"],
      ["flat-farm", "flat-farm-width=22.png"],
      ["flat-town-width", "flat-town-width=30.png"],
      ["flat-town-with-castle", "flat-town-with-castle-width=22.png"],
    ];
    for (const [fragment, fileName] of expected) {
      expect(fileNameOf(urlNamed("cities", fragment))).toBe(fileName);
    }
    const seats = expected.map(([fragment]) => urlNamed("cities", fragment));
    expect(new Set(seats).size).toBe(seats.length);
  });

  it("resolves each sea decoration fragment to its own file", () => {
    const expected: ReadonlyArray<readonly [string, string]> = [
      ["compass-rose-1", "compass-rose-1.png"],
      ["sea-serpent", "sea-serpent.png"],
      ["octopus", "octopus.png"],
      ["ship-6", "ship-6.png"],
    ];
    for (const [fragment, fileName] of expected) {
      expect(fileNameOf(urlNamed("decor", fragment))).toBe(fileName);
    }
  });
});

describe("resetMapArt", () => {
  it("destroys every texture it uploaded and leaves none of its keys in Pixi's global Cache", () => {
    // The bug (hunt 2026-09-03): resetMapArt only nulled its own `cachedArt`, so every map
    // texture stayed in the global Cache — uploaded by a renderer that no longer exists, which
    // is exactly the "sea decor drew as label glyphs" failure the module's own comment warns
    // about, plus a leak of every mount's art.
    const resources = [new Uint8Array([255, 0, 0, 255]), new Uint8Array([0, 255, 0, 255])];
    const textures = resources.map((resource) =>
      adoptMapTexture(resource, Texture.from({ resource, width: 1, height: 1 })),
    );
    const sources = textures.map((texture) => texture.source);
    for (const resource of resources) expect(Cache.has(resource)).toBe(true);
    expect(heldMapArtCacheKeys()).toBe(resources.length);

    resetMapArt();

    expect(heldMapArtCacheKeys()).toBe(0);
    for (const resource of resources) expect(Cache.has(resource)).toBe(false);
    for (const texture of textures) expect(texture.destroyed).toBe(true);
    for (const source of sources) expect(source.destroyed).toBe(true);
  });
});
