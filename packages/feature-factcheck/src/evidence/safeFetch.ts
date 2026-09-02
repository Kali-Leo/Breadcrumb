/**
 * Purpose: the guard every fetch of an externally-proposed URL goes through. Search results
 * and model output both hand this app addresses to open, and the app's HTTP calls run in
 * Rust, outside the browser's same-origin and private-network protections — so a URL that
 * points at the loopback interface reaches services the page could never have reached.
 *
 * Three things are enforced: where a request may go, where a redirect may take it (every hop
 * is re-checked here, because nothing below this layer re-checks any), and how much may come
 * back.
 *
 * Main exports: isFetchableUrl, fetchExternalPage, MAX_RESPONSE_BYTES.
 */
import type { FetchLike } from "./provider";
import { withRequestBudget } from "./requestBudget";

/** Hosts that name the machine the app is running on, or the network it sits inside. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
]);

/** Cloud metadata and link-local, plus the three private IPv4 ranges and IPv6 unique-local. */
const BLOCKED_PATTERNS: readonly RegExp[] = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?f[cd][0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /\.local$/i,
  /\.internal$/i,
];

/**
 * Whether this address is one we are willing to open. Rejects anything that is not http(s)
 * and anything naming the local machine or a private network.
 *
 * Known limit: this checks the hostname as written, so a public name that RESOLVES to a
 * private address still passes (DNS rebinding). Closing that needs resolution before
 * connecting, which this layer cannot do; the value here is removing the trivial case where
 * a model simply writes `http://127.0.0.1:11434` and the app dials it.
 */
export function isFetchableUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase();
  if (hostname.length === 0) return false;
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;
  return !BLOCKED_PATTERNS.some((pattern) => pattern.test(hostname));
}

/** Ceiling on a fetched page. The HTML parser has its own cap, but it applies after the
 * whole body has already been read into memory — which is the allocation the cap exists to
 * prevent. This one stops reading instead. */
export const MAX_RESPONSE_BYTES = 2_000_000;

/** Reads at most MAX_RESPONSE_BYTES of a response, streaming where the runtime supports it
 * and falling back to a plain read where it does not (the fallback still bounds what is
 * handed on, it just cannot bound what was buffered). */
async function readCapped(response: Response): Promise<string> {
  const body = response.body;
  if (body === null || typeof body.getReader !== "function") {
    return (await response.text()).slice(0, MAX_RESPONSE_BYTES);
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text.slice(0, MAX_RESPONSE_BYTES);
}

/** Statuses that mean "the answer is somewhere else". 303 and 307/308 included: the method
 * is always GET here, so the distinctions between them do not change what we do. */
const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/**
 * How many hops this will follow by hand.
 *
 * The reason it follows them by hand at all: neither `isFetchableUrl` nor the desktop's
 * capability scope is consulted again once the platform starts following redirects itself,
 * so a page that passes the loopback check and then answers
 * `302 Location: http://127.0.0.1:11434/…` reaches a local service — and its body comes back
 * as "evidence", shown to the learner and sent to their LLM. Every hop below is re-checked.
 */
const MAX_REDIRECTS = 3;

/** Fetches one externally-proposed page, or returns null when the address is not one we
 * will open, the request fails, or the response is not usable. Never throws. */
export async function fetchExternalPage(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  // One budget for the whole chain: a redirect loop must not buy itself extra time.
  let current = url;
  try {
    return await withRequestBudget(timeoutMs, async (signal) => {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        if (!isFetchableUrl(current)) return null;
        const response = await fetchImpl(current, { signal, maxRedirections: 0 });
        if (!REDIRECT_STATUSES.has(response.status)) {
          if (!response.ok) return null;
          return await readCapped(response as Response);
        }
        // In the browser build an unfollowed redirect arrives opaque: status 0, no headers.
        // That fails the check above already, and a redirect we cannot read is one we cannot
        // re-check, so refusing it is the only safe reading.
        const location = response.headers.get("location");
        if (location === null || location.length === 0) return null;
        current = new URL(location, current).toString();
      }
      // More hops than we are willing to follow. A legitimate source does not need four.
      return null;
    });
  } catch {
    return null;
  }
}
