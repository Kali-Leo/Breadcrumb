/**
 * Purpose: pronunciation chain for woven words (spec 033 T9) — local Piper (user-configured
 * binary+voice, via the Rust piper_synthesize command) → system speechSynthesis → nothing.
 * The 🔊 button renders ONLY for a verified provider (Leo 2026-08-16): Piper fully
 * configured, or a system voice actually matching the target language — an empty voice list
 * means "no", never "might work"; webkit's lazily-loaded list re-evaluates via
 * subscribeVoicesChanged. Side effect: plays audio.
 * Main exports: resolveSpeechProvider, canSpeak, subscribeVoicesChanged, speakWord.
 */
import { invoke } from "@tauri-apps/api/core";
import { degradeSilently } from "./failureLog";

/** Pure provider verification (unit-tested): Piper counts only when BOTH paths are
 * configured non-empty (speakWord needs both); the system synthesizer counts only when a
 * loaded voice matches the target language. Null = no provider, the caller hides 🔊. */
export function resolveSpeechProvider(input: {
  targetLang: string;
  piperPath: string;
  piperModelPath: string;
  voiceLangs: readonly string[];
}): "piper" | "system" | null {
  if (input.piperPath.trim().length > 0 && input.piperModelPath.trim().length > 0) {
    return "piper";
  }
  const wanted = input.targetLang.toLowerCase();
  const hasMatchingVoice = input.voiceLangs.some((lang) => lang.toLowerCase().startsWith(wanted));
  return hasMatchingVoice ? "system" : null;
}

/** True when a verified provider exists right now — drives showing the 🔊 button. */
export function canSpeak(targetLang: string, piperPath: string, piperModelPath: string): boolean {
  const synthesis = window.speechSynthesis;
  const voiceLangs =
    synthesis === undefined ? [] : synthesis.getVoices().map((voice) => voice.lang);
  return resolveSpeechProvider({ targetLang, piperPath, piperModelPath, voiceLangs }) !== null;
}

/** Module-level prober for webkit's lazy voice loading: the first subscriber wires ONE
 * one-shot voiceschanged listener; when the list arrives every subscriber re-evaluates
 * canSpeak (useSyncExternalStore-compatible: stable function, unsubscribe on cleanup). */
const voiceListListeners = new Set<() => void>();
let voicesChangedProbeWired = false;

export function subscribeVoicesChanged(listener: () => void): () => void {
  if (!voicesChangedProbeWired) {
    voicesChangedProbeWired = true;
    const synthesis = window.speechSynthesis;
    if (synthesis !== undefined && synthesis.getVoices().length === 0) {
      synthesis.addEventListener(
        "voiceschanged",
        () => {
          for (const notify of voiceListListeners) notify();
        },
        { once: true },
      );
    }
  }
  voiceListListeners.add(listener);
  return () => {
    voiceListListeners.delete(listener);
  };
}

/** Speaks one word in the target language. Resolves true when a provider accepted the
 * request, false when every provider failed (caller then relies on the IPA display). */
export async function speakWord(
  word: string,
  targetLang: string,
  piperPath: string,
  piperModelPath: string,
): Promise<boolean> {
  if (piperPath.trim().length > 0 && piperModelPath.trim().length > 0) {
    try {
      const wavBytes = await invoke<number[]>("piper_synthesize", {
        piperPath,
        modelPath: piperModelPath,
        text: word,
      });
      const blob = new Blob([new Uint8Array(wavBytes)], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url));
      await audio.play();
      return true;
    } catch (error) {
      void degradeSilently("diglot-audio", error);
    }
  }
  const synthesis = window.speechSynthesis;
  if (synthesis !== undefined) {
    try {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = targetLang;
      const voice = synthesis.getVoices().find((v) => v.lang.startsWith(targetLang));
      if (voice !== undefined) utterance.voice = voice;
      synthesis.speak(utterance);
      return true;
    } catch (error) {
      void degradeSilently("diglot-audio", error);
    }
  }
  return false;
}
