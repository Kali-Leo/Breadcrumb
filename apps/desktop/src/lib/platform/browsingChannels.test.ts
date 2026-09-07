/**
 * Purpose: the door the browser edition receives browsing events through. `postMessage` is
 * shouted at every listener on the page, so the only thing separating a delivery from this
 * app's own script from a delivery by anything else is the pair of checks in `pageDeliveryOf`.
 * Each case below is a way in that must stay shut.
 */
import { describe, expect, it } from "vitest";

const OWN_WINDOW = { name: "the page itself" };
const SELF = { origin: "https://kali-leo.github.io", window: OWN_WINDOW };
const CHANNEL = "breadcrumb.browsing/1";

const { connectionCode, pageDeliveryOf } = await import("./browsingChannels");

function message(overrides: Record<string, unknown> = {}) {
  return {
    origin: SELF.origin,
    source: OWN_WINDOW,
    data: { channel: CHANNEL, kind: "events", batch: "b1", events: [{ type: "click" }] },
    ...overrides,
  };
}

describe("what the page accepts from a script running in it", () => {
  it("takes a batch that came from this very page", () => {
    const delivery = pageDeliveryOf(message(), SELF);
    expect(delivery).toEqual({ batch: "b1", events: [{ type: "click" }] });
  });

  it("refuses any other origin, however close it looks", () => {
    for (const origin of [
      "https://kali-leo.github.io.evil.example",
      "http://kali-leo.github.io",
      "https://evil.example",
      "null",
      "",
    ]) {
      expect(pageDeliveryOf(message({ origin }), SELF), origin).toBeNull();
    }
  });

  it("refuses a window that is not this one, even on the right origin", () => {
    // An iframe of the same site, the opener that launched this tab, an extension's own page:
    // same origin string, different window, and none of them is our collector script.
    for (const source of [{ name: "an iframe" }, null, undefined, OWN_WINDOW.name]) {
      expect(pageDeliveryOf(message({ source }), SELF)).toBeNull();
    }
  });

  it("refuses anything that is not one of our event batches", () => {
    const bad = [
      { channel: "someone.else/1", kind: "events", events: [] },
      { channel: CHANNEL, kind: "ready" },
      { channel: CHANNEL, kind: "events", events: "not an array" },
      { channel: CHANNEL },
      "a string",
      null,
      42,
    ];
    for (const data of bad)
      expect(pageDeliveryOf(message({ data }), SELF), String(data)).toBeNull();
  });

  it("survives a batch label of the wrong type rather than refusing the events", () => {
    const data = { channel: CHANNEL, kind: "events", batch: 7, events: [] };
    expect(pageDeliveryOf(message({ data }), SELF)).toEqual({ batch: "", events: [] });
  });
});

describe("the connection code the setup card shows", () => {
  it("carries where to post and the one-time secret as one thing to copy", () => {
    expect(connectionCode({ port: 41234, pairingCode: "abcdef01", paired: 0 })).toBe(
      "41234-abcdef01",
    );
  });
});
