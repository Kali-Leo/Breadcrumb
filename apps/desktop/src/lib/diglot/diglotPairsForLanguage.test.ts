/**
 * Purpose: unit tests for the rule that the source half of a language pair is not a choice —
 * it is whatever the AI answers in. Run against the REAL shipped catalogue (only the network
 * and database side of languagePacks.ts is stubbed away), because the thing that can break is
 * exactly "which packs does this catalogue actually offer a Vietnamese reader".
 */
import { describe, expect, it, vi } from "vitest";
import catalogJson from "../../assets/language-packs/catalog.json";
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

const CATALOGUE_PACKS: { sourceLang: string; targetLang: string }[] = catalogJson.packs;

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

/** A language the catalogue does not read — picked from the list rather than written down,
 * so publishing a pack for one of them turns this into a different case instead of a failure.
 * hi and sw lead it because they are the durable cases: a pack has to rank its source language
 * by frequency, neither has a usable frequency list, and so neither can ever be read from,
 * however many packs are published that teach them. */
function unreadLanguage(): string {
  const candidate = ["hi", "sw", "ja", "de", "tr", "it", "ar"].find(
    (code) => !SOURCE_LANGS_WITH_PACKS.includes(code),
  );
  if (candidate === undefined) throw new Error("every language in this case now has a pack");
  return candidate;
}

describe("what the picker offers", () => {
  it("offers a Chinese reader the bundled pair first", () => {
    expect(pairsForSourceLang("zh")[0]).toEqual({ id: "zh:en", targetLang: "en", bytes: 0 });
  });

  // Read from the catalogue rather than written out: packs are published over time, and a
  // list frozen here would fail the day one is added rather than the day the rule breaks.
  it("offers each answer language exactly the packs the catalogue says read it", () => {
    for (const code of SOURCE_LANGS_WITH_PACKS) {
      const expected = CATALOGUE_PACKS.filter((pack) => pack.sourceLang === code).map(
        (pack) => pack.targetLang,
      );
      if (code === "zh") expected.unshift("en");
      expect(targetsFor(code), code).toEqual(expected);
    }
  });

  it("offers nothing at all for a language no pack reads", () => {
    const unread = ["es", "fr", "pt", "ru", "ar", "hi", "sw", "ko", "de", "ja"].filter(
      (code) => !SOURCE_LANGS_WITH_PACKS.includes(code),
    );
    expect(unread.length, "the catalogue now reads every language this case knows").toBeGreaterThan(
      0,
    );
    for (const code of unread) {
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

  it("names every language something can be learned from, and nothing else", () => {
    const fromCatalogue = new Set(["zh", ...CATALOGUE_PACKS.map((pack) => pack.sourceLang)]);
    expect([...SOURCE_LANGS_WITH_PACKS].sort()).toEqual([...fromCatalogue].sort());
  });

  it("carries the download size of everything not bundled", () => {
    for (const option of pairsForSourceLang("en")) {
      expect(option.bytes).toBeGreaterThan(0);
    }
  });
});

describe("correcting the pair after the answer language moved", () => {
  it("leaves a pair that already reads the answer language alone", () => {
    expect(correctPairForSourceLang({ sourceLang: "en", currentPairId: "en:ko" })).toEqual({
      pairId: "en:ko",
      changed: false,
    });
  });

  it("does not move the learner onto another language, even one with a pack", () => {
    expect(correctPairForSourceLang({ sourceLang: "en", currentPairId: "zh:en" })).toEqual({
      pairId: null,
      changed: true,
    });
  });

  it("does not fall back to the bundled pair either", () => {
    expect(correctPairForSourceLang({ sourceLang: "zh", currentPairId: "en:ko" })).toEqual({
      pairId: null,
      changed: true,
    });
  });

  it("has nowhere to go when no pack reads the new language at all", () => {
    expect(correctPairForSourceLang({ sourceLang: "nl", currentPairId: "zh:en" })).toEqual({
      pairId: null,
      changed: true,
    });
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
    const view = diglotPickerView({ sourceLang: unreadLanguage(), pairId: "zh:en", enabled: true });
    expect(view.noPackForLanguage).toBe(true);
    expect(view.options).toEqual([]);
    // The stored setting still says on; showing it on would be claiming to work.
    expect(view.switchOn).toBe(false);
    expect(view.mustChoose).toBe(false);
  });

  it("keeps that sentence out of the way of a switch that is already off", () => {
    const view = diglotPickerView({
      sourceLang: unreadLanguage(),
      pairId: "zh:en",
      enabled: false,
    });
    expect(view).toMatchObject({ switchOn: false, noPackForLanguage: true, mustChoose: false });
  });

  it("asks for a choice, switch off, when the language has packs but the pair does not fit", () => {
    const view = diglotPickerView({ sourceLang: "en", pairId: "zh:en", enabled: false });
    expect(view.currentId).toBeNull();
    expect(view.mustChoose).toBe(true);
    expect(view.options.map((option) => option.id)).toContain("en:ko");
  });
});
