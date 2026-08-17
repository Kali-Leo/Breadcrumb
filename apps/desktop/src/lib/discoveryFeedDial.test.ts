/**
 * Purpose: unit tests for the feed's familiar/new switch — each side maps to a share the
 * ordering accepts, an untouched install reads as the familiar side, and a stored share always
 * comes back as one of the two positions.
 */
import { explorationShareBounds } from "@breadcrumb/plugin-discovery";
import { describe, expect, it } from "vitest";
import { dialPositionForShare, feedDialShares, shareForDialPosition } from "./discoveryFeedDial";

describe("feed dial", () => {
  it("keeps both positions inside the ordering's travel", () => {
    for (const share of Object.values(feedDialShares)) {
      expect(share).toBeGreaterThanOrEqual(explorationShareBounds.minimum);
      expect(share).toBeLessThanOrEqual(explorationShareBounds.maximum);
    }
    expect(feedDialShares.familiar).toBeLessThan(feedDialShares["new-fields"]);
  });

  it("shows the familiar side for the untouched default", () => {
    expect(dialPositionForShare(0.25)).toBe("familiar");
  });

  it("reads back the position it just wrote", () => {
    expect(dialPositionForShare(shareForDialPosition("familiar"))).toBe("familiar");
    expect(dialPositionForShare(shareForDialPosition("new-fields"))).toBe("new-fields");
  });

  it("answers with a position for any stored number, including a broken one", () => {
    expect(dialPositionForShare(0.5)).toBe("new-fields");
    expect(dialPositionForShare(0)).toBe("familiar");
    expect(dialPositionForShare(Number.NaN)).toBe("familiar");
  });
});
