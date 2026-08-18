/**
 * Purpose: the shared vocabulary of the fetch-discipline layer — the injectable fetch function
 * (so the desktop app can hand in Tauri's HTTP client), the conditional-request state we persist
 * between polls, the outcome union callers switch on, and the FetchContext adapters receive. No
 * I/O happens here.
 * Main exports: FetchImplementation, conditionalRequestStateSchema, ConditionalRequestStore,
 * FetchOutcome, FetchContext, SourceRequestOptions, buildDefaultUserAgent, defaults.
 */
import { z } from "zod";

/** A `fetch`-shaped function. Node's global fetch and Tauri's plugin-http fetch both satisfy it. */
export type FetchImplementation = (url: string, init: RequestInit) => Promise<Response>;

/** What a source told us last time, replayed as If-None-Match / If-Modified-Since. Persisted by
 * the caller (channel_state row in SQLite), so it comes back as external input and is revalidated. */
export const conditionalRequestStateSchema = z.object({
  etag: z.string().min(1).nullable(),
  lastModified: z.string().min(1).nullable(),
});

export type ConditionalRequestState = z.infer<typeof conditionalRequestStateSchema>;

/** Caller-supplied persistence. Reads that throw or return junk are treated as "no state" by the
 * fetcher — a lost ETag costs bandwidth, never correctness. */
export interface ConditionalRequestStore {
  read(sourceId: string): Promise<unknown>;
  write(sourceId: string, state: ConditionalRequestState): Promise<void>;
}

export type FetchSkipReason =
  | "source-disabled"
  | "minimum-interval"
  | "daily-budget"
  | "backoff"
  /** A shared per-service ceiling this one source does not own — iTunes' twenty calls a minute,
   * counted across every catalog entry that talks to it. The poll makes no request at all rather
   * than waiting for room. */
  | "service-rate-limit"
  /** The source only answers searches (iTunes podcast discovery); there is nothing to poll. */
  | "not-pollable"
  /** A catalog template whose parameters the reader has not filled in yet (豆瓣 user id). */
  | "template-not-filled";

export type FetchOutcome =
  | {
      status: "fetched";
      /** Decoded payload, already cut to the size cap when `truncated` is true. */
      body: string;
      truncated: boolean;
      byteLength: number;
      /** Post-redirect address — Substack custom domains 301, and relative links resolve
       * against this, not against the catalog URL. */
      finalUrl: string;
    }
  | { status: "not-modified" }
  | { status: "skipped"; reason: FetchSkipReason }
  | { status: "failed"; reason: string; httpStatus: number | null };

/**
 * Why a request is being made. A poll is the source's own scheduled feed read: it owns the
 * conditional-request state and waits out the minimum interval. A follow-up is an extra request an
 * adapter needs to finish that poll or answer a search (a Discourse topic body, an Algolia query),
 * so it spends daily budget and obeys backoff but does not wait out the poll interval.
 */
export type SourceRequestKind = "poll" | "follow-up";

export interface SourceRequestOptions {
  /** Defaults to "follow-up": only the fetcher's own poll path claims the conditional state. */
  kind?: SourceRequestKind;
  /** Replaces the feed Accept header, for the JSON endpoints. */
  accept?: string;
}

/**
 * What adapters are allowed to know about the current request environment, including the single
 * door to the network: `fetchUrl` comes bound to one catalog source and already carries that
 * source's whole discipline (enabled switch, rate limit, daily budget, backoff, User-Agent,
 * timeout, size cap). `dataSaverEnabled` is the standing instruction: while it is on, an adapter
 * must not issue image requests.
 */
export interface FetchContext {
  readonly userAgent: string;
  readonly dataSaverEnabled: boolean;
  readonly responseSizeCapBytes: number;
  readonly requestTimeoutMilliseconds: number;
  readonly fetchUrl: (url: string, options?: SourceRequestOptions) => Promise<FetchOutcome>;
}

/** Accept header for the API endpoints (V2EX, Algolia, Discourse topics, iTunes, oEmbed). */
export const jsonAcceptHeader = "application/json, text/json;q=0.9, */*;q=0.8";

/** 5 MB. The survey measured an 18.5 MB podcast feed; past this we truncate and flag. */
export const defaultResponseSizeCapBytes = 5 * 1024 * 1024;

export const defaultRequestTimeoutMilliseconds = 20_000;

/** Backoff after consecutive failures: 1 minute doubling up to 6 hours. */
export const defaultBaseBackoffMilliseconds = 60_000;

export const defaultMaximumBackoffMilliseconds = 6 * 60 * 60 * 1000;

export const breadcrumbClientVersion = "0.0.1";

export const breadcrumbContactUrl = "https://github.com/Kali-Leo/Breadcrumb";

/** Wikipedia's 2026 rules and Podcast Index both require a contact-bearing User-Agent; this is
 * the format they ask for. Per-source overrides live in the catalog's fetchPolicy. */
export function buildDefaultUserAgent(appVersion: string = breadcrumbClientVersion): string {
  return `Breadcrumb/${appVersion} (+${breadcrumbContactUrl})`;
}
