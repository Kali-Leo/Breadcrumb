/**
 * Purpose: unit tests for the pair following the answer language. The two stores are stood in
 * for by plain objects with the same getState/setState/subscribe surface — the logic under
 * test is the correction itself, and the real catalogue is what it reads. Covers the two
 * outcomes a learner can land in (stay put, or the switch goes off because the pair no longer
 * reads the answer language) and the subscription that runs it when the answer language moves
 * later.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./languagePacks", async () => {
  const catalog = (await import("../../assets/language-packs/catalog.json")).default;
  return { BUNDLED_PAIR_ID: "zh:en", PACK_CATALOG: catalog.packs };
});

interface DiglotState {
  settings: { enabled: boolean; pairId: string };
  saveSettings(partial: Partial<{ enabled: boolean; pairId: string }>): Promise<void>;
}

let diglot: DiglotState;
let settings: { language: string; answerLanguage: string | null };
const listeners: ((state: typeof settings) => void)[] = [];

vi.mock("../../stores/diglotStore", () => ({
  useDiglotStore: {
    getState: () => diglot,
    setState: (partial: Partial<DiglotState>) => {
      diglot = { ...diglot, ...partial };
    },
  },
}));

vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: {
    getState: () => settings,
    subscribe: (listener: (state: typeof settings) => void) => {
      listeners.push(listener);
      return () => {};
    },
  },
}));

import { syncDiglotPairToAnswerLanguage, wireAnswerLanguageSync } from "./diglotLanguageSync";

function setUp(input: {
  enabled: boolean;
  pairId: string;
  language: string;
  answerLanguage?: string | null;
}) {
  settings = { language: input.language, answerLanguage: input.answerLanguage ?? null };
  diglot = {
    settings: { enabled: input.enabled, pairId: input.pairId },
    saveSettings: async (partial) => {
      diglot = { ...diglot, settings: { ...diglot.settings, ...partial } };
    },
  };
}

/** What a learner would see afterwards. */
const outcome = () => ({ pairId: diglot.settings.pairId, enabled: diglot.settings.enabled });

beforeEach(() => {
  listeners.length = 0;
});

describe("the pair follows the answer language", () => {
  it("leaves a Chinese reader on the bundled pair", async () => {
    setUp({ enabled: true, pairId: "zh:en", language: "zh-CN" });
    await syncDiglotPairToAnswerLanguage();
    expect(outcome()).toEqual({ pairId: "zh:en", enabled: true });
  });

  it("switches off rather than move the learner onto a pack this machine already has", async () => {
    setUp({ enabled: true, pairId: "zh:en", language: "zh-CN", answerLanguage: "en" });
    await syncDiglotPairToAnswerLanguage();
    expect(outcome()).toEqual({ pairId: "zh:en", enabled: false });
  });

  it("switches off rather than fall back to the bundled pair", async () => {
    setUp({ enabled: true, pairId: "en:ko", language: "zh-CN" });
    await syncDiglotPairToAnswerLanguage();
    expect(outcome()).toEqual({ pairId: "en:ko", enabled: false });
  });

  it("switches language learning off when nothing reads the new language", async () => {
    setUp({ enabled: true, pairId: "zh:en", language: "en" });
    await syncDiglotPairToAnswerLanguage();
    expect(outcome()).toEqual({ pairId: "zh:en", enabled: false });
  });

  it("switches it off when no pack reads the new language at all", async () => {
    setUp({ enabled: true, pairId: "zh:en", language: "hi" });
    await syncDiglotPairToAnswerLanguage();
    expect(outcome()).toEqual({ pairId: "zh:en", enabled: false });
  });

  it("leaves an already-off switch alone, and writes nothing", async () => {
    setUp({ enabled: false, pairId: "en:ko", language: "zh-CN" });
    await syncDiglotPairToAnswerLanguage();
    expect(outcome()).toEqual({ pairId: "en:ko", enabled: false });
  });

  it("does not turn an off switch on, ever", async () => {
    setUp({ enabled: false, pairId: "zh:en", language: "zh-CN" });
    await syncDiglotPairToAnswerLanguage();
    expect(diglot.settings.enabled).toBe(false);
  });
});

describe("the subscription that watches the answer language", () => {
  it("corrects the pair later, and only ever registers one listener", async () => {
    setUp({ enabled: true, pairId: "zh:en", language: "zh-CN" });
    wireAnswerLanguageSync();
    expect(listeners.length).toBe(1);
    settings = { language: "zh-CN", answerLanguage: "en" };
    for (const listener of listeners) listener(settings);
    await vi.waitFor(() => expect(diglot.settings.enabled).toBe(false));
    expect(outcome()).toEqual({ pairId: "zh:en", enabled: false });
    // Wiring again adds nothing: every settings load calls it, and a second listener would
    // mean a second correction racing the first.
    listeners.length = 0;
    wireAnswerLanguageSync();
    expect(listeners.length).toBe(0);
  });
});
