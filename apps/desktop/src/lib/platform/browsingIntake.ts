/**
 * Purpose: the one door every browsing event comes through, whichever channel carried it —
 * the loopback listener on the desktop, a `postMessage` from the same page's own window in the
 * browser. Parse, classify, store, and move the interest profile forward. Nothing else in the
 * app writes to `browsing_events`.
 *
 * Classification here is layer A only: the n-gram model in feature-browsing-interest, which is
 * synchronous, needs no download and cannot fail. Every event therefore has a topic the moment
 * it lands and the page is never empty waiting for a model. The better, embedding-backed layer
 * runs afterwards and in the background (./browsingUpgrade).
 *
 * Duplicates are settled here as well as in the schema. The UNIQUE index makes a repeated
 * insert a no-op, but the profile is an accumulator: crediting a re-delivered batch twice would
 * quietly distort every share on the page, and a collector re-sends any batch it did not get an
 * answer for. So the batch is compared against what is already stored and only genuinely new
 * rows are both written and deposited.
 * Main exports: receiveBrowsingEvents, IntakeResult.
 */
import {
  type BrowsingEventRow,
  browsingEventSchema,
  createProfileState,
  type InterestProfileState,
  ingestEvent,
  normalizeEvent,
  resolveClassification,
  topicProbabilities,
} from "@breadcrumb/feature-browsing-interest";
import { getRepos } from "./db";
import { degradeSilently } from "./failureLog";

export interface IntakeResult {
  /** How many entries the payload held that were shaped like an event at all. */
  readonly received: number;
  /** How many were new — the rest were already recorded and were credited to nothing. */
  readonly stored: number;
}

const NOTHING: IntakeResult = { received: 0, stored: 0 };

/** One collector batch, start to finish. Never throws: a channel handler has nobody to report
 * to, and losing a batch of browsing history must never take a page down with it. */
export async function receiveBrowsingEvents(payload: unknown): Promise<IntakeResult> {
  if (!Array.isArray(payload) || payload.length === 0) return NOTHING;
  const now = Date.now() / 1000;
  const rows = classifyBatch(payload, now);
  if (rows.length === 0) return NOTHING;
  try {
    const repos = await getRepos();
    const fresh = await withoutAlreadyStored(repos.browsingEvents, rows);
    for (const row of fresh) await repos.browsingEvents.insert(row);
    if (fresh.length > 0) await depositIntoProfile(repos.browsingEvents, fresh, now);
    return { received: rows.length, stored: fresh.length };
  } catch (error) {
    void degradeSilently("browsing-intake", error);
    return { received: rows.length, stored: 0 };
  }
}

/** Wire values in, stored rows out. An entry that is not an event at all is dropped without
 * comment: the payload comes from a script running in someone else's page, and one malformed
 * entry must cost that entry and nothing else. */
function classifyBatch(payload: readonly unknown[], now: number): BrowsingEventRow[] {
  const rows: BrowsingEventRow[] = [];
  for (const entry of payload) {
    const parsed = browsingEventSchema.safeParse(entry);
    if (!parsed.success) continue;
    const event = parsed.data;
    const classification = resolveClassification({
      ngram: { topicProbabilities: topicProbabilities(event.t, event.u) },
      embedding: null,
      // Layer B is never consulted on arrival: it is asynchronous, and an event that waits
      // for a 113 MB model is an event the page does not have.
      embeddingAvailable: false,
    });
    if (classification === null) continue;
    rows.push(normalizeEvent(event, classification, now));
  }
  return rows;
}

/** The key the schema deduplicates on. */
function keyOf(row: { ts: number; vid: string; etype: string }): string {
  return `${row.ts} ${row.vid} ${row.etype}`;
}

type EventStore = Awaited<ReturnType<typeof getRepos>>["browsingEvents"];

/**
 * Drops the rows already in the table, and any repeat inside the batch itself.
 *
 * The read is bounded by the batch's own oldest event rather than by a fixed window, because
 * that is exactly the range a duplicate could be hiding in. A collector that queued for a
 * fortnight offline makes this one read wide, once.
 */
async function withoutAlreadyStored(
  store: EventStore,
  rows: readonly BrowsingEventRow[],
): Promise<BrowsingEventRow[]> {
  const oldest = Math.min(...rows.map((row) => row.ts));
  const existing = new Set((await store.listSince(oldest)).map(keyOf));
  const fresh: BrowsingEventRow[] = [];
  for (const row of rows) {
    const key = keyOf(row);
    if (existing.has(key)) continue;
    existing.add(key);
    fresh.push(row);
  }
  return fresh;
}

/**
 * Deposits the new events into the two-timescale profile and saves the snapshot.
 *
 * Oldest first, because the profile's clock only moves forward: feeding a batch out of order
 * would decay the accumulators to the newest event and then deposit the older ones as though
 * no time had passed. The distribution deposited is the n-gram one recomputed from the stored
 * title — the same input that produced the stored topic, so a row and the profile can never
 * disagree about what an event was about.
 */
async function depositIntoProfile(
  store: EventStore,
  rows: readonly BrowsingEventRow[],
  now: number,
): Promise<void> {
  const state: InterestProfileState = (await store.loadProfile()) ?? createProfileState();
  for (const row of [...rows].sort((left, right) => left.ts - right.ts)) {
    ingestEvent(
      state,
      topicProbabilities(row.title, row.up),
      { type: row.etype, dwell: row.dwell, ts: row.ts },
      now,
    );
  }
  await store.saveProfile(state);
}
