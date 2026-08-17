/**
 * Purpose: the small text repairs every real-world feed needs — titles arriving as HTML, links
 * written relative to the feed, dates in half a dozen formats or missing entirely.
 * Main exports: stripHtmlToPlainText, resolveAbsoluteUrl, toIsoInstant, firstNonEmptyText,
 * repairTruncatedFeed.
 */

const namedEntityReplacements: ReadonlyArray<readonly [RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&#39;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&amp;/g, "&"],
];

function decodeCommonEntities(value: string): string {
  let decoded = value.replace(/&#(\d+);/g, (_whole, code: string) =>
    String.fromCodePoint(Number(code)),
  );
  for (const [pattern, replacement] of namedEntityReplacements) {
    decoded = decoded.replace(pattern, replacement);
  }
  return decoded;
}

/** Feeds put markup in titles and full articles in descriptions; the card shows plain text.
 * Block-level tags become a space so words do not fuse across paragraphs. */
export function stripHtmlToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  const withoutScripts = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const withBreaks = withoutScripts.replace(
    /<\/(p|div|li|tr|h[1-6]|blockquote)\s*>|<br\s*\/?>/gi,
    " ",
  );
  const withoutTags = withBreaks.replace(/<[^>]*>/g, "");
  return decodeCommonEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/** Feed links are often relative (`/posts/1`); the base is the post-redirect feed address. */
export function resolveAbsoluteUrl(
  candidate: string | null | undefined,
  baseUrl: string,
): string | null {
  const trimmed = candidate?.trim();
  if (!trimmed) return null;
  try {
    const resolved = new URL(trimmed, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

/** RFC 822, RFC 3339 and the various sloppy variants all go through Date; anything Date cannot
 * read returns null so the caller can fall back to the observation time. */
export function toIsoInstant(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  const milliseconds = parsed.getTime();
  if (Number.isNaN(milliseconds)) return null;
  return parsed.toISOString();
}

/**
 * A feed cut off at the size cap is invalid XML and parses to nothing, which would make the cap
 * equivalent to dropping the source. Cutting back to the last complete entry and closing the
 * document by hand recovers everything that did arrive. Returns null when there is no complete
 * entry to keep, or when the payload is not XML (JSON Feed cannot be repaired this way).
 */
export function repairTruncatedFeed(feedText: string): string | null {
  let cutIndex = -1;
  for (const closingTag of ["</item>", "</entry>"]) {
    const index = feedText.lastIndexOf(closingTag);
    if (index >= 0) cutIndex = Math.max(cutIndex, index + closingTag.length);
  }
  if (cutIndex < 0) return null;
  const head = feedText.slice(0, cutIndex);
  if (/<feed[\s>]/i.test(head)) return `${head}</feed>`;
  if (/<rdf:RDF[\s>]/i.test(head)) return `${head}</rdf:RDF>`;
  if (/<channel[\s>]/i.test(head)) return `${head}</channel></rss>`;
  return null;
}

/** First candidate with actual content after trimming, else null. */
export function firstNonEmptyText(
  ...candidates: ReadonlyArray<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}
