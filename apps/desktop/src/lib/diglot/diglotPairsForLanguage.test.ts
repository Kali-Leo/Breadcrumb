/**
 * Purpose: unit tests for the rule that the source half of a language pair is not a choice —
 * it is whatever the AI answers in. Run against the REAL shipped catalogue (only the network
 * and database side of languagePacks.ts is stubbed away), because the thing that can break is
 * exactly "which packs does this catalogue actually offer a Vietnamese reader".
 */
import { describe, expect, it, vi } from "vitest";
import {
  correctPairForSourceLang,
  diglotPickerView,
  pairsForSourceLang,
  SOURCE_LANGS_WITH_PACKS,
  sourceLangForAnswer,
} from "./diglotPairsForLanguage";

// Only to keep the tauri http client and the database out of a unit test: the catalogue the
// mock hands back is the one that ships.
vi.mock("./languagePacks", async () => {
  const catalog = (await import("../../assets/language-packs/catalog.json")).default;
  return { BUNDLED_PAIR_ID: "zh:en", PACK_CATALOG: catalog.packs };
});

const targetsFor = (sourceLang: string) =>
  pairsForSourceLang(sourceLang).map((option) => option.targetLang);

describe("the language a pack has to read", () => {
  it("is the answer language, not the interface language, when they differ", () => {
    expect(sourceLangForAnswer("zh-CN", "en")).toBe("en");
    expect(sourceLangForAnswer("es", "vi")).toBe("vi");
  });

  it("is the interface language when nobody chose an answer language", () => {
    expect(sourceLangForAnswer("zh-CN", null)).toBe("zh");
    expect(sourceLangForAnswer("id", null)).toBe("id");
  });

  it("drops the region, because pack ids never carry one", () => {
    expect(sourceLangForAnswer("zh-CN", null)).toBe("zh");
    expect(sourceLangForAnswer("zh-CN", "zh-CN")).toBe("zh");
  });
});

describe("what the picker offers", () => {
  it("offers a Chinese reader the bundled pair first", () => {
    expect(pairsForSourceLang("zh")[0]).toEqual({ id: "zh:en", targetLang: "en", bytes: 0 });
  });

  it("offers each answer language only the packs that read it", () => {
    expect(targetsFor("zh")).toEqual(["en"]);
    expect(targetsFor("en")).toEqual(["hi", "id", "ko", "sw", "vi"]);
    expect(targetsFor("bn")).toEqual(["en"]);
    expect(targetsFor("id")).toEqual(["en"]);
    expect(targetsFor("vi")).toEqual(["en"]);
  });

  it("offers nothing at all for a language no pack reads", () => {
    for (const code of ["es", "fr", "pt", "ru", "ar", "hi", "sw", "ko"]) {
      expect(pairsForSourceLang(code), `${code} should have no packs`).toEqual([]);
    }
  });

  it("never offers a pack whose source is some other language", () => {
    for (const code of SOURCE_LANGS_WITH_PACKS) {
      for (const option of pairsForSourceLang(code)) {
        expect(option.id.startsWith(`${code}:`), `${option.id} listed under ${code}`).toBe(true);
      }
    }
  });

  it("names every language something can be learned from", () => {
    expect([...SOURCE_LANGS_WITH_PACKS].sort()).toEqual(["bn", "en", "id", "vi", "zh"]);
  });

  it("carries the download size of everything not bundled", () => {
    for (const option of pairsForSourceLang("en")) {
      expect(option.bytes).toBeGreaterThan(0);
    }
  });
});

describe("correcting the pair after the answer language moved", () => {
  it("leaves a pair that already reads the answer language alone", () => {
    expect(
      correctPairForSourceLang({
        sourceLang: "en",
        currentPairId: "en:ko",
        installedPairs: ["zh:en", "en:ko"],
      }),
    ).toEqual({ pairId: "en:ko", changed: false });
  });

  it("moves to the first pack for the new language this machine already has", () => {
    expect(
      correctPairForSourceLang({
        sourceLang: "en",
        currentPairId: "zh:en",
        installedPairs: ["zh:en", "en:sw", "en:id"],
      }),
    ).toEqual({ pairId: "en:id", changed: true });
  });

  it("lands a Chinese answer language on the bundled pair, which needs no download", () => {
    expect(
      correctPairForSourceLang({
        sourceLang: "zh",
        currentPairId: "en:ko",
        installedPairs: ["zh:en", "en:ko"],
      }),
    ).toEqual({ pairId: "zh:en", changed: true });
  });

  it("has nowhere to go when nothing for the new language is downloaded", () => {
    expect(
      correctPairForSourceLang({
        sourceLang: "en",
        currentPairId: "zh:en",
        installedPairs: ["zh:en"],
      }),
    ).toEqual({ pairId: null, changed: true });
  });

  it("has nowhere to go when no pack reads the new language at all", () => {
    expect(
      correctPairForSourceLang({
        sourceLang: "es",
        currentPairId: "zh:en",
        installedPairs: ["zh:en", "en:ko"],
      }),
    ).toEqual({ pairId: null, changed: true });
  });
});

describe("what the settings section shows", () => {
  it("shows the switch on and the chosen language when the pair fits", () => {
    expect(diglotPickerView({ sourceLang: "zh", pairId: "zh:en", enabled: true })).toMatchObject({
      currentId: "zh:en",
      switchOn: true,
      mustChoose: false,
      noPackForLanguage: false,
    });
  });

  it("replaces the picker with one sentence when no pack reads this language", () => {
    const view = diglotPickerView({ sourceLang: "es", pairId: "zh:en", enabled: true });
    expect(view.noPackForLanguage).toBe(true);
    expect(view.options).toEqual([]);
    // The stored setting still says on; showing it on would be claiming to work.
    expect(view.switchOn).toBe(false);
    expect(view.mustChoose).toBe(false);
  });

  it("keeps that sentence out of the way of a switch that is already off", () => {
    const view = diglotPickerView({ sourceLang: "es", pairId: "zh:en", enabled: false });
    expect(view).toMatchObject({ switchOn: false, noPackForLanguage: true, mustChoose: false });
  });

  it("asks for a choice, switch off, when the language has packs but the pair does not fit", () => {
    const view = diglotPickerView({ sourceLang: "en", pairId: "zh:en", enabled: false });
    expect(view.currentId).toBeNull();
    expect(view.mustChoose).toBe(true);
    expect(view.options.map((option) => option.id)).toContain("en:ko");
  });
});
