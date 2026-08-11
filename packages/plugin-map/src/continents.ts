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
  /** Σ engagement over members (default 1 per member) — how much of the map it deserves. */
  weight: number;
  origin: "tree" | "cluster";
  kingdoms: ContinentKingdom[];
}

export interface ContinentAssignment {
  continents: ContinentSummary[];
  /** Roots that neither carry a subtree nor clustered with anyone — drawn as unnamed islets. */
  islets: TopicSummary[];
}

/** Heaviest first, then alphabetically — the same input always yields the same order. */
function orderByWeight<Summary extends { weight: number; label: string }>(
  summaries: readonly Summary[],
): Summary[] {
  return [...summaries].sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
}

function treeContinent(
  root: KnowledgeNodeRow,
  directChildren: readonly KnowledgeNodeRow[],
  children: ReturnType<typeof indexChildren>,
  engagementByNodeId: ReadonlyMap<string, number>,
): ContinentSummary {
  const memberNodeIds = collectSubtree(root, children).map((member) => member.id);
  return {
    id: root.id,
    label: root.label,
    memberNodeIds,
    weight: sumEngagement(memberNodeIds, engagementByNodeId),
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
    continents.push({
      id: medoid.id,
      label: medoid.label,
      memberNodeIds: [...memberNodeIds],
      weight: sumEngagement(memberNodeIds, engagementByNodeId),
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
): ContinentAssignment {
  // Same root resolution as shapeTree: a dangling parent_id degrades its node to a root.
  const children = indexChildren(nodes);
  const continents: ContinentSummary[] = [];
  const orphanRoots: KnowledgeNodeRow[] = [];
  for (const root of children.get(null) ?? []) {
    const directChildren = children.get(root.id) ?? [];
    if (directChildren.length === 0) {
      orphanRoots.push(root);
      continue;
    }
    continents.push(treeContinent(root, directChildren, children, engagementByNodeId));
  }
  const clustered = clusterOrphanRoots(orphanRoots, embeddingByNodeId, engagementByNodeId);
  return {
    continents: orderByWeight([...continents, ...clustered.continents]),
    islets: orderByWeight(clustered.islets),
  };
}
