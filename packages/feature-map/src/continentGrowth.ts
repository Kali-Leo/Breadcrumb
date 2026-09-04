/**
 * Purpose: growth-only clustering of the flat orphan roots — the half of continent derivation
 * that has to obey 「同一棵知识树永远画出同一张地图」. Pure: no DB, no UI, seeded randomness only.
 * Main exports: growClusters, GrownCluster.
 *
 * Why this exists instead of one more whole-corpus Louvain pass (bug hunt 2026-09-03, finding
 * 3). Louvain re-partitions the WHOLE room on every call, and the gates it feeds on are global
 * statistics (topicGraph's globalMean is the mean of every node's mean similarity). Adding one
 * node therefore re-cuts communities that had nothing to do with it: the hunt measured the 15th
 * root arriving and moving the 5th root's continent from n05 to n00 — and since a cluster
 * continent's id is its terrain seed, that is an island a learner already knows silently
 * redrawing itself, 134 times in a simulated 180 days.
 *
 * THE INVARIANT. The map's history is replayed, one root at a time, in arrival order —
 * (created_at, id), the order the tree itself hands them out. At each step:
 *
 *   1. every root not yet on a landmass is offered to the landmasses that exist, and joins the
 *      one it holds a gated kNN link into whose members point most nearly its way;
 *   2. whatever is still unattached is re-clustered from scratch, and any group of two or more
 *      is PROMOTED to a landmass — from that instant its id is frozen and its membership may
 *      only grow. It never splits, never merges with another landmass, never loses a member.
 *
 * Step i reads only roots 0..i, so appending a root leaves steps 0..i−1 bit-for-bit identical.
 * Formally: for node sets A ⊆ B where every member of B \ A sorts after every member of A,
 * growClusters(B) contains every cluster of growClusters(A) with the same id and a superset of
 * its members. That is the whole guarantee, and it is why the expensive replay is worth it.
 *
 * What is deliberately NOT frozen: a root that belongs to no landmass. It is drawn as an
 * unnamed islet whose id is its own node id, so re-clustering it costs the learner nothing —
 * the bug hunt classified islet→continent as legitimate growth for exactly this reason. That
 * freedom is what keeps quality: two related roots cannot bond the moment the second arrives
 * (a room of two has no contrast to judge "closer than typical" against), and they must stay
 * free until a third, unrelated root gives the gate something to measure them by.
 *
 * The boundary, stated honestly: back-dating a root — one whose created_at falls before roots
 * already on the map — inserts it into the middle of the arrival order, and everything after it
 * is re-decided. Nothing in the product does that; a backfill importer would have to.
 *
 * Cost: the one O(n²·dims) cosine sweep the old path already paid, plus O(n) replay steps over
 * the shrinking unattached pool. Only childless roots reach here.
 */
import type { PackedVectors } from "@breadcrumb/core-vectors";
import { packVectors } from "@breadcrumb/core-vectors";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import { createPrefixRoom, type PrefixRoom } from "./continentRoom";
import { createSeededRandom, hashStringToSeed } from "./random";
import { mergeSingletonCommunities } from "./topicGraph";

export interface GrownCluster {
  /** The group's oldest member on the day it became a landmass: its permanent id, and through
   * it its terrain seed. Later joiners never take it over, whatever their vintage. */
  anchorId: string;
  /** Members in arrival order. Only ever appended to as the tree grows. */
  memberIds: string[];
}

interface Landmass {
  anchorRow: number;
  rows: number[];
  /** Σ of the members' unit vectors. Cosine ignores magnitude, so this stands in for the
   * centroid without a division, and a join updates it in O(dims). */
  direction: Float64Array;
}

function addRowInto(target: Float64Array, packed: PackedVectors, row: number): void {
  for (let index = 0; index < packed.dims; index += 1) {
    target[index] = (target[index] ?? 0) + (packed.values[row * packed.dims + index] ?? 0);
  }
}

/** Cosine between a packed (already unit-length) row and a landmass's summed direction. */
function cosineToDirection(packed: PackedVectors, row: number, direction: Float64Array): number {
  let dot = 0;
  let norm = 0;
  for (let index = 0; index < packed.dims; index += 1) {
    const component = direction[index] ?? 0;
    dot += (packed.values[row * packed.dims + index] ?? 0) * component;
    norm += component * component;
  }
  return norm === 0 ? 0 : dot / Math.sqrt(norm);
}

function newLandmass(packed: PackedVectors, rows: readonly number[]): Landmass {
  const direction = new Float64Array(packed.dims);
  for (const row of rows) addRowInto(direction, packed, row);
  return { anchorRow: Math.min(...rows), rows: [...rows], direction };
}

