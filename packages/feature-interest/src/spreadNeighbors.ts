/**
 * Purpose: "the K most similar other nodes, for every node", computed once over packed
 * vectors — the hot half of interest diffusion, kept away from the policy in spread.ts.
 *
 * Three techniques keep this fast without changing what comes out:
 *   1. Vectors are L2-normalized once into one flat Float32Array (core-vectors' packVectors),
 *      after which a cosine is a dot product over contiguous memory.
 *   2. Each unordered pair is scored once and offered to both endpoints, halving the work.
 *   3. Top-K is a bounded insertion instead of a full sort — and because the insertion uses
 *      the same strict total order a full sort would (similarity desc, then node id), it
 *      selects exactly the same K neighbours.
 * The remaining loop is still O(n²) dot products, which is the honest cost of "every node's
 * K nearest" without an index. Four rows are scored per pass over each partner row, because at
 * this size the sweep is bound by how fast partner rows stream out of memory, not by the
 * multiply.
 * Main exports: NeighborSlots, topNeighbors.
 */
import { type PackedVectors, packVectors } from "@breadcrumb/core-vectors";

/** How many rows of the block are scored against one partner row per pass. Four is where the
 * measured gain flattens on the dev machine (1.56 s → 0.87 s at 3000 nodes; eight buys 0.08 s
 * more and costs another four accumulators of noise). */
const BLOCK_WIDTH = 4;

/** Every packed row's top-K neighbours, best first, in three parallel arrays: slot `j` of row
 * `r` lives at `r * capacity + j`. Empty slots are never read — `count[r]` says how many of
 * row `r`'s slots are real. */
export interface NeighborSlots {
  packed: PackedVectors;
  capacity: number;
  similarity: Float64Array;
  partner: Int32Array;
  count: Int32Array;
}

/** Packs the vectors and fills each row's top-K neighbour slots. Only pairs at or above
 * `floor` are ever offered, so a node with no real neighbour ends up with an empty list. */
export function topNeighbors(
  entries: readonly { id: string; vector: readonly number[] }[],
  capacity: number,
  floor: number,
): NeighborSlots {
  const packed = packVectors(entries);
  const count = packed.ids.length;
  const slots: NeighborSlots = {
    packed,
    capacity,
    similarity: new Float64Array(count * capacity),
    partner: new Int32Array(count * capacity),
    count: new Int32Array(count),
  };
  sweep(slots, floor);
  return slots;
}

/** True when (similarity, id) sorts strictly before (otherSimilarity, otherRow): closest
 * first, node id as the tie-break so the top-K cut is deterministic. */
function beats(
  ids: readonly string[],
  similarity: number,
  row: number,
  otherSimilarity: number,
  otherRow: number,
): boolean {
  if (similarity !== otherSimilarity) return similarity > otherSimilarity;
  return (ids[row] ?? "").localeCompare(ids[otherRow] ?? "") < 0;
}

/** Offers one neighbour to one row's slots, keeping them sorted best-first. */
function offer(slots: NeighborSlots, row: number, partner: number, similarity: number): void {
  const { capacity, packed } = slots;
  const base = row * capacity;
  const filled = slots.count[row] ?? 0;
  const worst = base + capacity - 1;
  if (
    filled === capacity &&
    !beats(packed.ids, similarity, partner, slots.similarity[worst] ?? 0, slots.partner[worst] ?? 0)
  ) {
    return;
  }
  let index = filled < capacity ? filled : capacity - 1;
  while (
    index > 0 &&
    beats(
      packed.ids,
      similarity,
      partner,
      slots.similarity[base + index - 1] ?? 0,
      slots.partner[base + index - 1] ?? 0,
    )
  ) {
    slots.similarity[base + index] = slots.similarity[base + index - 1] ?? 0;
    slots.partner[base + index] = slots.partner[base + index - 1] ?? 0;
    index -= 1;
  }
  slots.similarity[base + index] = similarity;
  slots.partner[base + index] = partner;
  if (filled < capacity) slots.count[row] = filled + 1;
}

/** Dot product of two packed (already unit-length) rows. */
function dot(values: Float32Array, dims: number, rowA: number, rowB: number): number {
  const baseA = rowA * dims;
  const baseB = rowB * dims;
  let total = 0;
  for (let index = 0; index < dims; index += 1) {
    total += (values[baseA + index] ?? 0) * (values[baseB + index] ?? 0);
  }
  return total;
}

function offerPair(slots: NeighborSlots, a: number, b: number, similarity: number, floor: number) {
  if (similarity < floor) return;
  offer(slots, a, b, similarity);
  offer(slots, b, a, similarity);
}

/** One pass over the upper triangle: every unordered pair scored once, offered to both ends. */
function sweep(slots: NeighborSlots, floor: number): void {
  const { values, dims, ids } = slots.packed;
  const rows = ids.length;
  for (let block = 0; block < rows; block += BLOCK_WIDTH) {
    const width = Math.min(BLOCK_WIDTH, rows - block);
    for (let a = block; a < block + width; a += 1) {
      for (let b = a + 1; b < block + width; b += 1) {
        offerPair(slots, a, b, dot(values, dims, a, b), floor);
      }
    }
    const base0 = block * dims;
    const base1 = (block + 1) * dims;
    const base2 = (block + 2) * dims;
    const base3 = (block + 3) * dims;
    for (let partner = block + width; partner < rows; partner += 1) {
      const basePartner = partner * dims;
      let dot0 = 0;
      let dot1 = 0;
      let dot2 = 0;
      let dot3 = 0;
      for (let index = 0; index < dims; index += 1) {
        const value = values[basePartner + index] ?? 0;
        dot0 += (values[base0 + index] ?? 0) * value;
        dot1 += (values[base1 + index] ?? 0) * value;
        dot2 += (values[base2 + index] ?? 0) * value;
        dot3 += (values[base3 + index] ?? 0) * value;
      }
      offerPair(slots, block, partner, dot0, floor);
      if (width > 1) offerPair(slots, block + 1, partner, dot1, floor);
      if (width > 2) offerPair(slots, block + 2, partner, dot2, floor);
      if (width > 3) offerPair(slots, block + 3, partner, dot3, floor);
    }
  }
}
