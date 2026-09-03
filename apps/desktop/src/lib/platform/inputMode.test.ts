/**
 * Purpose: the three-step touch verdict and its test override. No jsdom in this project, so
 * navigator / matchMedia / localStorage / location are stubbed by hand per case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyInputMode,
  detectInputMode,
  INPUT_MODE_OVERRIDE_KEY,
  resetInputModeForTests,
} from "./inputMode";

interface Hardware {
  touchPoints: number;
  coarse: boolean;
  noHover: boolean;
}

type ChangeHandler = () => void;
let changeHandlers: Map<string, ChangeHandler[]>;
let hardware: Hardware;
let storage: Map<string, string>;
let dataset: Record<string, string>;

function stubHardware(next: Hardware, search = ""): void {
  hardware = next;
  vi.stubGlobal("navigator", { maxTouchPoints: hardware.touchPoints });
  vi.stubGlobal("location", { search });
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      if (query === "(any-pointer: coarse)") return hardware.coarse;
      if (query === "(hover: none)") return hardware.noHover;
      return false;
    },
    addEventListener: (_type: string, handler: ChangeHandler) => {
      changeHandlers.set(query, [...(changeHandlers.get(query) ?? []), handler]);
    },
  }));
}

beforeEach(() => {
  changeHandlers = new Map();
  storage = new Map();
  dataset = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
  });
  vi.stubGlobal("document", { documentElement: { dataset } });
  resetInputModeForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectInputMode", () => {
  it("is fine without touch hardware, whatever the media features say", () => {
    stubHardware({ touchPoints: 0, coarse: true, noHover: true });
    expect(detectInputMode()).toBe("fine");
  });

  it("is coarse when touch hardware and the coarse pointer agree (an iPad)", () => {
    stubHardware({ touchPoints: 5, coarse: true, noHover: true });
    expect(detectInputMode()).toBe("coarse");
  });

  it("falls back to hover when touch hardware and the pointer query disagree", () => {
    stubHardware({ touchPoints: 10, coarse: false, noHover: true });
    expect(detectInputMode()).toBe("coarse");
    stubHardware({ touchPoints: 10, coarse: false, noHover: false });
    expect(detectInputMode()).toBe("fine");
  });

  it("never consults the user agent", () => {
    stubHardware({ touchPoints: 0, coarse: false, noHover: false });
    vi.stubGlobal("navigator", { maxTouchPoints: 0, userAgent: "iPad; CPU OS 18" });
    expect(detectInputMode()).toBe("fine");
  });
});

describe("the test override", () => {
  it("reads ?input= from the URL first", () => {
    stubHardware({ touchPoints: 0, coarse: false, noHover: false }, "?x=1&input=coarse");
    expect(detectInputMode()).toBe("coarse");
    stubHardware({ touchPoints: 5, coarse: true, noHover: true }, "?input=fine");
    expect(detectInputMode()).toBe("fine");
  });

  it("then localStorage, and ignores values that are neither mode", () => {
    stubHardware({ touchPoints: 0, coarse: false, noHover: false });
    storage.set(INPUT_MODE_OVERRIDE_KEY, "coarse");
    expect(detectInputMode()).toBe("coarse");
    storage.set(INPUT_MODE_OVERRIDE_KEY, "touch");
    expect(detectInputMode()).toBe("fine");
  });

  it("survives storage that throws", () => {
    stubHardware({ touchPoints: 5, coarse: true, noHover: true });
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
    });
    expect(detectInputMode()).toBe("coarse");
  });
});

describe("applyInputMode", () => {
  it("stamps <html data-input> and follows media-feature changes", () => {
    stubHardware({ touchPoints: 5, coarse: false, noHover: false });
    expect(applyInputMode()).toBe("fine");
    expect(dataset.input).toBe("fine");
    // A finger arrives: the pointer query flips, the attribute follows without a reload.
    hardware = { touchPoints: 5, coarse: true, noHover: true };
    for (const handler of changeHandlers.get("(any-pointer: coarse)") ?? []) handler();
    expect(dataset.input).toBe("coarse");
  });

  it("registers its listeners once", () => {
    stubHardware({ touchPoints: 0, coarse: false, noHover: false });
    applyInputMode();
    applyInputMode();
    expect(changeHandlers.get("(hover: none)")).toHaveLength(1);
  });
});
