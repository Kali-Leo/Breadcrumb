/**
 * Purpose: read-only client for the local browsing-interest service. Every call goes through
 * one place so the failure vocabulary stays small: either the service is not running
 * ("unreachable") or it answered something we do not understand ("unexpectedResponse").
 * Main exports: DEFAULT_SERVICE_URL, BrowsingInterestServiceError, createBrowsingInterestClient.
 */
import type { z } from "zod";
import {
  browsingProfileSchema,
  emotionSeriesSchema,
  newInterestsSchema,
  proContentSchema,
  wordCloudSchema,
} from "./schemas";

/** Port and host are fixed by the service itself (it binds 127.0.0.1 only). */
export const DEFAULT_SERVICE_URL = "http://127.0.0.1:21456";

/** The subset of fetch we need — Tauri's http plugin and the platform fetch both satisfy it. */
export type ServiceFetch = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type ServiceFailure = "unreachable" | "unexpectedResponse";

export class BrowsingInterestServiceError extends Error {
  readonly failure: ServiceFailure;
  constructor(failure: ServiceFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BrowsingInterestServiceError";
    this.failure = failure;
  }
}

export interface BrowsingInterestClientOptions {
  fetch: ServiceFetch;
  baseUrl?: string;
  /** Milliseconds before a request is treated as "the service is not there". */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/** Category filter of the emotion curves — the four buttons above the chart. */
export type EmotionCategory = "all" | "pro" | "ent" | "gent";

export function createBrowsingInterestClient(options: BrowsingInterestClientOptions) {
  const baseUrl = (options.baseUrl ?? DEFAULT_SERVICE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function read<TSchema extends z.ZodType>(path: string, schema: TSchema) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let payload: unknown;
    try {
      const response = await options.fetch(`${baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) {
        throw new BrowsingInterestServiceError(
          "unexpectedResponse",
          `service answered ${response.status} for ${path}`,
        );
      }
      payload = await response.json();
    } catch (error) {
      if (error instanceof BrowsingInterestServiceError) throw error;
      throw new BrowsingInterestServiceError("unreachable", `cannot reach ${baseUrl}${path}`, {
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new BrowsingInterestServiceError(
        "unexpectedResponse",
        `unreadable answer for ${path}: ${parsed.error.message}`,
      );
    }
    return parsed.data as z.infer<TSchema>;
  }

  return {
    baseUrl,
    /** Doubles as the liveness probe: the profile is cheap and always present. */
    profile: () => read("/profile", browsingProfileSchema),
    emotionSeries: (days: number, category: EmotionCategory) =>
      read(`/emotion_series?days=${days}&cat=${category}`, emotionSeriesSchema),
    wordCloud: (days: number, source: "engage" | "expose" = "engage") =>
      read(`/wordcloud?days=${days}&source=${source}`, wordCloudSchema),
    newInterests: () => read("/new_interests", newInterestsSchema),
    proContent: (days: number) => read(`/pro_content?days=${days}`, proContentSchema),
  };
}

export type BrowsingInterestClient = ReturnType<typeof createBrowsingInterestClient>;
