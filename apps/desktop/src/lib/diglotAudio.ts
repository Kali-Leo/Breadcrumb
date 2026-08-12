/**
 * Purpose: pronunciation chain for woven words (spec 033 T9) — local Piper (user-configured
 * binary+voice, via the Rust piper_synthesize command) → system speechSynthesis → null
 * (caller falls back to showing IPA only). Side effect: plays audio.
 * Main exports: speakWord, canSpeak.
 */
import { invoke } from "@tauri-apps/api/core";

/** True when at least one audio provider might work — drives showing the 🔊 button.
 * Piper availability can't be probed synchronously, so configured paths count. */
export function canSpeak(targetLang: string, piperPath: string): boolean {
  if (piperPath.trim().length > 0) return true;
  const synthesis = window.speechSynthesis;
  if (synthesis === undefined) return false;
  // Voice lists load lazily; an empty list still often speaks with a default voice.
  const voices = synthesis.getVoices();
  return voices.length === 0 || voices.some((voice) => voice.lang.startsWith(targetLang));
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
      console.warn("piper synthesis failed, falling back:", error);
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
      console.warn("speechSynthesis failed:", error);
    }
  }
  return false;
}
