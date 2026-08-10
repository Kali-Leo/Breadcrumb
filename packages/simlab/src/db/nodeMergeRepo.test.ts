/**
 * Purpose: real-SQLite regression tests for core-db's createNodeMergeRepo (spec 015 #4) —
 * reference reassignment across sightings/edges/interest/mastery/aliases/children, the
 * self-loop drop, the higher-confidence-wins collision rule (reusing knowledge_edges'
 * upsert ON CONFLICT), and the final duplicate-row + embedding deletion — all against a real
 * better-sqlite3 database instead of the fakes core-db's own tests use.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "./sqliteClient";

const now = "2026-08-04T10:00:00.000Z";

async function insertNode(
  temp: TempDatabase,
  id: string,
  label: string,
  createdAt: string,
  parentId: string | null = null,
): Promise<void> {
  await temp.repos.knowledgeNodes.insert({
    id,
    parent_id: parentId,
    label,
    summary: "s",
    kind: "concept",
    created_at: createdAt,
  });
}

describe("createNodeMergeRepo.mergeNode (real sqlite)", () => {
  let temp: TempDatabase | null = null;

  afterEach(() => {
    temp?.close();
    temp = null;
  });

  it("reassigns sightings, interest signals, mastery claims and aliases to the canonical node", async () => {
    temp = await createTempDatabase();
    await insertNode(temp, "canonical", "苹果", "2026-08-01T09:00:00Z");
    await insertNode(temp, "duplicate", "苹果（Apple）", "2026-08-01T10:00:00Z");
    await temp.repos.conversations.create({
      id: "conv-1",
      title: "t",
      created_at: now,
      updated_at: now,
      kind: "chat",
    });
    await temp.repos.nodeSightings.record({
      id: "sight-1",
      node_id: "duplicate",
      conversation_id: "conv-1",
      message_id: null,
      created_at: now,
    });
    await temp.repos.interestSignals.insert({
      id: "signal-1",
      node_id: "duplicate",
      conversation_id: "conv-1",
      curiosity: 0.5,
      confusion: 0,
      boredom: 0,
      confidence: 0.6,
      styles_json: "[]",
      created_at: now,
    });
    await temp.repos.masteryClaims.insert({
      id: "claim-1",
      node_id: "duplicate",
      level: "learned",
      source: "self-report",
      created_at: now,
    });
    await temp.repos.nodeAliases.insert({
      alias_label: "旧别名",
      node_id: "duplicate",
      created_at: now,
    });

    await temp.repos.nodeMerge.mergeNode("canonical", "duplicate", "苹果（Apple）", now);

    const sightings = await temp.repos.nodeSightings.listAll();
    expect(sightings).toHaveLength(1);
    expect(sightings[0]?.node_id).toBe("canonical");

    const signals = await temp.repos.interestSignals.listAll();
    expect(signals).toHaveLength(1);
    expect(signals[0]?.node_id).toBe("canonical");

    const claims = await temp.repos.masteryClaims.listAll();
    expect(claims).toHaveLength(1);
    expect(claims[0]?.node_id).toBe("canonical");

    const oldAlias = await temp.repos.nodeAliases.findByLabel("旧别名");
    expect(oldAlias?.node_id).toBe("canonical");

    const newAlias = await temp.repos.nodeAliases.findByLabel("苹果（Apple）");
    expect(newAlias?.node_id).toBe("canonical");
  });

  it("re-points a child's parent_id, deletes the duplicate node and its embedding", async () => {
    temp = await createTempDatabase();
    await insertNode(temp, "canonical", "苹果", "2026-08-01T09:00:00Z");
    await insertNode(temp, "duplicate", "苹果（Apple）", "2026-08-01T10:00:00Z");
    await insertNode(temp, "child", "红富士", "2026-08-01T11:00:00Z", "duplicate");
    await temp.repos.nodeEmbeddings.upsert({
      node_id: "duplicate",
      model: "test",
      vector_json: "[1,0]",
      created_at: now,
    });

    await temp.repos.nodeMerge.mergeNode("canonical", "duplicate", "苹果（Apple）", now);

    const nodes = await temp.repos.knowledgeNodes.listAll();
    expect(nodes.map((node) => node.id).sort()).toEqual(["canonical", "child"]);
    const child = nodes.find((node) => node.id === "child");
    expect(child?.parent_id).toBe("canonical");

    const embeddings = await temp.repos.nodeEmbeddings.listAll();
    expect(embeddings.find((row) => row.node_id === "duplicate")).toBeUndefined();
  });

  it("drops an edge that would become a self-loop after reassignment", async () => {
    temp = await createTempDatabase();
    await insertNode(temp, "canonical", "苹果", "2026-08-01T09:00:00Z");
    await insertNode(temp, "duplicate", "苹果（Apple）", "2026-08-01T10:00:00Z");
    await temp.repos.knowledgeEdges.upsert({
      id: "edge-1",
      source_id: "duplicate",
      target_id: "canonical",
      edge_type: "requires",
      weight: 1,
      confidence: 0.8,
      origin: "llm",
      created_at: now,
    });

    await temp.repos.nodeMerge.mergeNode("canonical", "duplicate", "苹果（Apple）", now);

    const edges = await temp.repos.knowledgeEdges.listAll();
    expect(edges).toEqual([]);
  });

  it("reassigns a non-colliding edge to the canonical node", async () => {
    temp = await createTempDatabase();
    await insertNode(temp, "canonical", "苹果", "2026-08-01T09:00:00Z");
    await insertNode(temp, "duplicate", "苹果（Apple）", "2026-08-01T10:00:00Z");
    await insertNode(temp, "other", "水果", "2026-08-01T08:00:00Z");
    await temp.repos.knowledgeEdges.upsert({
      id: "edge-1",
      source_id: "duplicate",
      target_id: "other",
      edge_type: "requires",
      weight: 1,
      confidence: 0.7,
      origin: "llm",
      created_at: now,
    });

    await temp.repos.nodeMerge.mergeNode("canonical", "duplicate", "苹果（Apple）", now);

    const edges = await temp.repos.knowledgeEdges.listAll();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.source_id).toBe("canonical");
    expect(edges[0]?.target_id).toBe("other");
    expect(edges[0]?.confidence).toBe(0.7);
  });

  it("on collision with an edge the canonical already has, keeps the higher-confidence judgment", async () => {
    temp = await createTempDatabase();
    await insertNode(temp, "canonical", "苹果", "2026-08-01T09:00:00Z");
    await insertNode(temp, "duplicate", "苹果（Apple）", "2026-08-01T10:00:00Z");
    await insertNode(temp, "other", "水果", "2026-08-01T08:00:00Z");
    // canonical -> other already exists with confidence 0.9.
    await temp.repos.knowledgeEdges.upsert({
      id: "edge-canonical",
      source_id: "canonical",
      target_id: "other",
      edge_type: "requires",
      weight: 1,
      confidence: 0.9,
      origin: "llm",
      created_at: now,
    });
    // duplicate -> other exists with a LOWER confidence — must not overwrite after reassignment.
    await temp.repos.knowledgeEdges.upsert({
      id: "edge-duplicate",
      source_id: "duplicate",
      target_id: "other",
      edge_type: "requires",
      weight: 1,
      confidence: 0.4,
      origin: "llm",
      created_at: now,
    });

    await temp.repos.nodeMerge.mergeNode("canonical", "duplicate", "苹果（Apple）", now);

    const edges = await temp.repos.knowledgeEdges.listAll();
    expect(edges).toHaveLength(1);
    expect(edges[0]?.id).toBe("edge-canonical");
    expect(edges[0]?.confidence).toBe(0.9);

    // Re-run with the duplicate's edge confidence HIGHER — the reassigned edge must win.
    temp.close();
    temp = await createTempDatabase();
    await insertNode(temp, "canonical", "苹果", "2026-08-01T09:00:00Z");
    await insertNode(temp, "duplicate", "苹果（Apple）", "2026-08-01T10:00:00Z");
    await insertNode(temp, "other", "水果", "2026-08-01T08:00:00Z");
    await temp.repos.knowledgeEdges.upsert({
      id: "edge-canonical",
      source_id: "canonical",
      target_id: "other",
      edge_type: "requires",
      weight: 1,
      confidence: 0.4,
      origin: "llm",
      created_at: now,
    });
    await temp.repos.knowledgeEdges.upsert({
      id: "edge-duplicate",
      source_id: "duplicate",
      target_id: "other",
      edge_type: "requires",
      weight: 1,
      confidence: 0.9,
      origin: "llm",
      created_at: now,
    });

    await temp.repos.nodeMerge.mergeNode("canonical", "duplicate", "苹果（Apple）", now);

    const edgesAfterHigherDuplicateWins = await temp.repos.knowledgeEdges.listAll();
    expect(edgesAfterHigherDuplicateWins).toHaveLength(1);
    expect(edgesAfterHigherDuplicateWins[0]?.id).toBe("edge-canonical");
    expect(edgesAfterHigherDuplicateWins[0]?.confidence).toBe(0.9);
  });
});
