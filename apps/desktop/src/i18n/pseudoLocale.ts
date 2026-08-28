/**
 * Purpose: a development-only pseudolocale — English messages padded and flipped to
 * right-to-left, so layout problems (truncation, hardcoded direction, clipped buttons) show
 * up before a real translation exists. It is not a language and never appears in a build the
 * user sees; that is the point (spec 058 §2: no fake translations in the picker).
 * Main exports: PSEUDO_LOCALE_CODE, isPseudoLocale, buildPseudoCatalogue.
 */

/** Microsoft's pseudo-locale convention, and — unlike "qps-Ploc-RTL" — a tag Intl accepts.
 * The right-to-left part is applied by us, not by the tag. */
export const PSEUDO_LOCALE_CODE = "qps-Ploc";

export function isPseudoLocale(code: string): boolean {
  return code === PSEUDO_LOCALE_CODE;
}

/** One non-Latin letter is mixed into the padding of every word, cycling through these:
 * Greek and Cyrillic fall outside a Latin-only font, so a font stack missing its fallback
 * shows tofu boxes here rather than in front of a Greek or Russian reader. */
const FOREIGN_PADDING = ["α", "ж", "ю", "δ"] as const;

/** Latin letters are padded so every string grows ~35%, the usual worst case for German and
 * Finnish, and each word carries a combining acute so accented glyphs get their real line
 * height; placeholders and markup-ish runs are left exactly as they are. */
function pseudoText(text: string): string {
  let padIndex = 0;
  const padded = text.replace(/[a-zA-Z]+/g, (word) => {
    const extra = Math.max(1, Math.round(word.length * 0.35));
    const foreign = FOREIGN_PADDING[padIndex % FOREIGN_PADDING.length] as string;
    padIndex += 1;
    return `${word}́${foreign}${word.slice(-1).repeat(extra - 1)}`;
  });
  return `⟦${padded}⟧`;
}

type Catalogue = { [key: string]: string | Catalogue };

/** Same shape as the source catalogue, every leaf pseudo-translated. */
export function buildPseudoCatalogue(source: Catalogue): Catalogue {
  const result: Catalogue = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      // Keep {{placeholders}} readable and intact — a pseudolocale that breaks
      // interpolation tests the wrong thing.
      const parts = value.split(/(\{\{[^}]*\}\})/g);
      result[key] = parts
        .map((part) => (part.startsWith("{{") ? part : part === "" ? part : pseudoText(part)))
        .join("");
    } else {
      result[key] = buildPseudoCatalogue(value);
    }
  }
  return result;
}
