/**
 * Purpose: what the Wikipedia and Wikidata providers share — the Wikimedia-policy identity
 * headers, one JSON GET under a request budget, and the language-code shaping both need
 * (a UI language code → the Wikipedia edition and the Wikidata label chain it maps to).
 * Main exports: WIKIMEDIA_HEADERS, fetchWikimediaJson, wikiEditionOf, wikidataLanguagesOf.
 */
import type { FetchLike } from "./provider";
import { SEARCH_MAX_REDIRECTS } from "./provider";
import { withRequestBudget } from "./requestBudget";

const USER_AGENT = "Breadcrumb/0.1 (https://github.com/Kali-Leo/Breadcrumb)";

/**
 * The Wikimedia User-Agent policy's Api-User-Agent escape hatch exists for browser JS that
 * *cannot* set User-Agent (the browser edition: the browser drops the forbidden header and
 * sends its own). Tauri's Rust client can, so both are sent: a non-browser client that sends
 * only the substitute is what gets silently throttled. Both endpoints list `api-user-agent`
 * in their CORS Allow-Headers, measured 2026-09-11.
 */
export const WIKIMEDIA_HEADERS: Readonly<Record<string, string>> = {
  "Api-User-Agent": USER_AGENT,
  "User-Agent": USER_AGENT,
};

/**
 * One GET returning parsed JSON, or null for a non-OK response. Network errors and timeouts
 * still throw — the caller decides whether that means "failed" (it does, for a search) and a
 * null means "answered, unusable". A thrown error and a null are two different facts.
 */
export async function fetchWikimediaJson(
  fetchImpl: FetchLike,
  timeoutMs: number,
  url: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): Promise<unknown> {
  return withRequestBudget(timeoutMs, async (signal) => {
    const response = await fetchImpl(url, {
      headers: { ...WIKIMEDIA_HEADERS, ...extraHeaders },
      signal,
      maxRedirections: SEARCH_MAX_REDIRECTS,
    });
    return response.ok ? ((await response.json()) as unknown) : null;
  });
}

/** Wikipedia edition subdomains: `en`, `zh`, `zh-yue`, `simple`… — the only shape that may
 * be spliced into a hostname. Anything else is dropped, so a caller wiring a user locale in
 * cannot turn a language code into an arbitrary host. */
export const EDITION_PATTERN = /^[a-z]{2,12}(-[a-z0-9]{1,8})*$/;

/** The Wikipedia edition for a UI language code: `zh-CN` → `zh`, `en` → `en`. Null when the
 * code does not reduce to something that could be an edition. */
export function wikiEditionOf(languageCode: string): string | null {
  const primary = languageCode.toLowerCase().split("-")[0] ?? "";
  return EDITION_PATTERN.test(primary) ? primary : null;
}

/**
 * The label-language chain Wikidata is asked for, most specific first, English last. Chinese
 * gets its script variants spelled out: the bare `zh` label is often traditional
 * (珠穆朗瑪峰), and a simplified-script learner asked to copy that sentence would be copying
 * characters they did not type. Measured: `zh-cn` labels exist for the common entities.
 */
export function wikidataLanguagesOf(languageCode: string): string[] {
  const code = languageCode.toLowerCase();
  if (!EDITION_PATTERN.test(code)) return ["en"];
  if (code === "zh-cn" || code === "zh") return ["zh-cn", "zh-hans", "zh", "en"];
  const primary = code.split("-")[0] ?? "en";
  return [...new Set([code, primary, "en"])];
}
