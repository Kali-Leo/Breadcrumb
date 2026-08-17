/**
 * Purpose: read one web page and keep only the part a person came to read (spec 053 §7) — fetch
 * the address through Tauri's HTTP client, hand the HTML to Defuddle (MIT, kepano/defuddle) and
 * take its Markdown out, so the overlay can render it through the same Markdown component chat
 * messages use. Storing what came back is the caller's business (lib/articleReading).
 * Side effects: one HTTP GET to the page's own address.
 * Main exports: extractArticleAt, ArticleExtraction, ArticleExtractionDependencies.
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { z } from "zod";

export type ArticleExtraction =
  | { kind: "extracted"; markdown: string; title: string | null; author: string | null }
  | { kind: "failed" };

/** Same ceiling the channel layer uses for a feed body: past this, a page is not an article. */
const MAXIMUM_PAGE_BYTES = 5_000_000;
const REQUEST_TIMEOUT_MS = 20_000;
/** Below this, extraction found navigation chrome rather than a text worth opening a reader for. */
const MINIMUM_MARKDOWN_LENGTH = 80;

/** Sites serve different markup to unknown clients; this is the string the channel layer already
 * identifies the app with, so one site sees one client. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Defuddle is a third-party library, so its result is treated like any other outside input. */
const defuddleResponseSchema = z.object({
  content: z.string(),
  title: z.string().nullish(),
  author: z.string().nullish(),
});

export interface ArticleExtractionDependencies {
  fetchImpl: typeof tauriFetch;
  /** Injected only so tests can run the real extraction over a fixed page. */
  parseHtml: (html: string) => Document;
}

function defaultParseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function looksLikeHtml(contentType: string | null): boolean {
  if (contentType === null) return true; // no header: try, and let extraction decide
  const value = contentType.toLowerCase();
  return value.includes("text/html") || value.includes("application/xhtml");
}

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The timeout is a controller we disarm, not `AbortSignal.timeout`. That signal stays armed for
 * its full twenty seconds no matter how the request ended, and Tauri's HTTP plugin, whose request
 * resource is freed the moment the body is read, answered the late abort with a rejection nobody
 * was waiting on any more: every article the reader opened threw an unhandled rejection into the
 * console twenty seconds later (spec 053 T10). Clearing the timer on the way out — success,
 * failure or bad status alike — leaves nothing behind to fire.
 */
async function fetchPageHtml(url: string, fetchImpl: typeof tauriFetch): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    if (!looksLikeHtml(response.headers.get("content-type"))) return null;
    const declaredLength = Number(response.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_PAGE_BYTES) return null;
    const html = await response.text();
    return html.length > MAXIMUM_PAGE_BYTES ? html.slice(0, MAXIMUM_PAGE_BYTES) : html;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loaded on first use: the full Defuddle build carries the Markdown converter and the formula
 * handling, and most sessions never open an article, so it stays out of the app's first paint.
 */
async function toMarkdown(
  html: string,
  url: string,
  parseHtml: (html: string) => Document,
): Promise<ArticleExtraction> {
  const { default: Defuddle } = await import("defuddle/full");
  const parsed = defuddleResponseSchema.safeParse(
    new Defuddle(parseHtml(html), { url, markdown: true, useAsync: false }).parse(),
  );
  if (!parsed.success) return { kind: "failed" };
  const markdown = parsed.data.content.trim();
  if (markdown.length < MINIMUM_MARKDOWN_LENGTH) return { kind: "failed" };
  return {
    kind: "extracted",
    markdown,
    title: nonEmpty(parsed.data.title),
    author: nonEmpty(parsed.data.author),
  };
}

export async function extractArticleAt(
  url: string,
  dependencies: Partial<ArticleExtractionDependencies> = {},
): Promise<ArticleExtraction> {
  const fetchImpl = dependencies.fetchImpl ?? tauriFetch;
  const parseHtml = dependencies.parseHtml ?? defaultParseHtml;
  try {
    const html = await fetchPageHtml(url, fetchImpl);
    if (html === null) return { kind: "failed" };
    return await toMarkdown(html, url, parseHtml);
  } catch {
    // Unreachable site, timeout, blocked request, malformed page: from the reader's side these
    // are one and the same — the page did not open here — and the overlay offers the browser.
    return { kind: "failed" };
  }
}
