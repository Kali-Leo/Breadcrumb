/**
 * Purpose: where the interface language comes from at startup, which is the one thing in this
 * module a reload can get visibly wrong. The database is the authority; the mirror beside it
 * is what the first frame reads, so a mirror the database has not heard of has to win over the
 * machine's locale — otherwise the app un-picks the learner's language one frame after the
 * first paint (2026-09-03 walkthrough).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US", "en"] });

const settingsValues = new Map<string, unknown>();
const settingsSetMock = vi.fn(async (key: string, value: unknown) => {
  settingsValues.set(key, value);
});
vi.mock("../lib/platform/db", () => ({
  getRepos: vi.fn(async () => ({
    settings: {
      get: vi.fn(async (key: string) => settingsValues.get(key) ?? null),
      set: settingsSetMock,
    },
  })),
}));

const changeLanguageMock = vi.fn(async (_code: string) => {});
const rememberLanguageMock = vi.fn((_code: string) => {});
const rememberedLanguageMock = vi.fn<() => string | null>(() => null);
vi.mock("../i18n", () => ({
  changeLanguage: (code: string) => changeLanguageMock(code),
  rememberLanguage: (code: string) => rememberLanguageMock(code),
  rememberedLanguage: () => rememberedLanguageMock(),
}));

const { loadSettingsSnapshot } = await import("./settingsStoreLoad");

beforeEach(() => {
  settingsValues.clear();
  vi.clearAllMocks();
  rememberedLanguageMock.mockReturnValue(null);
});

describe("the interface language a launch resolves", () => {
  it("takes the database's language and mirrors it back", async () => {
    settingsValues.set("language", "es");
    rememberedLanguageMock.mockReturnValue("zh-CN");

    const snapshot = await loadSettingsSnapshot();

    expect(snapshot.language).toBe("es");
    expect(snapshot.languageUnchosen).toBe(false);
    expect(changeLanguageMock).toHaveBeenCalledWith("es");
    expect(rememberLanguageMock).toHaveBeenCalledWith("es");
  });

  it("keeps the mirror's language when the database holds none, and writes it back", async () => {
    rememberedLanguageMock.mockReturnValue("zh-CN");

    const snapshot = await loadSettingsSnapshot();

    expect(snapshot.language).toBe("zh-CN");
    expect(snapshot.languageUnchosen).toBe(false);
    expect(changeLanguageMock).toHaveBeenCalledWith("zh-CN");
    expect(settingsSetMock).toHaveBeenCalledWith("language", "zh-CN", expect.any(String));
  });

  it("guesses from the machine only when neither the database nor the mirror has one", async () => {
    const snapshot = await loadSettingsSnapshot();

    expect(snapshot.language).toBe("en");
    expect(snapshot.languageUnchosen).toBe(false);
    expect(changeLanguageMock).toHaveBeenCalledWith("en");
    // Nobody chose this one, so neither store is written: the next launch guesses again, and
    // the day an interface in the machine's language ships, it is the one that appears.
    expect(rememberLanguageMock).not.toHaveBeenCalled();
    expect(settingsSetMock).not.toHaveBeenCalled();
  });

  it("opens the picker when the machine's language is not one we have an interface in", async () => {
    vi.stubGlobal("navigator", { language: "da-DK", languages: ["da-DK"] });

    const snapshot = await loadSettingsSnapshot();

    expect(snapshot.languageUnchosen).toBe(true);
    expect(snapshot.language).toBe("zh-CN");
    expect(settingsSetMock).not.toHaveBeenCalled();

    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US", "en"] });
  });

  it("falls through a stored language whose interface no longer ships", async () => {
    settingsValues.set("language", "ja");
    rememberedLanguageMock.mockReturnValue("es");

    const snapshot = await loadSettingsSnapshot();

    expect(snapshot.language).toBe("es");
    expect(settingsSetMock).toHaveBeenCalledWith("language", "es", expect.any(String));
  });
});
