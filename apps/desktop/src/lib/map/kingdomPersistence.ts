/**
 * Purpose: the kingdom view's stored state (spec 049) — the per-kingdom manual collapse set,
 * plus the one sightings pass that answers "when was this concept last met" and "is there a
 * conversation to go back to" for every member. I/O only; no display logic.
 * Main exports: KingdomPersistedState, kingdomCollapseKey, loadKingdomPersistedState,
 * persistKingdomCollapse.
 */
import { getRepos } from "../platform/db";
import { nowIso } from "../platform/time";

interface CollapsePersist {
  collapsed: string[];
  expanded: string[];
}

export interface LastSeenSighting {
  conversationId: string;
  createdAt: string;
}

export interface KingdomPersistedState {
  /** Null when this kingdom has no stored collapse choices yet — the caller keeps its own. */
  manual: { collapsed: ReadonlySet<string>; expanded: ReadonlySet<string> } | null;
  lastSeenByNode: Map<string, LastSeenSighting>;
  /** Concepts with a surviving message behind them — the only ones the "back to where this
   * was learned" link can be offered for. */
  originNodeIds: ReadonlySet<string>;
}

export function kingdomCollapseKey(kingdomNodeId: string): string {
  return `kingdomView:${kingdomNodeId}`;
}

export async function loadKingdomPersistedState(
  collapseKey: string,
  memberNodeIds: readonly string[],
): Promise<KingdomPersistedState> {
  const repos = await getRepos();
  const stored = await repos.settings.get<CollapsePersist>(collapseKey);
  const memberSet = new Set(memberNodeIds);
  const sightings = await repos.nodeSightings.listAll();
  const latest = new Map<string, LastSeenSighting>();
  for (const sighting of sightings) {
    if (!memberSet.has(sighting.node_id)) continue;
    const current = latest.get(sighting.node_id);
    if (current === undefined || sighting.created_at > current.createdAt) {
      latest.set(sighting.node_id, {
        conversationId: sighting.conversation_id,
        createdAt: sighting.created_at,
      });
    }
  }
  return {
    manual:
      stored === null
        ? null
        : { collapsed: new Set(stored.collapsed), expanded: new Set(stored.expanded) },
    lastSeenByNode: latest,
    // Same pass answers "is there a conversation to go back to": a footprint that still
    // names a message. Cheap here, and it keeps the card from offering a dead link.
    originNodeIds: new Set(
      sightings
        .filter((sighting) => memberSet.has(sighting.node_id) && sighting.message_id !== null)
        .map((sighting) => sighting.node_id),
    ),
  };
}

export async function persistKingdomCollapse(
  collapseKey: string,
  collapsed: ReadonlySet<string>,
  expanded: ReadonlySet<string>,
): Promise<void> {
  const repos = await getRepos();
  await repos.settings.set(
    collapseKey,
    { collapsed: [...collapsed], expanded: [...expanded] },
    nowIso(),
  );
}
