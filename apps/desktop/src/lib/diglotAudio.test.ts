/**
 * Purpose: unit tests for the strict speech-provider verification (Leo 2026-08-16) — an
 * empty voice list is "no provider", Piper needs BOTH paths, and voice-language matching
 * is case-insensitive prefix over BCP-47 tags. Audio playback itself is not testable here;
 * only the gating logic is verified.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const { resolveSpeechProvider } = await import("./diglotAudio");

describe("resolveSpeechProvider", () => {
  it("returns null when nothing is configured and the voice list is empty", () => {
    expect(
      resolveSpeechProvider({
        targetLang: "en",
        piperPath: "",
        piperModelPath: "",
        voiceLangs: [],
      }),
    ).toBeNull();
  });

  it("returns null when voices exist but none matches the target language", () => {
    expect(
      resolveSpeechProvider({
        targetLang: "en",
        piperPath: "",
        piperModelPath: "",
        voiceLangs: ["zh-CN", "ja-JP"],
      }),
    ).toBeNull();
  });

  it("returns system when a voice matches the target language (case-insensitive prefix)", () => {
    expect(
      resolveSpeechProvider({
        targetLang: "en",
        piperPath: "",
        piperModelPath: "",
        voiceLangs: ["zh-CN", "EN-us"],
      }),
    ).toBe("system");
  });

  it("requires BOTH piper paths — a lone binary path is not a verified provider", () => {
    expect(
      resolveSpeechProvider({
        targetLang: "en",
        piperPath: "/usr/bin/piper",
        piperModelPath: "",
        voiceLangs: [],
      }),
    ).toBeNull();
    expect(
      resolveSpeechProvider({
        targetLang: "en",
        piperPath: "/usr/bin/piper",
        piperModelPath: "  ",
        voiceLangs: [],
      }),
    ).toBeNull();
  });

  it("returns piper when both paths are configured, regardless of system voices", () => {
    expect(
      resolveSpeechProvider({
        targetLang: "en",
        piperPath: "/usr/bin/piper",
        piperModelPath: "/home/leo/voices/en_US-lessac-medium.onnx",
        voiceLangs: [],
      }),
    ).toBe("piper");
  });
});
