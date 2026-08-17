/**
 * Purpose: the things that must be true of the discovery feed no matter what happened — the grid
 * never holds one card twice, everything on it exists in the pool, the pool's counts are
 * arithmetically possible, every recorded event is a shape the interest model can fold, and no
 * card's title or hook carries live markup out of a feed. Returns a list of plain sentences
 * rather than throwing, so a hunting run can report every problem it found at once.
 * Main exports: checkPipelineInvariants, PipelineInvariantInput.
 */
import type { DiscoveryCardRow, DiscoveryEventKind } from "@breadcrumb/core-db";
import type { DesktopRepos } from "./desktopDatabase";

const KNOWN_EVENT_KINDS: readonly DiscoveryEventKind[] = [
  "impression",
  "open",
  "dwell",
  "dislike",
  "save",
  "unsave",
  "finish",
  "onboarding",
  "dial",
];

/** Markup that must never reach a card field: the adapters strip HTML to plain text, so anything
 * that still looks like a live tag got past them. Checked separately from the rest — see
 * findLiveMarkupCards and the hunting suite's note on it. */
const LIVE_MARKUP = /<\s*(script|img|iframe|svg|object|embed|style)\b/i;

/** Pooled cards whose title or hook still carries something that reads as a live tag. */
export function findLiveMarkupCards(
  pool: readonly DiscoveryCardRow[],
): { id: string; field: "title" | "hook"; text: string }[] {
  const found: { id: string; field: "title" | "hook"; text: string }[] = [];
  for (const card of pool) {
    if (LIVE_MARKUP.test(card.title)) found.push({ id: card.id, field: "title", text: card.title });
    if (LIVE_MARKUP.test(card.hook)) found.push({ id: card.id, field: "hook", text: card.hook });
  }
  return found;
}

export interface PipelineInvariantInput {
  repos: DesktopRepos;
  /** Grid snapshots taken through the session. */
  displayed: readonly (readonly DiscoveryCardRow[])[];
}

function duplicateIds(cards: readonly DiscoveryCardRow[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const card of cards) {
    if (seen.has(card.id)) repeated.add(card.id);
    seen.add(card.id);
  }
  return [...repeated];
}

export async function checkPipelineInvariants(input: PipelineInvariantInput): Promise<string[]> {
  const problems: string[] = [];
  const pool = await input.repos.discovery.listNewestCards(100_000);
  const poolIds = new Set(pool.map((card) => card.id));

  for (const [index, snapshot] of input.displayed.entries()) {
    const repeated = duplicateIds(snapshot);
    if (repeated.length > 0) {
      problems.push(`grid snapshot ${index} showed ${repeated.length} card(s) twice`);
    }
    const orphans = snapshot.filter((card) => !poolIds.has(card.id));
    if (orphans.length > 0) {
      problems.push(`grid snapshot ${index} showed ${orphans.length} card(s) not in the pool`);
    }
  }

  const unseen = await input.repos.discovery.countUnseenPoolCards();
  if (unseen < 0) problems.push(`unseen pool count went negative (${unseen})`);
  if (unseen > pool.length) {
    problems.push(`unseen pool count ${unseen} exceeds the pool's ${pool.length} cards`);
  }
  if (new Set(pool.map((card) => card.id)).size !== pool.length) {
    problems.push("the pool holds two rows with the same id");
  }

  for (const card of pool) {
    if (card.title.length === 0) problems.push(`card ${card.id} landed with an empty title`);
    if (card.quality_score !== null && (card.quality_score < 0 || card.quality_score > 1)) {
      problems.push(`card ${card.id} has an out-of-range quality score ${card.quality_score}`);
    }
    if (card.url !== null && !/^https?:\/\//.test(card.url)) {
      problems.push(`card ${card.id} landed with a non-http address ${card.url}`);
    }
    if (card.cover_url !== null && !/^https?:\/\//.test(card.cover_url)) {
      problems.push(`card ${card.id} landed with a non-http cover ${card.cover_url}`);
    }
  }

  const events = await input.repos.discovery.listAllEvents();
  for (const event of events) {
    if (!KNOWN_EVENT_KINDS.includes(event.kind)) {
      problems.push(`event ${event.id} has unknown kind ${event.kind}`);
      continue;
    }
    if (event.value_ms !== null && !Number.isFinite(event.value_ms)) {
      problems.push(`event ${event.id} (${event.kind}) has a non-finite value ${event.value_ms}`);
    }
    if (event.kind === "dwell" && (event.value_ms === null || (event.value_ms ?? 0) <= 0)) {
      problems.push(`dwell event ${event.id} recorded a non-positive duration ${event.value_ms}`);
    }
    if (event.kind !== "dial" && event.kind !== "onboarding" && event.card_id.length === 0) {
      problems.push(`event ${event.id} (${event.kind}) has no card`);
    }
  }

  const saved = await input.repos.discovery.listSaved();
  if (saved.some((card) => card.saved_at === null)) {
    problems.push("a card is in the 收藏 list without a saved instant");
  }
  return problems;
}
