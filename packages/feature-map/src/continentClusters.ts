/**
 * Purpose: the cluster half of continent derivation (spec 031) — childless orphan roots that no
 * tree continent claims gather by embedding similarity into a continent of member-kingdoms, and
 * whatever refuses to cluster leaves as an unnamed islet. Also owns layoutMemberIds, the
 * layout-day member filter the tree half in continents.ts shares. Pure: no DB, no UI.
 * Main exports: clusterOrphanRoots, layoutMemberIds.
 *
 * A cluster continent carries the ONE allowed exception to "大陆与国家永不同名": its name is the
 * medoid member's own label and that member is also one of its kingdoms, so the two read alike.
 * That is the honest node name; the optional AI naming pass exists precisely to lift a cluster
 * continent's name away from its members.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { growClusters } from "./continentGrowth";
import type { ContinentSummary } from "./continents";
import { compareCodePoints } from "./ordering";
import { pickMedoid } from "./topicCluster";
import { sumEngagement } from "./topicFallback";
import type { TopicSummary } from "./topics";

/** Layout inputs (weight, size) only count members known before the layout day, so browsing
 * and mid-day growth cannot move or resize anything until tomorrow (Leo 2026-08-31). */
export function layoutMemberIds(
  memberNodeIds: readonly string[],
  createdAtById: ReadonlyMap<string, string>,
  layoutDayStartIso: string | undefined,
): string[] {
  if (layoutDayStartIso === undefined) return [...memberNodeIds];
  return memberNodeIds.filter((id) => (createdAtById.get(id) ?? "") < layoutDayStartIso);
}

/** Arrival order — (created_at, id), with an unknown creation time sorting first. It is what
 * growClusters' whole stability guarantee rests on, so this file sorts by it rather than
 * trusting the caller's iteration order. Ties fall back to id, so the order is total. */
function byArrival(
  nodeIds: readonly string[],
  createdAtById: ReadonlyMap<string, string>,
): string[] {
  return [...nodeIds].sort(
    (a, b) =>
      compareCodePoints(createdAtById.get(a) ?? "", createdAtById.get(b) ?? "") ||
      compareCodePoints(a, b),
  );
}

/**
 * Clusters the flat, childless roots by embedding similarity (the same relative-gate pipeline
 * topic discovery uses), so a shelf of unfiled interests still gathers into a landmass.
 * A root with no embedding cannot be judged for similarity at all, so it goes straight to the
 * islets — as does anything that clustered with nobody.
 */
export function clusterOrphanRoots(
  orphanRoots: readonly KnowledgeNodeRow[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
  engagementByNodeId: ReadonlyMap<string, number>,
  createdAtById: ReadonlyMap<string, string>,
  layoutDayStartIso: string | undefined,
): { continents: ContinentSummary[]; islets: TopicSummary[] } {
  const nodesById = new Map(orphanRoots.map((node) => [node.id, node]));
  const embeddedIds = byArrival(
    orphanRoots
      .filter((node) => (embeddingByNodeId.get(node.id)?.length ?? 0) > 0)
      .map((node) => node.id),
    createdAtById,
  );
  const communities = growClusters(embeddedIds, embeddingByNodeId);

  const continents: ContinentSummary[] = [];
  const gathered = new Set<string>();
  for (const { anchorId, memberIds: memberNodeIds } of communities) {
    if (memberNodeIds.length < 2) continue;
    const medoid = pickMedoid(memberNodeIds, embeddingByNodeId, nodesById);
    if (medoid === undefined) continue;
    for (const id of memberNodeIds) gathered.add(id);
    const layoutMembers = layoutMemberIds(memberNodeIds, createdAtById, layoutDayStartIso);
    continents.push({
      // Identity — and through it the terrain seed — is the cluster's anchor, never its medoid:
      // the oldest member on the day the landmass formed, frozen from that instant. growClusters
      // is what makes "frozen" true (see its header): it replays arrivals in order and never
      // revisits a landmass's membership, so a cluster only ever grows and its id outlives every
      // later joiner (Leo 2026-09-01: shape is the one thing that stays put; bug hunt 2026-09-03
      // finding 3 is why that guarantee had to move into the clustering itself). The label still
      // comes from the medoid, the member that actually says what the cluster is about — a name
      // may broaden as the landmass grows, its shape may not.
      id: anchorId,
      label: medoid.label,
      memberNodeIds: [...memberNodeIds],
      weight: sumEngagement(layoutMembers, engagementByNodeId),
      layoutMemberCount: layoutMembers.length,
      origin: "cluster",
      kingdoms: memberNodeIds.map((id) => ({
        id,
        label: nodesById.get(id)?.label ?? id,
        memberNodeIds: [id],
      })),
    });
  }

  const islets = orphanRoots
    .filter((node) => !gathered.has(node.id))
    .map((node) => ({
      id: node.id,
      label: node.label,
      memberNodeIds: [node.id],
      weight: sumEngagement([node.id], engagementByNodeId),
    }));
  return { continents, islets };
}
