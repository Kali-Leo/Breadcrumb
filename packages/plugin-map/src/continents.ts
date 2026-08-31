/**
 * Purpose: derive the map's continents tree-first (spec 031) — every knowledge root that has
 * children becomes a continent named after itself, with its direct children as kingdoms;
 * only childless orphan roots fall back to embedding clustering, and whatever refuses to
 * cluster leaves as an unnamed islet. Pure: no DB, no UI, seeded randomness only.
 * Main exports: deriveContinents, ContinentAssignment, ContinentSummary, ContinentKingdom.
 *
 * Naming rule "大陆与国家永不同名" holds by construction for tree continents — a parent never
 * shares a label with its own children. Cluster continents carry the ONE allowed exception:
 * their name is the medoid member's own label and that member is also one of their kingdoms,
 * so the two read alike. That is the honest node name; the optional AI naming pass exists
 * precisely to lift a cluster continent's name away from its members.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { clusterEmbeddedNodes, pickMedoid } from "./topicCluster";
import { sumEngagement } from "./topicFallback";
import type { TopicSummary } from "./topics";
import { collectSubtree, indexChildren } from "./treeShape";

/** One country inside a continent: a tree continent's direct child (territory = its subtree),
 * or a single member of a cluster continent (territory = itself). */
export interface ContinentKingdom {
  id: string;
  label: string;
  memberNodeIds: string[];
}

export interface ContinentSummary {
  id: string;
  label: string;
  memberNodeIds: string[];
  /** Σ engagement over layout-day members (default 1 per member) — decides how close to the
   * map centre the continent sits (slot order). Size never reads this. */
  weight: number;
  /** Members created before the layout day (all members when no layout day is given) — the
   * knowledge count that sizes the island. 0 = the continent was born on the layout day. */
  layoutMemberCount: number;
  origin: "tree" | "cluster";
  kingdoms: ContinentKingdom[];
}

export interface ContinentAssignment {
  continents: ContinentSummary[];
  /** Roots that neither carry a subtree nor clustered with anyone — drawn as unnamed islets. */
  islets: TopicSummary[];
}

/** Heaviest first, then alphabetically — engagement pulls a landmass toward the map centre
 * (golden-angle slots fill centre-out), and the same input always yields the same order. */
