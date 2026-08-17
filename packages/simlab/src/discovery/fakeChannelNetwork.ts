/**
 * Purpose: a `fetch`-shaped double for the whole channel layer — test files hand it to
 * `vi.mock` for `@tauri-apps/plugin-http`, so ChannelFetcher, every adapter and the conditional
 * -request discipline all run for real against synthetic payloads. Never touches a socket.
 * Routes are matched by exact address first, then by the first registered prefix, which is what
 * search endpoints need (the query string is built inside the adapter).
 * Main exports: FakeChannelNetwork, createFakeChannelNetwork.
 */

export interface FakeRouteResponse {
  body: string;
  /** Defaults to 200. 304 exercises the conditional-request path, 5xx the failure/backoff path. */
  status?: number;
  contentType?: string;
  /** Served as the ETag header, and honoured on the next If-None-Match: a repeat poll with a
   * matching validator answers 304 with no body, exactly like a real feed. */
  etag?: string;
}

export interface RecordedFetch {
  url: string;
  headers: Record<string, string>;
  atMillis: number;
}

type RouteAnswer = FakeRouteResponse | ((url: string) => FakeRouteResponse);

export interface FakeChannelNetwork {
  /** Registers (or replaces) the answer for one exact address. */
  route(url: string, answer: RouteAnswer): void;
  /** Registers an answer for every address starting with `prefix` — search endpoints. */
  routePrefix(prefix: string, answer: RouteAnswer): void;
  /** Drops every route: from here on the whole world is unreachable (the offline week). */
  disconnect(): void;
  /** True while disconnected. */
  readonly offline: boolean;
  reconnect(): void;
  readonly requests: RecordedFetch[];
  requestsFor(urlPart: string): RecordedFetch[];
  clearRequests(): void;
  /** The FetchImplementation itself. */
  fetch(url: string, init?: RequestInit): Promise<Response>;
}

function headersToRecord(init: RequestInit | undefined): Record<string, string> {
  const raw = init?.headers;
  if (raw === undefined) return {};
  const entries =
    raw instanceof Headers
      ? [...raw.entries()]
      : Array.isArray(raw)
        ? raw.map(([key, value]) => [key, value] as const)
        : Object.entries(raw);
  const record: Record<string, string> = {};
  for (const [key, value] of entries) record[key.toLowerCase()] = String(value);
  return record;
}

export function createFakeChannelNetwork(): FakeChannelNetwork {
  const exact = new Map<string, RouteAnswer>();
  const prefixes: { prefix: string; answer: RouteAnswer }[] = [];
  const requests: RecordedFetch[] = [];
  let offline = false;

  const resolve = (url: string): RouteAnswer | undefined => {
    const direct = exact.get(url);
    if (direct !== undefined) return direct;
    return prefixes.find((entry) => url.startsWith(entry.prefix))?.answer;
  };

  const network: FakeChannelNetwork = {
    route(url, answer) {
      exact.set(url, answer);
    },
    routePrefix(prefix, answer) {
      const existing = prefixes.findIndex((entry) => entry.prefix === prefix);
      if (existing >= 0) prefixes.splice(existing, 1, { prefix, answer });
      else prefixes.push({ prefix, answer });
    },
    disconnect() {
      offline = true;
    },
    reconnect() {
      offline = false;
    },
    get offline() {
      return offline;
    },
    requests,
    requestsFor(urlPart) {
      return requests.filter((entry) => entry.url.includes(urlPart));
    },
    clearRequests() {
      requests.length = 0;
    },
    async fetch(url, init) {
      const headers = headersToRecord(init);
      requests.push({ url, headers, atMillis: Date.now() });
      if (offline) {
        // What a machine with no route to the internet actually does: the promise rejects.
        throw new TypeError(`fetch failed: ${url}`);
      }
      const answer = resolve(url);
      if (answer === undefined) {
        return new Response("not found", { status: 404, statusText: "Not Found" });
      }
      const resolved = typeof answer === "function" ? answer(url) : answer;
      const status = resolved.status ?? 200;
      const responseHeaders: Record<string, string> = {
        "content-type": resolved.contentType ?? "application/xml; charset=utf-8",
      };
      if (resolved.etag !== undefined) responseHeaders.etag = resolved.etag;
      if (
        resolved.etag !== undefined &&
        headers["if-none-match"] === resolved.etag &&
        status === 200
      ) {
        return new Response(null, { status: 304, statusText: "Not Modified" });
      }
      const body = status === 304 ? null : resolved.body;
      return new Response(body, {
        status,
        statusText: status === 200 ? "OK" : `status ${status}`,
        headers: responseHeaders,
      });
    },
  };
  return network;
}
