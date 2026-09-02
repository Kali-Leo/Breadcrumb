import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ networkEnabled: true }) },
}));
vi.mock("./db", () => ({ getRepos: vi.fn() }));
vi.mock("./failureLog", () => ({ degradeSilently: vi.fn() }));

const { invoke } = await import("@tauri-apps/api/core");
const { embedTexts } = await import("./embeddings");
const invokeMock = vi.mocked(invoke);

interface EmbedArguments {
  texts: string[];
  allowDownload: boolean;
}

describe("embedTexts", () => {
  beforeEach(() => invokeMock.mockReset());

  it("slices a large batch into calls the Rust side accepts, preserving order", async () => {
    const texts = Array.from({ length: 1012 }, (_, index) => `concept ${index}`);
    invokeMock.mockImplementation(async (...callArguments: unknown[]) => {
      const embedArguments = callArguments[1] as EmbedArguments | undefined;
      return embedArguments === undefined ? [] : embedArguments.texts.map((text) => [text.length]);
    });
    const vectors = await embedTexts(texts);
    const embedCalls = invokeMock.mock.calls
      .filter((call) => call[0] === "embed_texts")
      .map((call) => call[1] as unknown as EmbedArguments);
    expect(embedCalls.map((call) => call.texts.length)).toEqual([512, 500]);
    expect(vectors).toHaveLength(1012);
    expect(vectors?.[1011]).toEqual(["concept 1011".length]);
  });

  it("returns null when any slice fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("model missing"));
    expect(await embedTexts(["a"])).toBeNull();
  });
});
