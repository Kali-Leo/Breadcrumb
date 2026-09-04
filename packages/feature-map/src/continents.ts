/**
 * Purpose: derive the map's continents tree-first (spec 031) — every knowledge root that has
 * children becomes a continent named after itself, with its direct children as kingdoms;
 * only childless orphan roots fall back to embedding clustering (continentClusters.ts), and
 * whatever refuses to cluster leaves as an unnamed islet. This file owns the continent types,
 * the tree half, and the placement order. Pure: no DB, no UI, seeded randomness only.
 * Main exports: deriveContinents, ContinentAssignment, ContinentSummary, ContinentKingdom.
 *
 * Naming rule "大陆与国家永不同名" holds by construction for tree continents — a parent never
 * shares a label with its own children. The one allowed exception belongs to cluster
 * continents and is documented in continentClusters.ts.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { clusterOrphanRoots, layoutMemberIds } from "./continentClusters";
import { compareCodePoints } from "./ordering";
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

/** Heaviest first, then by name — engagement pulls a landmass toward the map centre
 * (golden-angle slots fill centre-out), and the same input always yields the same order.
 * The tie-break is code-point order, not localeCompare: the host locale and the runtime's ICU
 * build must not be able to hand two machines different slot orders for the same tree
 * (ordering.ts). */
function orderByWeight<Summary extends { weight: number; label: string }>(
  summaries: readonly Summary[],
): Summary[] {
  return [...summaries].sort((a, b) => b.weight - a.weight || compareCodePoints(a.label, b.label));
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
    (a, b) => compareCodePoints(earliest(a), earliest(b)) || compareCodePoints(a.id, b.id),
  );
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
