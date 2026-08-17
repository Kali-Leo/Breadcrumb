/**
 * Purpose: what one poll of one source produced — the network outcome plus whatever candidate
 * items came out of it. Every adapter returns this shape, so the pipeline can treat a dead source,
 * an unchanged source and a productive source the same way instead of branching per channel.
 * Main exports: SourceFetchResult, outcomeOnlyResult, resultFromFeedAdapter.
 */
import type { CandidateItem } from "./candidateItem";
import type { FetchOutcome } from "./fetchContract";
import type { FeedAdapterResult } from "./genericFeedAdapter";

export interface SourceFetchResult {
  sourceId: string;
  /** The poll request's own outcome: fetched, not-modified, skipped or failed. */
  outcome: FetchOutcome;
  items: CandidateItem[];
  /** Entries dropped for failing validation, having no usable link, or repeating an id. */
  skippedEntryCount: number;
  /** Set when the payload could not be read at all. Never thrown — a poll degrades, it does not
   * raise. */
  parseError: string | null;
  /** True when the size cap cut the payload and the complete entries were salvaged. */
  repairedFromTruncation: boolean;
  /** Extra requests this poll spent past the first one (Discourse topic bodies). */
  followUpRequestCount: number;
}

/** For the polls that never got a payload: skipped, not modified, or failed. */
export function outcomeOnlyResult(sourceId: string, outcome: FetchOutcome): SourceFetchResult {
  return {
    sourceId,
    outcome,
    items: [],
    skippedEntryCount: 0,
    parseError: null,
    repairedFromTruncation: false,
    followUpRequestCount: 0,
  };
}

export function resultFromFeedAdapter(
  sourceId: string,
  outcome: FetchOutcome,
  parsed: FeedAdapterResult,
): SourceFetchResult {
  return {
    sourceId,
    outcome,
    items: parsed.items,
    skippedEntryCount: parsed.skippedEntryCount,
    parseError: parsed.parseError,
    repairedFromTruncation: parsed.repairedFromTruncation,
    followUpRequestCount: 0,
  };
}
