/**
 * Purpose: the one place a channel touches the network. Applies the whole discipline in order —
 * enabled check, rate limit and daily budget, backoff, conditional GET with replayed
 * ETag/If-Modified-Since, compliant or per-source User-Agent, request timeout, response size cap —
 * and returns an outcome instead of throwing, so one dead source never breaks a poll.
 * Main exports: ChannelFetcher, ChannelFetcherOptions, FetchContext.
 */
import { readBoundedResponseBody } from "./boundedBody";
import type { ChannelSource } from "./channelCatalog";
import { FetchBudgetLedger } from "./fetchBudget";
import {
  buildDefaultUserAgent,
  type ConditionalRequestState,
  type ConditionalRequestStore,
  conditionalRequestStateSchema,
  defaultRequestTimeoutMilliseconds,
  defaultResponseSizeCapBytes,
  type FetchImplementation,
  type FetchOutcome,
} from "./fetchContract";

const feedAcceptHeader =
  "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, */*;q=0.8";

/** What adapters are allowed to know about the current request environment. `dataSaverEnabled`
 * is the standing instruction: while it is on, an adapter must not issue image requests. */
export interface FetchContext {
  readonly userAgent: string;
  readonly dataSaverEnabled: boolean;
  readonly responseSizeCapBytes: number;
  readonly requestTimeoutMilliseconds: number;
}

export interface ChannelFetcherOptions {
  fetchImplementation: FetchImplementation;
  conditionalRequestStore: ConditionalRequestStore;
  /** Overrides the generated `Breadcrumb/<version> (+url)` string outright. */
  userAgent?: string;
  appVersion?: string;
  responseSizeCapBytes?: number;
  requestTimeoutMilliseconds?: number;
  dataSaverEnabled?: boolean;
  ledger?: FetchBudgetLedger;
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** A stored conditional-request row that is missing or malformed simply means "ask unconditionally". */
function toConditionalState(value: unknown): ConditionalRequestState | null {
  const parsed = conditionalRequestStateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export class ChannelFetcher {
  readonly ledger: FetchBudgetLedger;
  private readonly fetchImplementation: FetchImplementation;
  private readonly conditionalRequestStore: ConditionalRequestStore;
  private readonly defaultUserAgent: string;
  private readonly responseSizeCapBytes: number;
  private readonly requestTimeoutMilliseconds: number;
  private dataSaverEnabled: boolean;

  constructor(options: ChannelFetcherOptions) {
    this.fetchImplementation = options.fetchImplementation;
    this.conditionalRequestStore = options.conditionalRequestStore;
    this.defaultUserAgent = options.userAgent ?? buildDefaultUserAgent(options.appVersion);
    this.responseSizeCapBytes = options.responseSizeCapBytes ?? defaultResponseSizeCapBytes;
    this.requestTimeoutMilliseconds =
      options.requestTimeoutMilliseconds ?? defaultRequestTimeoutMilliseconds;
    this.dataSaverEnabled = options.dataSaverEnabled ?? false;
    this.ledger = options.ledger ?? new FetchBudgetLedger();
  }

  /** Settings toggle: the reader turns data saver on and off while the app runs. */
  setDataSaverEnabled(enabled: boolean): void {
    this.dataSaverEnabled = enabled;
  }

  contextForSource(source: ChannelSource): FetchContext {
    return {
      userAgent: source.fetchPolicy.userAgentOverride ?? this.defaultUserAgent,
      dataSaverEnabled: this.dataSaverEnabled,
      responseSizeCapBytes: this.responseSizeCapBytes,
      requestTimeoutMilliseconds: this.requestTimeoutMilliseconds,
    };
  }

  private async buildHeaders(source: ChannelSource): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "User-Agent": this.contextForSource(source).userAgent,
      Accept: feedAcceptHeader,
    };
    let stored: unknown = null;
    try {
      stored = await this.conditionalRequestStore.read(source.id);
    } catch {
      stored = null;
    }
    const state = toConditionalState(stored);
    if (state?.etag) headers["If-None-Match"] = state.etag;
    if (state?.lastModified) headers["If-Modified-Since"] = state.lastModified;
    return headers;
  }

  private async rememberValidators(sourceId: string, response: Response): Promise<void> {
    const state: ConditionalRequestState = {
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
    };
    try {
      await this.conditionalRequestStore.write(sourceId, state);
    } catch {
      // A failed write only costs bandwidth on the next poll; the payload in hand is still good.
    }
  }

  /**
   * Fetches one source's endpoint. `enabled` is the reader's per-channel switch, passed in by the
   * caller because it lives in settings, not in the catalog.
   */
  async fetchSource(source: ChannelSource, enabled = true): Promise<FetchOutcome> {
    if (!enabled) return { status: "skipped", reason: "source-disabled" };
    const allowance = this.ledger.checkAllowance(source.id, source.fetchPolicy);
    if (!allowance.allowed && allowance.reason !== null) {
      return { status: "skipped", reason: allowance.reason };
    }

    const headers = await this.buildHeaders(source);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMilliseconds);
    this.ledger.recordRequestStarted(source.id);
    try {
      const response = await this.fetchImplementation(source.endpoint.feedUrl, {
        method: "GET",
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.status === 304) {
        this.ledger.recordSuccess(source.id);
        return { status: "not-modified" };
      }
      if (!response.ok) {
        this.ledger.recordFailure(source.id);
        return {
          status: "failed",
          reason: response.statusText || "http error",
          httpStatus: response.status,
        };
      }
      const bounded = await readBoundedResponseBody(response, this.responseSizeCapBytes);
      await this.rememberValidators(source.id, response);
      this.ledger.recordSuccess(source.id);
      return {
        status: "fetched",
        body: bounded.text,
        truncated: bounded.truncated,
        byteLength: bounded.byteLength,
        finalUrl: response.url || source.endpoint.feedUrl,
      };
    } catch (error) {
      this.ledger.recordFailure(source.id);
      return { status: "failed", reason: describeFailure(error), httpStatus: null };
    } finally {
      clearTimeout(timeout);
    }
  }
}
