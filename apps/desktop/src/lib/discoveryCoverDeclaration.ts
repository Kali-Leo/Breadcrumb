/**
 * Purpose: the page-head side of cover enrichment (spec 053 §2) — reads a response's document
 * head under a hard byte ceiling, and says which picture that head declares as the page's own.
 * No network call and no state of its own: the pass next door decides whether a page is worth
 * reading, this file only reads it.
 * Main exports: readHeadSection, readCoverDeclaration, HEAD_READ_CAP_BYTES.
 */
import { z } from "zod";

/** Everything we came for is in the document head, and heads are small; 128 KB is generous for
 * one and small enough that a page which never closes its head still costs almost nothing. */
export const HEAD_READ_CAP_BYTES = 128 * 1024;

/**
 * What a page may call its own picture, in the order a page's head normally puts them. The first
 * usable one wins: an unreadable declaration is skipped rather than taken as the answer, so a
 * broken og:image above a good twitter:image still leaves the card with a picture.
 */
const COVER_DECLARATION_KEYS: readonly string[] = [
  "og:image",
  "og:image:secure_url",
  "twitter:image",
];

const META_TAG_PATTERN = /<meta\b[^>]*>/gi;

/** Pages are written by hand, so the value may be quoted either way or not at all. */
function readAttribute(tag: string, name: "property" | "name" | "content"): string | null {
  const pattern = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = pattern.exec(tag);
  if (match === null) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

/**
 * A declared address may be relative, protocol-relative or nonsense; it is outside input either
 * way. Resolved against the page it was declared on, then held to http(s) — a `javascript:` or
 * `data:` value parses as a URL perfectly well and is not a picture anybody should load.
 */
const httpAddressSchema = z
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"));

function resolveAgainstPage(declared: string | null, pageUrl: string): string | null {
  const trimmed = declared?.trim() ?? "";
  if (trimmed.length === 0) return null;
  let absolute: string;
  try {
    absolute = new URL(trimmed, pageUrl).toString();
  } catch {
    return null;
  }
  return httpAddressSchema.safeParse(absolute).success ? absolute : null;
}

/** The picture the given head declares, as an absolute http(s) address, or null when it declares
 * none we can use. */
export function readCoverDeclaration(head: string, pageUrl: string): string | null {
  for (const tag of head.match(META_TAG_PATTERN) ?? []) {
    const key = (readAttribute(tag, "property") ?? readAttribute(tag, "name"))
      ?.trim()
      .toLowerCase();
    if (key === undefined || !COVER_DECLARATION_KEYS.includes(key)) continue;
    const resolved = resolveAgainstPage(readAttribute(tag, "content"), pageUrl);
    if (resolved !== null) return resolved;
  }
  return null;
}

function headOnly(html: string): string {
  const end = html.toLowerCase().indexOf("</head>");
  return end === -1 ? html : html.slice(0, end);
}

/**
 * Pulls the response until the head closes or the cap is reached, then cancels the rest — the
 * head-only twin of plugin-channels' readBoundedResponseBody, which stops at its cap and nowhere
 * else. Decoded as UTF-8 whatever the page declares: the only thing read out of here is a URL,
 * and URLs are ASCII in every encoding a page can be served in.
 */
export async function readHeadSection(response: Response): Promise<string> {
  const body = response.body;
  if (body === null) return headOnly(await response.text());
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let byteLength = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const remaining = HEAD_READ_CAP_BYTES - byteLength;
      if (chunk.value.byteLength >= remaining) {
        text += decoder.decode(chunk.value.subarray(0, remaining));
        break;
      }
      byteLength += chunk.value.byteLength;
      text += decoder.decode(chunk.value, { stream: true });
      if (text.toLowerCase().includes("</head>")) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return headOnly(text);
}
