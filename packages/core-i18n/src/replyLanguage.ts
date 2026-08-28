/**
 * Purpose: the tripwire behind the language directive — did the model actually answer in the
 * language we asked for? Code, formulas, urls and quoted terms are stripped first, because
 * they are language-neutral and would otherwise decide the verdict. Detection itself is
 * franc's job, not ours.
 * Main exports: checkReplyLanguage.
 */
import type { Language } from "./languages";

/** Below this many letters after stripping, no detector is trustworthy — and neither are we. */
const MIN_SAMPLE_LENGTH = 24;

export type ReplyLanguageVerdict =
  /** The reply is in the language we asked for. */
  | "matches"
  /** The reply is confidently in some other language — worth one firmer retry. */
  | "differs"
  /** Too short, or all code and symbols: no honest verdict, so we let it through. */
  | "unknown";

/** Everything that carries no language: fenced code, inline code, math, urls, entities. */
function stripLanguageNeutral(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
    .replace(/[\d\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

/** franc carries a ~300 KB trigram table and is only needed after a reply has finished
 * streaming, so it is imported on first use and kept for the rest of the session — the
 * startup bundle never pays for it. */
let francPromise: Promise<typeof import("franc").franc> | null = null;

function loadFranc(): Promise<typeof import("franc").franc> {
  francPromise ??= import("franc").then((module) => module.franc);
  return francPromise;
}

export async function checkReplyLanguage(
  reply: string,
  expected: Language,
): Promise<ReplyLanguageVerdict> {
  const sample = stripLanguageNeutral(reply);
  if (sample.length < MIN_SAMPLE_LENGTH) return "unknown";
  const franc = await loadFranc();
  const detected = franc(sample, { minLength: MIN_SAMPLE_LENGTH });
  if (detected === "und") return "unknown";
  if (expected.detectionCodes.includes(detected)) return "matches";
  // A language we do not have a row for cannot be judged against this one.
  return expected.detectionCodes.length === 0 ? "unknown" : "differs";
}