/** Step 1: every unattached root joins the landmass it links into whose members point most
 * nearly its way — the rule mergeSingletonCommunities used, applied to a live map. Returns the
 * roots that found no home. */
function attachFree(
  packed: PackedVectors,
  room: PrefixRoom,
  free: readonly number[],
  landmasses: readonly Landmass[],
  landmassOfRow: Map<number, number>,
): number[] {
  if (landmasses.length === 0) return [...free];
  const stillFree: number[] = [];
  for (const row of free) {
    let joined = -1;
    let bestSimilarity = Number.NEGATIVE_INFINITY;
    const considered = new Set<number>();
    for (const link of room.linksFrom(row)) {
      const index = landmassOfRow.get(link.row);
      const landmass = index === undefined ? undefined : landmasses[index];
      if (index === undefined || landmass === undefined || considered.has(index)) continue;
      considered.add(index);
      const similarity = cosineToDirection(packed, row, landmass.direction);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        joined = index;
      }
    }
    const target = joined === -1 ? undefined : landmasses[joined];
    if (target === undefined) {
      stillFree.push(row);
      continue;
    }
    target.rows.push(row);
    addRowInto(target.direction, packed, row);
    landmassOfRow.set(row, joined);
  }
  return stillFree;
}

/** Step 2: re-cluster the unattached roots from scratch — the very same kNN graph + seeded
 * Louvain + singleton merge topic discovery uses, over the nodes that are still nobody's. */
function clusterFree(
  packed: PackedVectors,
  room: PrefixRoom,
  free: readonly number[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
): string[][] {
  if (free.length < 2) return [];
  const isFree = new Set(free);
  const graph = new Graph({ type: "undirected" });
  const idOf = (row: number): string => packed.ids[row] as string;
  for (const row of free) graph.mergeNode(idOf(row));
  for (const row of free) {
    for (const link of room.linksFrom(row)) {
      if (!isFree.has(link.row)) continue;
      graph.mergeEdge(idOf(row), idOf(link.row), { weight: link.similarity });
    }
  }
  const freeIds = free.map(idOf);
  const rng = createSeededRandom(hashStringToSeed([...freeIds].sort().join(",")));
  const communityIndexByNode = louvain(graph, { rng, getEdgeWeight: "weight" });
  const initial = new Map<string, string[]>();
  for (const id of freeIds) {
    const key = String(communityIndexByNode[id]);
    const members = initial.get(key) ?? [];
    members.push(id);
    initial.set(key, members);
  }
  return [...mergeSingletonCommunities(initial, embeddingByNodeId, graph).values()];
}

/**
 * Groups ids into growth-only clusters. `arrivalOrderedIds` MUST be sorted by (created_at, id):
 * that order is the whole guarantee. Ids whose vector cannot join the landscape (absent, wrong
 * length, all zeros — packVectors drops them) come back in no cluster at all, exactly as before.
 * Only landmasses are returned; a root that is nobody's is the caller's islet.
 */
export function growClusters(
  arrivalOrderedIds: readonly string[],
  embeddingByNodeId: ReadonlyMap<string, readonly number[]>,
): GrownCluster[] {
  const packed = packVectors(
    arrivalOrderedIds.map((id) => ({ id, vector: embeddingByNodeId.get(id) ?? [] })),
  );
  const room = createPrefixRoom(packed);
  const rowById = new Map(packed.ids.map((id, row) => [id, row]));
  const landmasses: Landmass[] = [];
  const landmassOfRow = new Map<number, number>();
  let free: number[] = [];

  for (let row = 0; row < packed.ids.length; row += 1) {
    room.admit();
    free.push(row);
    free = attachFree(packed, room, free, landmasses, landmassOfRow);
    for (const community of clusterFree(packed, room, free, embeddingByNodeId)) {
      if (community.length < 2) continue;
      const rows = community
        .map((id) => rowById.get(id))
        .filter((member): member is number => member !== undefined);
      if (rows.length < 2) continue;
      const index = landmasses.length;
      landmasses.push(newLandmass(packed, rows));
      for (const member of rows) landmassOfRow.set(member, index);
    }
    free = free.filter((member) => !landmassOfRow.has(member));
  }

  return landmasses.map((landmass) => ({
    anchorId: packed.ids[landmass.anchorRow] as string,
    memberIds: [...landmass.rows].sort((a, b) => a - b).map((row) => packed.ids[row] as string),
  }));
}
