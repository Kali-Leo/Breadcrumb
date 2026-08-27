/**
 * Purpose: pick the interface language for someone who has never chosen one, from whatever
 * the operating system says they read. Region variants fall back to the base language, and
 * an unknown language falls back to the default rather than to an empty screen.
 * Main exports: negotiateLanguage.
 */
import { DEFAULT_LANGUAGE_CODE, UI_LANGUAGE_CODES } from "./languages";

/** `zh-Hans-CN` → ["zh-hans-cn", "zh-hans", "zh"] — every prefix, most specific first. */
function prefixesOf(tag: string): string[] {
  const parts = tag.toLowerCase().split("-");
  return parts.map((_part, index) => parts.slice(0, index + 1).join("-")).reverse();
}

/**
 * BCP-47 lookup against the languages whose interface is complete. `preferred` is the
 * browser/OS list in priority order (navigator.languages).
 */
export function negotiateLanguage(
  preferred: readonly string[],
  available: readonly string[] = UI_LANGUAGE_CODES,
  fallback: string = DEFAULT_LANGUAGE_CODE,
): string {
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
  return fallback;
}
