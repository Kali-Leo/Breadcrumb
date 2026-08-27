/**
 * Purpose: a development-only pseudolocale — English messages padded and flipped to
 * right-to-left, so layout problems (truncation, hardcoded direction, clipped buttons) show
 * up before a real translation exists. It is not a language and never appears in a build the
 * user sees; that is the point (spec 058 §2: no fake translations in the picker).
 * Main exports: PSEUDO_LOCALE_CODE, isPseudoLocale, buildPseudoCatalogue.
 */

export const PSEUDO_LOCALE_CODE = "qps-Ploc-RTL";

export function isPseudoLocale(code: string): boolean {
  return code === PSEUDO_LOCALE_CODE;
}

/** Latin letters are padded so every string grows ~35%, the usual worst case for German
 * and Finnish; placeholders and markup-ish runs are left exactly as they are. */
function pseudoText(text: string): string {
  const padded = text.replace(/[a-zA-Z]+/g, (word) => {
    const extra = Math.max(1, Math.round(word.length * 0.35));
    return word + "́".repeat(0) + word.slice(-1).repeat(extra);
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
