/**
 * Purpose: pick the interface language for someone who has never chosen one, from whatever
 * the operating system says they read. Region variants fall back to the base language.
 * When the machine reads a language we have no interface in, `matchLanguage` says so rather
 * than guessing — the app then asks the person which language to use instead of opening in
 * a language they may not read (Leo 2026-09-01: "认不出来先让用户选语言").
 * Main exports: matchLanguage, negotiateLanguage.
 */
import { DEFAULT_LANGUAGE_CODE, UI_LANGUAGE_CODES } from "./languages";

/** `zh-Hans-CN` → ["zh-hans-cn", "zh-hans", "zh"] — every prefix, most specific first. */
function prefixesOf(tag: string): string[] {
  const parts = tag.toLowerCase().split("-");
  return parts.map((_part, index) => parts.slice(0, index + 1).join("-")).reverse();
}

/**
 * BCP-47 lookup against the languages whose interface is complete. `preferred` is the
 * browser/OS list in priority order (navigator.languages). Null when none of them matches.
 */
export function matchLanguage(
  preferred: readonly string[],
  available: readonly string[] = UI_LANGUAGE_CODES,
): string | null {
  const offered = available.map((code) => ({ code, lowered: code.toLowerCase() }));
  for (const tag of preferred) {
    if (!tag) continue;
    for (const prefix of prefixesOf(tag)) {
      const exact = offered.find((entry) => entry.lowered === prefix);
      if (exact) return exact.code;
      // "zh" should reach "zh-CN"; the Simplified/Traditional distinction is a separate row
      // in the table, so prefix matching never crosses between them.
      const broader = offered.find((entry) => entry.lowered.startsWith(`${prefix}-`));
      if (broader) return broader.code;
    }
  }
  return null;
}

/** The same lookup for callers that need a language whatever happens — a headless one, or a
 * screen that has to render before anyone can be asked. */
export function negotiateLanguage(
  preferred: readonly string[],
  available: readonly string[] = UI_LANGUAGE_CODES,
  fallback: string = DEFAULT_LANGUAGE_CODE,
): string {
  return matchLanguage(preferred, available) ?? fallback;
}
