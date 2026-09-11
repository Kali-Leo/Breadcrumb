/**
 * Purpose: tests for the evidence route as the app assembles it — the Wikidata sentence is
 * written from the catalogue in the answer language and carries no bidi isolates (the anchor
 * gate compares characters), and the paid layer is only ever handed a key behind its switch.
 */
import i18next from "i18next";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { changeLanguage, initI18n } from "../../i18n";

vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
vi.mock("../platform/edition", () => ({ isBrowserEdition: () => true }));
vi.mock("../platform/llmConfig", () => ({
  currentAnswerLanguage: () => ({ code: i18next.language }),
}));

const { currentEvidenceProviders, wikidataFactRenderer } = await import("./evidenceProviders");

/** U+2066…U+2069, the whole isolate family. */
const ANY_ISOLATE = /[⁦-⁩]/u;

describe("wikidataFactRenderer", () => {
  beforeAll(async () => {
    await initI18n();
  });

  it("writes the sentence in the interface language, with no isolate characters", async () => {
    await changeLanguage("zh-CN");
    const sentence = wikidataFactRenderer({
      subject: "珠穆朗玛峰",
      property: "海拔",
      value: "8848.86 米",
      reference: null,
    });
    expect(sentence).toBe("珠穆朗玛峰的海拔为 8848.86 米。");
    expect(sentence).not.toMatch(ANY_ISOLATE);
  });

  it("appends the statement's own source when it has one", async () => {
    await changeLanguage("en");
    const sentence = wikidataFactRenderer({
      subject: "Mount Everest",
      property: "elevation above sea level",
      value: "8848.86 metre",
      reference: "https://www.bbc.com/news/1",
    });
    expect(sentence).toBe(
      "Mount Everest — elevation above sea level: 8848.86 metre (source: https://www.bbc.com/news/1).",
    );
    expect(sentence).not.toMatch(ANY_ISOLATE);
  });
});

describe("currentEvidenceProviders", () => {
  const switches = { factcheckWebSearch: false } as never;

  it("is empty in the browser edition on a mainland network without the paid layer", () => {
    expect(
      currentEvidenceProviders({
        mainlandNetwork: true,
        featureSwitches: switches,
        webSearchApiKey: "k",
      }),
    ).toEqual([]);
  });

  it("hands the key to the paid layer only behind its switch", async () => {
    await changeLanguage("zh-CN");
    const on = { factcheckWebSearch: true } as never;
    const names = (providers: { name: string }[]) => providers.map((provider) => provider.name);
    expect(
      names(
        currentEvidenceProviders({
          mainlandNetwork: true,
          featureSwitches: on,
          webSearchApiKey: "k",
        }),
      ),
    ).toEqual(["zhipu"]);
    expect(
      names(
        currentEvidenceProviders({
          mainlandNetwork: false,
          featureSwitches: on,
          webSearchApiKey: "",
        }),
      ),
    ).toEqual(["wikidata", "wikipedia"]);
  });
});
