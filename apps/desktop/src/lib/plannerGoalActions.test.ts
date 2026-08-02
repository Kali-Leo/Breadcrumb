/**
 * Purpose: unit tests for the goal-mapping persistence and per-node self-statement actions —
 * persistCalibratedGoal's no-calibration full-mapping persistence (incl. idempotent
 * same-title update), claimNodeAsLearned's direct mastery-claim insert + event emission, and
 * removeNodeFromGoal's node_ids_json update. Fake repos are plain in-memory objects, no DB.
 */
import type { GoalRow, KnowledgeNodeRow, MasteryClaimRow } from "@breadcrumb/core-db";
import type { GoalMappingResult } from "@breadcrumb/plugin-planner";
import { describe, expect, it } from "vitest";
import { appEventBus } from "../stores/chatStore";
import {
  claimNodeAsLearned,
  persistCalibratedGoal,
  removeNodeFromGoal,
} from "./plannerGoalActions";

/** In-memory fake covering only the knowledgeNodes/goals/masteryClaims methods these actions
 * use; inserted rows are exposed as plain arrays/maps for assertions. */
function makeFakeRepos(initialGoals: readonly GoalRow[] = []) {
  const knowledgeNodeRows: KnowledgeNodeRow[] = [];
  const goalRows = new Map(initialGoals.map((goal) => [goal.id, goal]));
  const masteryClaimRows: MasteryClaimRow[] = [];
  return {
    knowledgeNodes: {
      async insert(row: KnowledgeNodeRow) {
        knowledgeNodeRows.push(row);
      },
    },
    goals: {
      async listAll() {
        return [...goalRows.values()];
      },
      async insert(row: GoalRow) {
        goalRows.set(row.id, row);
      },
      async updateNodeIds(id: string, nodeIds: readonly string[], updatedAtIso: string) {
        const row = goalRows.get(id);
        if (row === undefined) return;
        goalRows.set(id, {
          ...row,
          node_ids_json: JSON.stringify(nodeIds),
          updated_at: updatedAtIso,
        });
      },
    },
    masteryClaims: {
      async insert(row: MasteryClaimRow) {
        masteryClaimRows.push(row);
      },
    },
    knowledgeNodeRows,
    goalRows,
    masteryClaimRows,
  };
}

describe("persistCalibratedGoal", () => {
  it("persists every existing and suggested node with no calibration filtering", async () => {
    const fake = makeFakeRepos();
    const existingNode: KnowledgeNodeRow = {
      id: "n-existing",
      parent_id: null,
      label: "导数",
      summary: "s",
      kind: "concept",
      created_at: "2026-08-01T00:00:00Z",
    };
    const mapping: GoalMappingResult = {
      existing: ["导数"],
      suggested: [{ label: "积分", summary: "微积分的另一半" }],
    };

    const { goalId, insertedNodes } = await persistCalibratedGoal(fake, "通过考研数学", mapping, [
      existingNode,
    ]);

    expect(insertedNodes).toBe(true);
    expect(fake.knowledgeNodeRows).toHaveLength(1);
    expect(fake.knowledgeNodeRows[0]?.label).toBe("积分");

    const [goal] = await fake.goals.listAll();
    expect(goal?.id).toBe(goalId);
    const nodeIds = JSON.parse(goal?.node_ids_json ?? "[]") as string[];
    expect(nodeIds).toEqual(["n-existing", fake.knowledgeNodeRows[0]?.id]);
  });

  it("updates the existing goal in place on a repeated identical title (idempotent)", async () => {
    const existingGoal: GoalRow = {
      id: "g1",
      title: "通过考研数学",
      node_ids_json: JSON.stringify(["stale"]),
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const fake = makeFakeRepos([existingGoal]);
    const mapping: GoalMappingResult = { existing: [], suggested: [] };

    const { goalId } = await persistCalibratedGoal(fake, "通过考研数学", mapping, []);

    expect(goalId).toBe("g1");
    const all = await fake.goals.listAll();
    expect(all).toHaveLength(1);
    expect(JSON.parse(all[0]?.node_ids_json ?? "[]")).toEqual([]);
  });
});

describe("claimNodeAsLearned", () => {
  it("inserts a learned/self-report mastery claim and emits mastery:updated", async () => {
    const fake = makeFakeRepos();
    const emitted: string[][] = [];
    const unsubscribe = appEventBus.on("mastery:updated", ({ changedNodeIds }) => {
      emitted.push(changedNodeIds);
    });

    await claimNodeAsLearned(fake, "node-1");

    unsubscribe();
    expect(fake.masteryClaimRows).toHaveLength(1);
    expect(fake.masteryClaimRows[0]).toMatchObject({
      node_id: "node-1",
      level: "learned",
      source: "self-report",
    });
    expect(emitted).toEqual([["node-1"]]);
  });
});

describe("removeNodeFromGoal", () => {
  it("removes the node id from the goal's node_ids_json", async () => {
    const goal: GoalRow = {
      id: "g1",
      title: "通过考研数学",
      node_ids_json: JSON.stringify(["n1", "n2", "n3"]),
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const fake = makeFakeRepos([goal]);

    await removeNodeFromGoal(fake, goal, "n2");

    const [updated] = await fake.goals.listAll();
    expect(JSON.parse(updated?.node_ids_json ?? "[]")).toEqual(["n1", "n3"]);
  });

  it("is a no-op if the node id wasn't an explicit member of the goal's set", async () => {
    const goal: GoalRow = {
      id: "g1",
      title: "通过考研数学",
      node_ids_json: JSON.stringify(["n1"]),
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    };
    const fake = makeFakeRepos([goal]);

    await removeNodeFromGoal(fake, goal, "not-in-set");

    const [updated] = await fake.goals.listAll();
    expect(JSON.parse(updated?.node_ids_json ?? "[]")).toEqual(["n1"]);
  });
});
