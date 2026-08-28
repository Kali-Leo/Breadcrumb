/**
 * Purpose: the two things about a message catalogue that only show up once i18next has it —
 * that plural keys are actually reached (a missing `_one` used to ship "Active on 1 days"),
 * and that every interpolated value comes back wrapped in bidirectional isolates so a number
 * or a label cannot reorder the sentence around it once a right-to-left language arrives.
 */
import i18next from "i18next";
import { beforeAll, describe, expect, it } from "vitest";
import { changeLanguage, initI18n } from "./index";

const FIRST_STRONG_ISOLATE = "⁨";
const POP_DIRECTIONAL_ISOLATE = "⁩";

/** What the sentence reads as once the invisible isolates are taken back out. */
function plain(text: string): string {
  return text.replaceAll(FIRST_STRONG_ISOLATE, "").replaceAll(POP_DIRECTIONAL_ISOLATE, "");
}

describe("the catalogues once i18next holds them", () => {
  beforeAll(async () => {
    await initI18n();
  });

  it("writes English singulars and plurals as English grammar wants them", async () => {
    await changeLanguage("en");
    expect(plain(i18next.t("palace:mirror.activeDays", { count: 1 }))).toBe("Active on 1 day");
    expect(plain(i18next.t("palace:mirror.activeDays", { count: 7 }))).toBe("Active on 7 days");
    expect(plain(i18next.t("palace:map.memberCount", { count: 1 }))).toBe("1 concept");
    expect(plain(i18next.t("palace:map.memberCount", { count: 4 }))).toBe("4 concepts");
  });

  it("keeps the one Chinese form for a language that has only one", async () => {
    await changeLanguage("zh-CN");
    expect(plain(i18next.t("palace:mirror.activeDays", { count: 1 }))).toBe("活跃 1 天");
    expect(plain(i18next.t("palace:mirror.activeDays", { count: 7 }))).toBe("活跃 7 天");
  });

  it("isolates every interpolated value, so a right-to-left run cannot reorder the line", () => {
    const line = i18next.t("palace:mirror.activeDays", { count: 3 });
    expect(line).toContain(`${FIRST_STRONG_ISOLATE}3${POP_DIRECTIONAL_ISOLATE}`);
  });

  it("leaves sentences without interpolation exactly as written", async () => {
    await changeLanguage("en");
    const line = i18next.t("common:state.loading");
    expect(line).toBe("Loading…");
    await changeLanguage("zh-CN");
  });
});
