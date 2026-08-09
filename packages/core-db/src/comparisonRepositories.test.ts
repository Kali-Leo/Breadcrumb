/**
 * Purpose: unit tests for createComparisonRepo using an in-memory fake SqlClient — the
 * comparison tree's whole-replace round-trip, position ordering, profile isolation (spec 023),
 * and the semantic-alignment crosswalk's upsert/list/cleanup behavior (spec 024).
 */
import { describe, expect, it } from "vitest";
import { createComparisonRepo } from "./comparisonRepositories";
import type {
  ComparisonAlignmentRow,
  ComparisonProfileItemRow,
  ComparisonProfileRow,
  SqlClient,
} from "./types";

function makeFakeSql() {
  const profileRows = new Map<string, ComparisonProfileRow>();
  const itemRows = new Map<string, ComparisonProfileItemRow>();
  const alignmentRows = new Map<string, ComparisonAlignmentRow>();
  const client: SqlClient = {
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("SELECT * FROM comparison_profiles WHERE id = ?")) {
        const [id] = params as [string];
        const row = profileRows.get(id);
        return Promise.resolve((row === undefined ? [] : [row]) as Row[]);
      }
      if (sql.startsWith("SELECT * FROM comparison_profiles")) {
        const rows = [...profileRows.values()].sort(
          (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
        );
        return Promise.resolve(rows as Row[]);
      }
      if (sql.startsWith("SELECT * FROM comparison_profile_items WHERE profile_id = ?")) {
        const [profileId] = params as [string];
        const rows = [...itemRows.values()]
          .filter((row) => row.profile_id === profileId)
          .sort((a, b) => a.position - b.position);
        return Promise.resolve(rows as Row[]);
      }
      if (sql.startsWith("SELECT * FROM comparison_alignments WHERE profile_id = ?")) {
        const [profileId] = params as [string];
        const rows = [...alignmentRows.values()]
          .filter((row) => row.profile_id === profileId)
          .sort((a, b) => a.judged_at.localeCompare(b.judged_at));
        return Promise.resolve(rows as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("DELETE FROM comparison_alignments WHERE profile_id = ?")) {
        const [profileId] = params as [string];
        for (const [key, row] of alignmentRows) {
          if (row.profile_id === profileId) alignmentRows.delete(key);
        }
      } else if (sql.startsWith("DELETE FROM comparison_profile_items WHERE profile_id = ?")) {
        const [profileId] = params as [string];
        for (const [id, row] of itemRows) {
          if (row.profile_id === profileId) itemRows.delete(id);
        }
      } else if (sql.startsWith("DELETE FROM comparison_profiles WHERE id = ?")) {
        const [id] = params as [string];
        profileRows.delete(id);
      } else if (sql.startsWith("INSERT OR REPLACE INTO comparison_profiles")) {
        const [id, title, origin, description, source_note, created_at] = params as [
          string,
          string,
          "builtin" | "searched",
          string,
          string,
          string,
        ];
        profileRows.set(id, { id, title, origin, description, source_note, created_at });
      } else if (sql.startsWith("INSERT OR REPLACE INTO comparison_profile_items")) {
        const [id, profile_id, parent_id, label, aliases_json, source_ref, position] = params as [
          string,
          string,
          string | null,
          string,
          string,
          string,
          number,
        ];
        itemRows.set(id, {
          id,
          profile_id,
          parent_id,
          label,
          aliases_json,
          source_ref,
          position,
        });
      } else if (sql.startsWith("INSERT OR REPLACE INTO comparison_alignments")) {
        const [item_id, node_id, profile_id, verdict, confidence, reason, judged_at] = params as [
          string,
          string,
          string,
          "same" | "different",
          "高" | "中" | "低",
          string,
          string,
        ];
        alignmentRows.set(`${item_id}:${node_id}`, {
          item_id,
          node_id,
          profile_id,
          verdict,
          confidence,
          reason,
          judged_at,
        });
      }
      return Promise.resolve();
    },
  };
  return { client, profileRows, itemRows, alignmentRows };
}

function profile(overrides: Partial<ComparisonProfileRow> = {}): ComparisonProfileRow {
  return {
    id: "p1",
    title: "计算机科学本科课程",
    origin: "searched",
    description: "某校计算机科学系公开的本科培养方案",
    source_note: "https://example.edu/cs-curriculum",
    created_at: "2026-08-09T10:00:00.000Z",
    ...overrides,
  };
}

function item(overrides: Partial<ComparisonProfileItemRow> = {}): ComparisonProfileItemRow {
  return {
    id: "i1",
    profile_id: "p1",
    parent_id: null,
    label: "数据结构",
    aliases_json: "[]",
    source_ref: "https://example.edu/cs-curriculum#ds",
    position: 0,
    ...overrides,
  };
}

