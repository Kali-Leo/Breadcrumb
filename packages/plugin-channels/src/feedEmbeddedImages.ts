/**
 * Purpose: find a cover picture inside an entry's own HTML. A feed that ships no enclosure and no
 * media namespace can still have pictures — they are in the description or content it already
 * sends (SegmentFault does exactly this, as does any blog that syndicates its full posts) — so a
 * card can have a real cover without a second request (spec 053 T10). Only what the entry states
 * is used: no fetching, no measuring, no guessing at a picture's size.
 * Main exports: firstEmbeddedImageUrl.
 */
import { z } from "zod";
import { resolveAbsoluteUrl } from "./feedText";

/** Same check the candidate contract applies to every address it accepts. */
const urlSchema = z.url();

const imageTagPattern = /<img\b[^>]*>/gi;

/** Lazy-loading CMS templates leave `src` on a placeholder and put the real picture in one of
 * the data attributes, so those are read first; an ordinary tag has none of them and falls
 * through to `src`, which is the whole picture for most feeds. */
const sourceAttributeNames = ["data-src", "data-original", "data-actualsrc", "src"] as const;

/** Below this many declared pixels on either side, the element is a counter or a spacer rather
 * than a picture — the 1x1 beacon feeds have shipped since the first web bug. */
const minimumDeclaredPixels = 8;

/** File names the ad and analytics world has used for counters for twenty years. */
const counterNamePattern = /(^|[/_.-])(pixel|beacon|spacer|blank|1x1|tracking)([._-]|$)/i;

function attributeValue(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const matched = pattern.exec(tag);
  if (matched === null) return null;
  const value = (matched[2] ?? matched[3] ?? matched[4] ?? "").trim();
  return value === "" ? null : value;
}

/** A number the tag states for one of its sides, from the attribute or from an inline style. */
function declaredPixels(tag: string, side: "width" | "height"): number | null {
  const fromAttribute = Number.parseFloat(attributeValue(tag, side) ?? "");
  if (Number.isFinite(fromAttribute)) return fromAttribute;
  const style = attributeValue(tag, "style") ?? "";
  const inline = new RegExp(`${side}\\s*:\\s*([\\d.]+)px`, "i").exec(style)?.[1];
  const fromStyle = Number.parseFloat(inline ?? "");
  return Number.isFinite(fromStyle) ? fromStyle : null;
}

function looksLikeCounter(tag: string, url: string): boolean {
  for (const side of ["width", "height"] as const) {
    const pixels = declaredPixels(tag, side);
    if (pixels !== null && pixels < minimumDeclaredPixels) return true;
  }
  return counterNamePattern.test(new URL(url).pathname);
}

/**
 * The address one <img> points at, or null when the tag carries nothing a card can show. A data
 * URI has no address to put in a card and is rejected by the http(s)-only resolve; a relative
 * path is resolved against the feed the entry came in, exactly as the entry's own link is.
 */
function imageUrlFromTag(tag: string, baseUrl: string): string | null {
  for (const name of sourceAttributeNames) {
    const raw = attributeValue(tag, name);
    if (raw === null) continue;
    // Feed HTML arrives with its entities decoded once; a doubly escaped query string still
    // carries `&amp;` between its parameters.
    const resolved = resolveAbsoluteUrl(raw.replaceAll("&amp;", "&"), baseUrl);
    if (resolved === null || !urlSchema.safeParse(resolved).success) continue;
    if (looksLikeCounter(tag, resolved)) continue;
    return resolved;
  }
  return null;
}

/**
 * The first picture the entry points at that a card could actually show, in document order —
 * publishers lead with the article's own image. Several HTML fields may be offered because a
 * feed can carry both a short description and the whole post; they are read in the order given.
 * Null when the entry embeds no picture anywhere.
 */
export function firstEmbeddedImageUrl(
  baseUrl: string,
  ...htmlFields: ReadonlyArray<string | null | undefined>
): string | null {
  for (const html of htmlFields) {
    for (const tag of html?.match(imageTagPattern) ?? []) {
      const url = imageUrlFromTag(tag, baseUrl);
      if (url !== null) return url;
    }
  }
  return null;
}
