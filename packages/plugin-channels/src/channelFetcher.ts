/**
 * Purpose: the one place a channel touches the network. Applies the whole discipline in order —
 * enabled check, rate limit and daily budget, backoff, conditional GET with replayed
 * ETag/If-Modified-Since, compliant or per-source User-Agent, request timeout, response size cap —
 * and returns an outcome instead of throwing, so one dead source never breaks a poll. Adapters
 * never see this class; they get a FetchContext whose `fetchUrl` is bound to their source.
 * Main exports: ChannelFetcher, ChannelFetcherOptions.
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
  type FetchContext,
  type FetchImplementation,
  type FetchOutcome,
  type SourceRequestOptions,
} from "./fetchContract";

const feedAcceptHeader =
  "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, */*;q=0.8";

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

interface ResolvedRequest {
  source: ChannelSource;
  url: string;
  enabled: boolean;
  isPoll: boolean;
  accept: string;
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

  private userAgentFor(source: ChannelSource): string {
    return source.fetchPolicy.userAgentOverride ?? this.defaultUserAgent;
  }

  /** The context adapters run against. `enabled` is the reader's per-channel switch, passed in by
   * the caller because it lives in settings, not in the catalog. */
  contextForSource(source: ChannelSource, enabled = true): FetchContext {
    return {
      userAgent: this.userAgentFor(source),
      dataSaverEnabled: this.dataSaverEnabled,
      responseSizeCapBytes: this.responseSizeCapBytes,
      requestTimeoutMilliseconds: this.requestTimeoutMilliseconds,
      fetchUrl: (url: string, options?: SourceRequestOptions) =>
        this.request({
          source,
          url,
          enabled,
          isPoll: (options?.kind ?? "follow-up") === "poll",
          accept: options?.accept ?? feedAcceptHeader,
        }),
    };
  }

  private async buildHeaders(request: ResolvedRequest): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "User-Agent": this.userAgentFor(request.source),
      Accept: request.accept,
    };
    if (!request.isPoll) return headers;
    let stored: unknown = null;
    try {
      stored = await this.conditionalRequestStore.read(request.source.id);
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

  private async request(request: ResolvedRequest): Promise<FetchOutcome> {
    if (!request.enabled) return { status: "skipped", reason: "source-disabled" };
    const allowance = this.ledger.checkAllowance(request.source.id, request.source.fetchPolicy, {
      ignoreMinimumInterval: !request.isPoll,
    });
    if (!allowance.allowed && allowance.reason !== null) {
      return { status: "skipped", reason: allowance.reason };
    }

    const headers = await this.buildHeaders(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMilliseconds);
    this.ledger.recordRequestStarted(request.source.id);
    try {
      const response = await this.fetchImplementation(request.url, {
        method: "GET",
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
      if (response.status === 304) {
        this.ledger.recordSuccess(request.source.id);
        return { status: "not-modified" };
      }
      if (!response.ok) {
        this.ledger.recordFailure(request.source.id);
        return {
          status: "failed",
          reason: response.statusText || "http error",
          httpStatus: response.status,
        };
      }
      const bounded = await readBoundedResponseBody(response, this.responseSizeCapBytes);
      if (request.isPoll) await this.rememberValidators(request.source.id, response);
      this.ledger.recordSuccess(request.source.id);
      return {
        status: "fetched",
        body: bounded.text,
        truncated: bounded.truncated,
        byteLength: bounded.byteLength,
        finalUrl: response.url || request.url,
      };
    } catch (error) {
      this.ledger.recordFailure(request.source.id);
      return { status: "failed", reason: describeFailure(error), httpStatus: null };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Polls a source's own feed address: the one request that owns the conditional-request state. */
  async fetchSource(source: ChannelSource, enabled = true): Promise<FetchOutcome> {
    return this.contextForSource(source, enabled).fetchUrl(source.endpoint.feedUrl, {
      kind: "poll",
    });
  }
}