function alignment(overrides: Partial<ComparisonAlignmentRow> = {}): ComparisonAlignmentRow {
  return {
    item_id: "i1",
    node_id: "n1",
    profile_id: "p1",
    verdict: "same",
    confidence: "高",
    reason: "两者都指代同一个数据结构概念",
    judged_at: "2026-08-09T11:00:00.000Z",
    ...overrides,
  };
}

describe("createComparisonRepo", () => {
  it("round-trips replaceProfile/getProfile/listItems in position order", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    const items = [
      item({ id: "i2", label: "操作系统", position: 1 }),
      item({ id: "i1", label: "数据结构", position: 0 }),
      item({ id: "i3", label: "计算机网络", parent_id: "i2", position: 2 }),
    ];
    await repo.replaceProfile(profile(), items);

    expect(await repo.getProfile("p1")).toEqual(profile());
    const stored = await repo.listItems("p1");
    expect(stored.map((row) => row.label)).toEqual(["数据结构", "操作系统", "计算机网络"]);
    expect(stored[2]?.parent_id).toBe("i2");
  });

  it("replace overwrites previous items rather than accumulating them", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.replaceProfile(profile(), [item({ id: "i1", label: "数据结构", position: 0 })]);
    await repo.replaceProfile(profile({ title: "更新后的课程" }), [
      item({ id: "i9", label: "编译原理", position: 0 }),
    ]);

    const stored = await repo.listItems("p1");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.label).toBe("编译原理");
    expect((await repo.getProfile("p1"))?.title).toBe("更新后的课程");
  });

  it("deleteProfile removes both the profile row and its items", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.replaceProfile(profile(), [item()]);
    await repo.deleteProfile("p1");

    expect(await repo.getProfile("p1")).toBeNull();
    expect(await repo.listItems("p1")).toEqual([]);
  });

  it("keeps profiles separate", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.replaceProfile(profile({ id: "p1" }), [item({ id: "i1", profile_id: "p1" })]);
    await repo.replaceProfile(profile({ id: "p2", title: "另一份课程" }), [
      item({ id: "i2", profile_id: "p2", label: "线性代数" }),
    ]);

    expect((await repo.listItems("p1")).map((row) => row.label)).toEqual(["数据结构"]);
    expect((await repo.listItems("p2")).map((row) => row.label)).toEqual(["线性代数"]);
    const profiles = await repo.listProfiles();
    expect(profiles.map((row) => row.id).sort()).toEqual(["p1", "p2"]);
  });

  it("round-trips upsertAlignments/listAlignments in judged_at order", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.upsertAlignments([
      alignment({
        item_id: "i2",
        node_id: "n2",
        verdict: "different",
        confidence: "低",
        judged_at: "2026-08-09T12:00:00.000Z",
      }),
      alignment({ item_id: "i1", node_id: "n1", judged_at: "2026-08-09T11:00:00.000Z" }),
    ]);

    const stored = await repo.listAlignments("p1");
    expect(stored.map((row) => `${row.item_id}:${row.node_id}`)).toEqual(["i1:n1", "i2:n2"]);
    expect(stored[0]?.verdict).toBe("same");
    expect(stored[1]?.verdict).toBe("different");
    expect(stored[1]?.confidence).toBe("低");
  });

  it("re-upserting the same pair overwrites instead of duplicating", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.upsertAlignments([alignment({ verdict: "same", confidence: "高" })]);
    await repo.upsertAlignments([
      alignment({ verdict: "different", confidence: "中", reason: "重新判定为不同概念" }),
    ]);

    const stored = await repo.listAlignments("p1");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.verdict).toBe("different");
    expect(stored[0]?.confidence).toBe("中");
    expect(stored[0]?.reason).toBe("重新判定为不同概念");
  });

  it("replaceProfile clears that profile's alignments", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.replaceProfile(profile(), [item()]);
    await repo.upsertAlignments([alignment()]);
    expect(await repo.listAlignments("p1")).toHaveLength(1);

    await repo.replaceProfile(profile({ title: "更新后的课程" }), [
      item({ id: "i9", label: "编译原理" }),
    ]);

    expect(await repo.listAlignments("p1")).toEqual([]);
  });

  it("deleteProfile clears that profile's alignments", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.replaceProfile(profile(), [item()]);
    await repo.upsertAlignments([alignment()]);

    await repo.deleteProfile("p1");

    expect(await repo.listAlignments("p1")).toEqual([]);
  });
});
