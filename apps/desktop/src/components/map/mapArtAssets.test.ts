/**
 * Purpose: pins which art file each fragment in loadMapArt resolves to. A substring match
 * used to hand `town-width` to `flat-town-width=30.png` (dictionary order, `f` < `t`), so
 * kingdom tiers 2 and 3 drew the same picture and `town-width=24.png` never loaded.
 */
import { describe, expect, it } from "vitest";
import { urlNamed } from "./mapArtAssets";

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
