/**
 * Purpose: the project's one cartographic iron law — 「同一棵知识树永远画出同一张地图」— under
 * growth. A knowledge tree only ever gains nodes, so a landmass a learner has already seen must
 * only ever grow: its id (which seeds the terrain, so it IS the island's shape) and its member
 * set may gain, never change. The 2026-09-03 bug hunt found the opposite — adding the 15th root
 * moved the 5th root's continent from n05 to n00 — because the clustering re-ran Louvain over
 * the whole room every time and the room's statistics (topicGraph's globalMean) shifted under it.
 *
 * This file is the regression net: 50 nodes added one at a time, asserting after every single
 * addition that no continent already on the map lost its id or lost a member.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { type ContinentAssignment, deriveContinents } from "./continents";

/** Deterministic PRNG — the same 50 nodes every run, on every machine. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIMENSIONS = 12;
const LATENT_TOPICS = 6;

/** A node's embedding: one of a few latent topic directions plus noise — the shape real
 * embeddings have (tight groups inside one narrow high-cosine band). */
function syntheticEmbedding(random: () => number, topic: number): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0);
  for (let index = 0; index < DIMENSIONS; index += 1) {
    vector[index] = 0.08 * random();
  }
  vector[topic % DIMENSIONS] = 1 + 0.4 * random();
  vector[(topic * 5 + 3) % DIMENSIONS] = 0.5 + 0.3 * random();
  return vector;
}

interface GrowthStep {
  assignment: ContinentAssignment;
  addedId: string;
}

/** Adds `count` childless roots one at a time, each with a strictly later creation instant —
 * exactly how the product grows — and yields the whole map after every addition. */
function growByOneRootAtATime(count: number, seed: number): GrowthStep[] {
  const random = mulberry32(seed);
  const nodes: KnowledgeNodeRow[] = [];
  const embeddings = new Map<string, readonly number[]>();
  const engagement = new Map<string, number>();
  const steps: GrowthStep[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `n${String(index).padStart(2, "0")}`;
    const topic = Math.floor(random() * LATENT_TOPICS);
    nodes.push({
      id,
      parent_id: null,
      label: `${id}-t${topic}`,
      summary: "",
      kind: "concept",
      created_at: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`,
    });
    embeddings.set(id, syntheticEmbedding(random, topic));
    engagement.set(id, 1);
    steps.push({ assignment: deriveContinents(nodes, embeddings, engagement), addedId: id });
  }
  return steps;
}

const clusterContinents = (assignment: ContinentAssignment) =>
  assignment.continents.filter((continent) => continent.origin === "cluster");

describe("continent identity under growth", () => {
  it("never changes an existing cluster continent's id or takes a member away (50 additions)", () => {
    const steps = growByOneRootAtATime(50, 20260903);
    let previous = new Map<string, Set<string>>();
    let everSawTwoContinents = false;

    for (const step of steps) {
      const current = new Map(
        clusterContinents(step.assignment).map((continent) => [
          continent.id,
          new Set(continent.memberNodeIds),
        ]),
      );
      if (current.size >= 2) everSawTwoContinents = true;
      for (const [id, members] of previous) {
        const grown = current.get(id);
        // Iron law 1: an id that has been on the map stays on the map.
        expect(grown, `continent ${id} vanished when ${step.addedId} arrived`).toBeDefined();
        // Iron law 2: it only ever gains members.
        for (const member of members) {
          expect(
            grown?.has(member),
            `continent ${id} lost member ${member} when ${step.addedId} arrived`,
          ).toBe(true);
        }
      }
      previous = current;
    }

    // Guard against a vacuous pass: the run has to actually build several landmasses.
    expect(everSawTwoContinents).toBe(true);
  });

  it("never moves an already-placed node off the continent it landed on", () => {
    const steps = growByOneRootAtATime(50, 12345);
    const continentOfNode = new Map<string, string>();

    for (const step of steps) {
      for (const continent of clusterContinents(step.assignment)) {
        for (const member of continent.memberNodeIds) {
          const placed = continentOfNode.get(member);
          // An islet growing into a continent is legitimate growth; a continent handing a
          // member to a different continent is the bug — the island under the learner redraws.
          expect(
            placed === undefined || placed === continent.id,
            `${member} moved from continent ${placed} to ${continent.id} when ${step.addedId} arrived`,
          ).toBe(true);
          continentOfNode.set(member, continent.id);
        }
      }
    }
    expect(continentOfNode.size).toBeGreaterThan(4);
  });

  it("is a pure function of the node set — same input, same map", () => {
    const first = growByOneRootAtATime(30, 777).at(-1)?.assignment;
    const second = growByOneRootAtATime(30, 777).at(-1)?.assignment;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