function orderByWeight<Summary extends { weight: number; label: string }>(
  summaries: readonly Summary[],
): Summary[] {
  return [...summaries].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

/** Landmasses born on the layout day queue at the outer rim in arrival order, so today's
 * additions surface immediately without reshuffling anything already placed. */
function orderByArrival<Summary extends { id: string; memberNodeIds: string[] }>(
  summaries: readonly Summary[],
  createdAtById: ReadonlyMap<string, string>,
): Summary[] {
  const earliest = (summary: Summary): string =>
    summary.memberNodeIds.reduce((min, id) => {
      const createdAt = createdAtById.get(id) ?? "";
      return min === "" || (createdAt !== "" && createdAt < min) ? createdAt : min;
    }, "");
  return [...summaries].sort(
    (a, b) => earliest(a).localeCompare(earliest(b)) || a.id.localeCompare(b.id),
  );
}

/** Layout inputs (weight, size) only count members known before the layout day, so browsing
 * and mid-day growth cannot move or resize anything until tomorrow (Leo 2026-08-31). */
function layoutMemberIds(
  memberNodeIds: readonly string[],
  createdAtById: ReadonlyMap<string, string>,
  layoutDayStartIso: string | undefined,
): string[] {
  if (layoutDayStartIso === undefined) return [...memberNodeIds];
  return memberNodeIds.filter((id) => (createdAtById.get(id) ?? "") < layoutDayStartIso);
}

function treeContinent(
  root: KnowledgeNodeRow,
  directChildren: readonly KnowledgeNodeRow[],
  children: ReturnType<typeof indexChildren>,
  engagementByNodeId: ReadonlyMap<string, number>,
  createdAtById: ReadonlyMap<string, string>,
  layoutDayStartIso: string | undefined,
): ContinentSummary {
  const memberNodeIds = collectSubtree(root, children).map((member) => member.id);
  const layoutMembers = layoutMemberIds(memberNodeIds, createdAtById, layoutDayStartIso);
  return {
    id: root.id,
    label: root.label,
    memberNodeIds,
    weight: sumEngagement(layoutMembers, engagementByNodeId),
    layoutMemberCount: layoutMembers.length,
    origin: "tree",
    kingdoms: directChildren.map((child) => ({
      id: child.id,
      label: child.label,
      // The root itself stays continent-level: it belongs to no kingdom.
      memberNodeIds: collectSubtree(child, children).map((member) => member.id),
    })),
  };
}

/**
 * Clusters the flat, childless roots by embedding similarity (the same relative-gate pipeline
 * topic discovery uses), so a shelf of unfiled interests still gathers into a landmass.
 * A root with no embedding cannot be judged for similarity at all, so it goes straight to the
 * islets — as does anything that clustered with nobody.
 */
function clusterOrphanRoots(
  orphanRoots: readonly KnowledgeNodeRow[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
  engagementByNodeId: ReadonlyMap<string, number>,
  createdAtById: ReadonlyMap<string, string>,
  layoutDayStartIso: string | undefined,
): { continents: ContinentSummary[]; islets: TopicSummary[] } {
  const nodesById = new Map(orphanRoots.map((node) => [node.id, node]));
  const embeddedIds = orphanRoots
    .filter((node) => (embeddingByNodeId.get(node.id)?.length ?? 0) > 0)
    .map((node) => node.id);
  const communities = clusterEmbeddedNodes(embeddedIds, embeddingByNodeId);

  const continents: ContinentSummary[] = [];
  const gathered = new Set<string>();
  for (const memberNodeIds of communities.values()) {
    if (memberNodeIds.length < 2) continue;
    const medoid = pickMedoid(memberNodeIds, embeddingByNodeId, nodesById);
    if (medoid === undefined) continue;
    for (const id of memberNodeIds) gathered.add(id);
    const layoutMembers = layoutMemberIds(memberNodeIds, createdAtById, layoutDayStartIso);
    continents.push({
      id: medoid.id,
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

export function deriveContinents(
  nodes: readonly KnowledgeNodeRow[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
  engagementByNodeId: ReadonlyMap<string, number>,
  layoutDayStartIso?: string,
): ContinentAssignment {
  // Same root resolution as shapeTree: a dangling parent_id degrades its node to a root.
  const children = indexChildren(nodes);
  const createdAtById = new Map(nodes.map((node) => [node.id, node.created_at]));
  const continents: ContinentSummary[] = [];
  const orphanRoots: KnowledgeNodeRow[] = [];
  for (const root of children.get(null) ?? []) {
    const directChildren = children.get(root.id) ?? [];
    if (directChildren.length === 0) {
      orphanRoots.push(root);
      continue;
    }
    continents.push(
      treeContinent(
        root,
        directChildren,
        children,
        engagementByNodeId,
        createdAtById,
        layoutDayStartIso,
      ),
    );
  }
  const clustered = clusterOrphanRoots(
    orphanRoots,
    embeddingByNodeId,
    engagementByNodeId,
    createdAtById,
    layoutDayStartIso,
  );
  const allContinents = [...continents, ...clustered.continents];
  const established = allContinents.filter((continent) => continent.layoutMemberCount > 0);
  const bornToday = allContinents.filter((continent) => continent.layoutMemberCount === 0);
  const isEstablishedIslet = (islet: TopicSummary): boolean =>
    layoutMemberIds(islet.memberNodeIds, createdAtById, layoutDayStartIso).length > 0;
  return {
    continents: [...orderByWeight(established), ...orderByArrival(bornToday, createdAtById)],
    islets: [
      ...orderByWeight(clustered.islets.filter(isEstablishedIslet)),
      ...orderByArrival(
        clustered.islets.filter((islet) => !isEstablishedIslet(islet)),
        createdAtById,
      ),
    ],
  };
}
