/**
 * Purpose: the line between text that is drawn and text that is written down. t() wraps every
 * interpolated value in bidirectional isolates, which is right on screen and wrong in the
 * database: a conversation title is compared character by character to decide whether that
 * conversation already exists, and a seeded opener becomes part of every prompt built from
 * that conversation afterwards. These tests hold both halves — the isolates really are on,
 * and every producer of stored text really does take them back off.
 */
import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { changeLanguage, initI18n } from "../../i18n";
import { stripBidiIsolates } from "../../i18n/storedText";
import { helperInvitation, helperThanks } from "../companion/companionActions";
import { teachConversationTitle, teachOpener } from "../companion/teachActions";
import { practiceConversationTitle } from "../compare/occupationActions";
import { frontierOpener } from "../planner/frontierActions";

/** U+2066…U+2069: the whole isolate family, matching i18n/storedText.ts. */
const ANY_ISOLATE = /[⁦-⁩]/u;

const LANGUAGES = ["zh-CN", "en"] as const;

describe("text that gets written down", () => {
  beforeAll(async () => {
    await initI18n();
  });

  it("is worth stripping — plain t() really does isolate its values", () => {
    expect(i18next.t("palace:frontier.opener", { label: "闭包" })).toMatch(ANY_ISOLATE);
  });

  it.each(LANGUAGES)("%s: no producer of a stored string leaks an isolate", async (code) => {
    await changeLanguage(code);
    const produced = [
      frontierOpener("closures", []),
      frontierOpener("closures", ["scope", "functions"]),
      teachOpener("closures"),
      teachConversationTitle("closures"),
      practiceConversationTitle("write a deployment script"),
      helperInvitation("closures"),
      helperThanks("closures"),
    ];
    for (const text of produced) {
      expect(text, text).not.toMatch(ANY_ISOLATE);
      expect(text.trim()).not.toBe("");
    }
    await changeLanguage("zh-CN");
  });

  it("gives a practice title that matches what earlier versions stored", () => {
    // The title is the identity of a practice conversation. Before the isolates existed it
    // was a plain interpolation, and it has to still compare equal to those rows.
    expect(practiceConversationTitle("写一个部署脚本")).toBe("【实践】写一个部署脚本");
  });

  it("is idempotent and leaves ordinary text alone", () => {
    expect(stripBidiIsolates("plain")).toBe("plain");
    expect(stripBidiIsolates(stripBidiIsolates("a⁨1⁩b"))).toBe("a1b");
    expect(stripBidiIsolates("a⁦x⁧y⁨z⁩b")).toBe("axyzb");
  });
});
