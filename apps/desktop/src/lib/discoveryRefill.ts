/**
 * Purpose: keeps the discovery pool stocked (spec 053 §3) — when fewer than 30 unseen cards are
 * left, one round of channel polling, and active recall on top of it if the pool is still thin,
 * restocks toward 100. The pool is what the feed reads from, so this runs behind the feed and
 * never blocks it: cards land displayable, and quality scoring and embedding follow them.
 * Side effects: network requests through the channel layer, card inserts, and the background
 * passes it hands back to the caller.
 * Main exports: refillDiscoveryPool, RefillOutcome, POOL_LOW_WATERMARK, POOL_TARGET_SIZE.
 */
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { runBackgroundPasses } from "./discoveryBackgroundPasses";
import { pollChannelsForCandidates } from "./discoveryChannels";
import { type CandidateGroup, landCandidateItems } from "./discoveryPoolLanding";
import { runActiveRecall } from "./discoveryRecall";
import { nowIso } from "./time";

/** Below this many unseen cards, a restock starts. Comfortably more than one screen, so the
 * reader never scrolls into the bottom of the pool while it is being refilled. */
export const POOL_LOW_WATERMARK = 30;

/** What a restock aims for. Enough to keep the feed working through a few days offline. */
export const POOL_TARGET_SIZE = 100;

/**
 * The same plain line the feed has always shown when there are no new cards to be had. It says
 * what is true and what still works, and it is not an error (product principle 1) — it is only
 * ever shown when the pool is empty as well, which is a first run with no network.
 */
export const NOTHING_NEW_REASON = "翻过的卡片还能读；新卡片需要联网和开关。";

export interface RefillOutcome {
  /** "stocked" — the pool was already above the low mark and nothing was fetched.
   *  "refilled" — a fetching round ran (it may still have found nothing new).
   *  "unavailable" — no channel could be reached, so the pool is whatever it already was. */
  kind: "stocked" | "refilled" | "unavailable";
  landedCount: number;
  /** Unseen cards in the pool after this call. */
  unseenCount: number;
  /** Plain-language line for the feed, set only when nothing could be fetched. */
  reason: string | null;
  /** Quality scoring and embedding, already running behind the cards that just landed. Awaited
   * only by tests and by callers that have nothing better to do. */
  backgroundWork: Promise<void>;
}

/**
 * Unseen cards actually available to the feed: cards the reader never opened, minus the ones
 * they said they were not interested in. The subtraction is deliberately generous (it counts
 * every dislike, including ones on cards that were opened first), which can only make a restock
 * start slightly early — the safe direction to be wrong in.
 */
async function countAvailableUnseenCards(): Promise<number> {
  const repos = await getRepos();
  const [unseen, events] = await Promise.all([
    repos.discovery.countUnseenPoolCards(),
    repos.discovery.listAllEvents(),
  ]);
  const dislikedIds = new Set(
    events.filter((event) => event.kind === "dislike").map((event) => event.card_id),
  );
  return Math.max(0, unseen - dislikedIds.size);
}

export interface RefillOptions {
  /** Skips the watermark check — used by an explicit "give me more" at the end of the feed. */
  force?: boolean;
  now?: Date;
}

/**
 * One restock round. Returns without touching the network while the pool is above the low mark,
 * and returns "unavailable" — silently, with the plain line attached for the caller to use or
 * ignore — when networking is off or nothing out there answered.
 */
export async function refillDiscoveryPool(options: RefillOptions = {}): Promise<RefillOutcome> {
  const now = options.now ?? new Date();
  const unseenBefore = await countAvailableUnseenCards();
  if (!options.force && unseenBefore >= POOL_LOW_WATERMARK) {
    return {
      kind: "stocked",
      landedCount: 0,
      unseenCount: unseenBefore,
      reason: null,
      backgroundWork: runBackgroundPasses([]),
    };
  }
  if (!useSettingsStore.getState().networkEnabled) {
    return {
      kind: "unavailable",
      landedCount: 0,
      unseenCount: unseenBefore,
      reason: NOTHING_NEW_REASON,
      backgroundWork: Promise.resolve(),
    };
  }

  const poll = await pollChannelsForCandidates({ now: () => now });
  const landed = await landCandidateItems([{ items: poll.items }], nowIso());

  // Still thin after everything the world published on its own: go and look for what this
  // reader in particular has been reading about.
  let recalled: typeof landed = [];
  if (unseenBefore + landed.length < POOL_TARGET_SIZE) {
    const recall = await runActiveRecall(now);
    const groups: CandidateGroup[] = recall.harvests.map((harvest) => ({
      items: harvest.items,
      topicLabel: harvest.query,
      source: "nearby",
    }));
    recalled = await landCandidateItems(groups, nowIso());
  }

  const allLanded = [...landed, ...recalled];
  const backgroundWork = runBackgroundPasses(allLanded);
  if (allLanded.length === 0 && poll.answeredSourceCount === 0) {
    return {
      kind: "unavailable",
      landedCount: 0,
      unseenCount: unseenBefore,
      reason: NOTHING_NEW_REASON,
      backgroundWork,
    };
  }
  return {
    kind: "refilled",
    landedCount: allLanded.length,
    unseenCount: unseenBefore + allLanded.length,
    reason: null,
    backgroundWork,
  };
}
