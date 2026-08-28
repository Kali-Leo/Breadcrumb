/**
 * Purpose: hunt the ways a language layer goes wrong — an OS locale nobody anticipated, a
 * model that answers in the wrong language, a reply that is all code, a user who reads a
 * language the interface does not exist in yet.
 */
import { describe, expect, it } from "vitest";
import { buildLanguageDirective, resolveAnswerLanguage } from "./answerLanguage";
import { fontStackFor, formatCount, formatDayMonth, formatPercent } from "./format";
import { LANGUAGES, languageOf, UI_LANGUAGE_CODES } from "./languages";
import { negotiateLanguage } from "./negotiate";
import { checkReplyLanguage } from "./replyLanguage";

const chinese = languageOf("zh-CN");
const english = languageOf("en");
const swahili = languageOf("sw");

describe("language table", () => {
  it("is internally consistent, whichever row someone adds next", () => {
    const codes = LANGUAGES.map((language) => language.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const language of LANGUAGES) {
      expect(language.endonym.trim().length).toBeGreaterThan(0);
      expect(language.detectionCodes.length).toBeGreaterThan(0);
      expect(fontStackFor(language.script)).toContain("sans-serif");
      // The endonym is the language's own name; a row written in Chinese for a non-Chinese
      // language is the mistake this catches.
      if (language.script !== "hanzi") {
        expect(language.endonym).not.toMatch(/[一-鿿]/);
      }
    }
    expect(UI_LANGUAGE_CODES).toContain("zh-CN");
    expect(UI_LANGUAGE_CODES).toContain("en");
  });
});

describe("picking a language for a first-time user", () => {
  it("follows the operating system through region variants and priority order", () => {
    expect(negotiateLanguage(["zh-CN"])).toBe("zh-CN");
    expect(negotiateLanguage(["zh"])).toBe("zh-CN");
    expect(negotiateLanguage(["zh-Hans-CN"])).toBe("zh-CN");
    expect(negotiateLanguage(["en-GB"])).toBe("en");
    expect(negotiateLanguage(["en-us"])).toBe("en");
    expect(negotiateLanguage(["fr-CA", "en-GB"])).toBe("en");
  });

  it("lands somewhere readable for languages the interface does not have yet", () => {
    expect(negotiateLanguage(["sw-KE"])).toBe("zh-CN");
    expect(negotiateLanguage(["sw-KE"], UI_LANGUAGE_CODES, "en")).toBe("en");
    expect(negotiateLanguage([])).toBe("zh-CN");
    expect(negotiateLanguage([""])).toBe("zh-CN");
  });
});

describe("which language the model answers in", () => {
  it("follows the interface unless the user said otherwise", () => {
    const plain = resolveAnswerLanguage("zh-CN", null);
    expect(plain.answerLanguage.code).toBe("zh-CN");
    expect(plain.worthOffering).toBe(false);

    const overridden = resolveAnswerLanguage("zh-CN", "en");
    expect(overridden.interfaceLanguage.code).toBe("zh-CN");
    expect(overridden.answerLanguage.code).toBe("en");
  });

  it("offers, but never performs, the switch away from a language the model is thin in", () => {
    const thin = resolveAnswerLanguage("sw", null);
    expect(thin.answerLanguage.code).toBe("sw");
    expect(thin.worthOffering).toBe(true);

    const decided = resolveAnswerLanguage("sw", "en");
    expect(decided.answerLanguage.code).toBe("en");
    expect(decided.worthOffering).toBe(false);
  });

  it("survives a stored language that no longer exists", () => {
    const gone = resolveAnswerLanguage("xx-YY", "zz");
    expect(gone.interfaceLanguage.code).toBe("zh-CN");
    expect(gone.answerLanguage.code).toBe("zh-CN");
  });

  it("names the language in the directive, and leans harder on the retry", () => {
    const first = buildLanguageDirective(english as never);
    const second = buildLanguageDirective(english as never, { firm: true });
    expect(first).toContain("English");
    expect(second).toContain("English");
    expect(second.length).toBeGreaterThan(first.length);
    expect(first).not.toBe(second);
  });
});

describe("did the model answer in that language", () => {
  it("accepts a reply in the language asked for", async () => {
    expect(
      await checkReplyLanguage(
        "闭包是函数和它捕获的环境组成的整体，所以它能在离开定义位置之后继续读到那些变量。",
        chinese as never,
      ),
    ).toBe("matches");
    expect(
      await checkReplyLanguage(
        "A closure is a function together with the environment it captured, which is why it can still read those variables later.",
        english as never,
      ),
    ).toBe("matches");
  });

  it("catches the reply that drifted into another language", async () => {
    expect(
      await checkReplyLanguage(
        "闭包是函数和它捕获的环境组成的整体，所以它能在离开定义位置之后继续读到那些变量。",
        english as never,
      ),
    ).toBe("differs");
  });

  it("refuses to judge what carries no language", async () => {
    expect(await checkReplyLanguage("", english as never)).toBe("unknown");
    expect(await checkReplyLanguage("42", english as never)).toBe("unknown");
    expect(await checkReplyLanguage("```js\nconst a = 1;\n```", english as never)).toBe("unknown");
    expect(await checkReplyLanguage("$$E = mc^2$$", chinese as never)).toBe("unknown");
    expect(await checkReplyLanguage("https://example.com/a/b/c", english as never)).toBe("unknown");
  });

  it("judges prose that merely contains code, not the code itself", async () => {
    const reply =
      "Here is the shortest version that still reads well, and the reason it works is that the callback keeps its own scope alive:\n\n```js\nconst add = (a) => (b) => a + b;\n```";
    expect(await checkReplyLanguage(reply, english as never)).toBe("matches");
    expect(await checkReplyLanguage(reply, chinese as never)).toBe("differs");
  });

  it("has a row for every language it might be asked to verify", () => {
    expect(swahili?.detectionCodes).toContain("swh");
  });
});

describe("formatting in the reader's conventions", () => {
  it("falls back instead of throwing on a locale Intl cannot parse", () => {
    // Pseudo-locales and stored junk both end up here; a date must never take the screen down.
    expect(() => formatDayMonth("qps-Ploc-RTL", new Date())).not.toThrow();
    expect(formatCount("not a locale at all", 12345)).toBe(formatCount("zh-CN", 12345));
  });

  it("writes the same day and the same number differently per language", () => {
    const day = new Date(Date.UTC(2026, 7, 27, 12));
    expect(formatDayMonth("zh-CN", day)).not.toBe(formatDayMonth("en", day));
    expect(formatCount("en", 12345)).toBe("12,345");
    expect(formatCount("de", 12345)).toBe("12.345");
    expect(formatPercent("en", 0.185)).toBe("19%");
  });
});
