/**
 * Purpose: fills in the picture a feed did not ship (spec 053 §2) — for pooled cards that landed
 * with no cover, reads the article page's own og:image declaration and stores that address. Runs
 * behind the grid like the other background passes: display never waits for it, and a card no
 * picture could be found for is drawn without one exactly as before.
 * Side effects: at most one bounded GET per card ever, the daily budget row in settings, and
 * cover_url writes.
 * Main exports: enrichMissingCovers, PER_PASS_COVER_FETCHES, DAILY_COVER_FETCH_BUDGET.
 */
import type { DiscoveryCardKind, DiscoveryCardRow } from "@breadcrumb/core-db";
import { buildDefaultUserAgent, type FetchImplementation } from "@breadcrumb/plugin-channels";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { z } from "zod";
import { ensureDiscoveryChannelSettingsLoaded } from "../stores/discoveryChannelSettingsStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { localDayKey } from "./discoveryChannelState";
import { readCoverDeclaration, readHeadSection } from "./discoveryCoverDeclaration";
import { recordAiFailure } from "./failureLog";
import { nowIso } from "./time";

/** Pages one pass may read. A restock lands a few dozen cards, so this covers most of a round
 * without turning one background pass into a burst of requests at somebody else's server. */
export const PER_PASS_COVER_FETCHES = 20;

/** Pages a day may read. Three passes' worth: past that the day's imageless cards simply stay
 * imageless, which costs the reader a picture and nobody any bandwidth. */
export const DAILY_COVER_FETCH_BUDGET = 60;

/** Half the reader-facing article timeout: nobody is waiting on this. */
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;

/** How far down the pool one pass looks for candidates. Deeper than a day's budget, so cards
 * already asked about do not hide the ones behind them. */
const CANDIDATE_SCAN_LIMIT = 200;

const COVER_BUDGET_KEY = "discoveryCoverBudget";

/**
 * Kinds whose address is a page with a picture of its own to read. A video or a podcast episode
 * gets its picture from the channel layer (oEmbed, the feed's own artwork) and is left alone here.
 *
 * A paper is left alone too, since spec 053 T10b: a preprint's landing page has no cover — every
 * arXiv abstract declares the site's own logo as its og:image — so the pass spent its budget
 * fetching dozens of pages to write the same picture onto every paper in the pool, which turned a
 * screenful of distinct papers into a wall of one identical grey logo.
 */
const ENRICHABLE_KINDS: ReadonlySet<DiscoveryCardKind> = new Set(["article", "discussion"]);

/**
 * How many cards may share one picture before it stops counting as a picture. A site that serves
 * its own logo (or one house illustration) as every page's og:image is common enough that the
 * kind check alone does not catch it, and a grid where every tile carries the same image tells the
 * reader less than a grid of text cards does. Two cards sharing a picture is a plausible
 * coincidence — a series, a republished piece; three is a site-wide default.
 */
const SHARED_COVER_LIMIT = 3;

/**
 * The budget row, parsed rather than trusted like every other stored JSON. `triedCardIds` is the
 * one-attempt-ever marker: ids we asked about and got no picture for. It lives here rather than
 * in a new column because it is bookkeeping about a request, not a fact about the card, and a
 * sentinel written into cover_url would make that column lie. It stays bounded by being filtered
 * down to ids still in the pool on every write, against a pool that is itself capped and aged out
 * (discoveryPoolPruning) — a card that goes takes its marker with it. A card that did get a
 * picture needs no marker: cover_url is no longer NULL, so it is never a candidate again.
 */
const coverBudgetSchema = z.object({
  day: z.string().min(1),
  used: z.number().int().min(0),
  triedCardIds: z.array(z.string()).default([]),
});

type CoverBudget = z.infer<typeof coverBudgetSchema>;

async function readBudget(day: string): Promise<CoverBudget> {
  const repos = await getRepos();
  const parsed = coverBudgetSchema.safeParse(await repos.settings.get<unknown>(COVER_BUDGET_KEY));
  if (!parsed.success) return { day, used: 0, triedCardIds: [] };
  // A new day hands the allowance back; what has already been asked is not a daily thing and
  // carries over, which is the whole point of the marker.
  if (parsed.data.day !== day) return { day, used: 0, triedCardIds: parsed.data.triedCardIds };
  return parsed.data;
}

