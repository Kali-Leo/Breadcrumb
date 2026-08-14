/**
 * Purpose: pure zero-LLM trail-card naming (spec 041 §1) — the initial-title truncation shared
 * with chatRoundContext, the "first station -> last station" auto name, first-touch station
 * labels from sightings, the freeze decision that keeps a user rename permanent, and the
 * display-name fallback. No I/O — the DB-touching orchestration lives in trailNamingActions.ts.
 * Main exports: INITIAL_TITLE_MAX_CHARS, computeInitialTitle, computeAutoTitle,
 * stationLabelsFromSightings, shouldWriteAutoTitle, displayTrailTitle.
 */
import type { NodeSightingRow } from "@breadcrumb/core-db";

/** Matches ensureChatConversationId's truncation (chatRoundContext.ts) — the initial title a
 * freshly-created chat conversation gets from its first user message. */
export const INITIAL_TITLE_MAX_CHARS = 20;

/** Same truncation rule used at conversation creation time — kept here so the freeze check
 * below and the creation path can never drift apart. */
export function computeInitialTitle(firstMessageContent: string): string {
  return firstMessageContent.length > INITIAL_TITLE_MAX_CHARS
    ? `${firstMessageContent.slice(0, INITIAL_TITLE_MAX_CHARS)}…`
    : firstMessageContent;
}

/** Auto-title's own label truncation — shorter than the initial-title one because two labels
 * share one line ("A → B"). */
const STATION_LABEL_MAX_CHARS = 8;

function truncateStationLabel(label: string): string {
  return label.length > STATION_LABEL_MAX_CHARS
    ? `${label.slice(0, STATION_LABEL_MAX_CHARS)}…`
    : label;
}

/** "First station -> last station" (spec 041 §1). Zero stations -> null (nothing to name yet,
 * the initial title stands); one station -> that station alone in brackets; two or more -> an
 * arrow between the first and the last, skipping whatever sits between them. */
export function computeAutoTitle(stationLabels: readonly string[]): string | null {
  if (stationLabels.length === 0) return null;
  if (stationLabels.length === 1) return `「${truncateStationLabel(stationLabels[0] as string)}」`;
  const first = truncateStationLabel(stationLabels[0] as string);
  const last = truncateStationLabel(stationLabels[stationLabels.length - 1] as string);
  return `${first} → ${last}`;
}

/** One conversation's stations in walking order, first-touch deduplicated by node — flattened
 * across the whole conversation (no branch/active-path distinction; auto-naming just needs
 * first and last). */
export function stationLabelsFromSightings(
  sightings: readonly NodeSightingRow[],
  labelsByNode: ReadonlyMap<string, string>,
): string[] {
  const ordered = [...sightings].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const sighting of ordered) {
    if (seen.has(sighting.node_id)) continue;
    seen.add(sighting.node_id);
    const label = labelsByNode.get(sighting.node_id);
    if (label !== undefined) labels.push(label);
  }
  return labels;
}

/** Whether a fresh auto-title computation is allowed to overwrite the stored one. A non-null
 * auto_title means auto-naming already owns the column — safe to keep updating it. A null
 * auto_title is ambiguous on its own (a brand-new conversation with no stations yet also reads
 * null), so it is only treated as "not yet renamed" when the current title still looks like the
 * untouched initial title; once a user rename replaces that title, rename() clears auto_title
 * and this same null-plus-different-title shape now reads as frozen, exactly as intended. */
export function shouldWriteAutoTitle(
  conversation: { title: string; auto_title: string | null },
  firstMessageContent: string,
): boolean {
  if (conversation.auto_title !== null) return true;
  return conversation.title === computeInitialTitle(firstMessageContent);
}

/** What the sidebar shows for one trail card (spec 041 §1): the system name when present,
 * otherwise the conversation's own title (initial or user-renamed alike). */
export function displayTrailTitle(conversation: {
  title: string;
  auto_title: string | null;
}): string {
  return conversation.auto_title ?? conversation.title;
}