async function writeBudget(day: string, used: number, tried: ReadonlySet<string>): Promise<void> {
  const repos = await getRepos();
  const pooled = new Set(await repos.discovery.listCardIds());
  await repos.settings.set(
    COVER_BUDGET_KEY,
    { day, used, triedCardIds: [...tried].filter((id) => pooled.has(id)) },
    nowIso(),
  );
}

function isEnrichable(card: DiscoveryCardRow): boolean {
  if (card.kind === null || !ENRICHABLE_KINDS.has(card.kind)) return false;
  const address = card.url ?? "";
  return address.startsWith("https://") || address.startsWith("http://");
}

function looksLikeHtml(contentType: string | null): boolean {
  if (contentType === null) return true; // no header: read it and let the parser decide
  const value = contentType.toLowerCase();
  return value.includes("text/html") || value.includes("application/xhtml");
}

/**
 * One page, one request, to the card's own address and nowhere else — no image is fetched and no
 * third party is contacted; the declared picture is only written down. The timeout is a
 * controller we disarm on the way out rather than AbortSignal.timeout, for the reason article
 * extraction documents (spec 053 T10): a signal that stays armed after the body is read aborts a
 * freed request and rejects into nobody's hands.
 */
async function lookUpCover(
  address: string,
  fetchImpl: FetchImplementation,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetchImpl(address, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": buildDefaultUserAgent() },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    if (!looksLikeHtml(response.headers.get("content-type"))) return null;
    return readCoverDeclaration(await readHeadSection(response), address);
  } catch {
    // Unreachable host, timeout, blocked request, malformed page: all the same thing from here —
    // this card has no picture, which is a state the grid already draws.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface CoverEnrichmentOptions {
  /** Swapped in tests; production always uses Tauri's HTTP client. */
  fetchImpl?: FetchImplementation;
  now?: Date;
}

async function runCoverPass(options: CoverEnrichmentOptions): Promise<number> {
  try {
    if (!useSettingsStore.getState().networkEnabled) return 0;
    if ((await ensureDiscoveryChannelSettingsLoaded()).dataSaverEnabled) return 0;

    const day = localDayKey(options.now ?? new Date());
    const budget = await readBudget(day);
    const allowance = Math.min(PER_PASS_COVER_FETCHES, DAILY_COVER_FETCH_BUDGET - budget.used);
    if (allowance <= 0) return 0;

    const repos = await getRepos();
    const tried = new Set(budget.triedCardIds);
    const pool = await repos.discovery.listCardsMissingCover(CANDIDATE_SCAN_LIMIT);
    const candidates = pool
      .filter((card) => !tried.has(card.id) && isEnrichable(card))
      .slice(0, allowance);
    if (candidates.length === 0) return 0;

    const fetchImpl = options.fetchImpl ?? tauriFetch;
    let filled = 0;
    for (const card of candidates) {
      const cover = await lookUpCover(card.url ?? "", fetchImpl);
      // A picture the pool is already full of is the site's furniture, not this card's cover:
      // the card keeps its text-forward layout, and it is marked as asked so the same page is
      // never read for the same logo twice.
      const siteWide =
        cover !== null &&
        (await repos.discovery.countCardsWithCoverUrl(cover)) >= SHARED_COVER_LIMIT;
      if (cover === null || siteWide) {
        tried.add(card.id);
      } else {
        await repos.discovery.setCardCoverUrl(card.id, cover);
        filled += 1;
      }
    }
    await writeBudget(day, budget.used + candidates.length, tried);
    return filled;
  } catch (error) {
    await recordAiFailure("discovery", error);
    return 0;
  }
}

let passInFlight: Promise<number> | null = null;

/**
 * One pass over the imageless end of the pool. Returns how many covers it actually filled in.
 * Costs nothing at all — not one request — while 省流量模式 is on or networking is off, and asks
 * about any one card exactly once in its whole life in the pool.
 *
 * Two passes never run at once, the way the restock task holds one round (discoveryRestockTask):
 * a background pass is started behind every restock and a later restock can begin while the last
 * one's work is still in the air, and two overlapping passes would each read the budget row before
 * either wrote it — the same twenty pages fetched twice, against a day's allowance that only
 * counted once. Whoever arrives second joins the round already running.
 */
export function enrichMissingCovers(options: CoverEnrichmentOptions = {}): Promise<number> {
  passInFlight ??= runCoverPass(options).finally(() => {
    passInFlight = null;
  });
  return passInFlight;
}
