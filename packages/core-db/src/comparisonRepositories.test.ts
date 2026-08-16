/**
 * Purpose: unit tests for createComparisonRepo using an in-memory fake SqlClient — the
 * comparison tree's whole-replace round-trip, position ordering, profile isolation (spec 023),
 * concept_id round-tripping through replaceProfile (spec 025), and category/item_kind
 * round-tripping (spec 026).
 */
import { describe, expect, it } from "vitest";
import { createComparisonRepo } from "./comparisonRepositories";
import { withSequentialTransactions } from "./transactionFallback";
import type { ComparisonProfileItemRow, ComparisonProfileRow, SqlClient } from "./types";

function makeFakeSql() {
  const profileRows = new Map<string, ComparisonProfileRow>();
  const itemRows = new Map<string, ComparisonProfileItemRow>();
  const client: SqlClient = withSequentialTransactions({
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
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.startsWith("DELETE FROM comparison_profile_items WHERE profile_id = ?")) {
        const [profileId] = params as [string];
        for (const [id, row] of itemRows) {
          if (row.profile_id === profileId) itemRows.delete(id);
        }
      } else if (sql.startsWith("DELETE FROM comparison_profiles WHERE id = ?")) {
        const [id] = params as [string];
        profileRows.delete(id);
      } else if (sql.startsWith("INSERT OR REPLACE INTO comparison_profiles")) {
        const [id, title, origin, description, source_note, created_at, category] = params as [
          string,
          string,
          "builtin" | "searched",
          string,
          string,
          string,
          "curriculum" | "occupation",
        ];
        profileRows.set(id, { id, title, origin, description, source_note, created_at, category });
      } else if (sql.startsWith("INSERT OR REPLACE INTO comparison_profile_items")) {
        const [
          id,
          profile_id,
          parent_id,
          label,
          aliases_json,
          source_ref,
          position,
          concept_id,
          item_kind,
        ] = params as [
          string,
          string,
          string | null,
          string,
          string,
          string,
          number,
          string | null,
          "knowledge" | "practice" | "tool" | "structure",
        ];
        itemRows.set(id, {
          id,
          profile_id,
          parent_id,
          label,
          aliases_json,
          source_ref,
          position,
          concept_id,
          item_kind,
        });
      }
      return Promise.resolve();
    },
  });
  return { client, profileRows, itemRows };
}

function profile(overrides: Partial<ComparisonProfileRow> = {}): ComparisonProfileRow {
  return {
    id: "p1",
    title: "计算机科学本科课程",
    origin: "searched",
    description: "某校计算机科学系公开的本科培养方案",
    source_note: "https://example.edu/cs-curriculum",
    created_at: "2026-08-09T10:00:00.000Z",
    category: "curriculum",
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
    concept_id: null,
    item_kind: "knowledge",
    ...overrides,
  };
}

describe("createComparisonRepo", () => {
  it("round-trips replaceProfile/getProfile/listItems in position order", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    const items = [
      item({ id: "i2", label: "操作系统", position: 1 }),
      item({ id: "i1", label: "数据结构", position: 0, concept_id: "concept-data-structures" }),
      item({ id: "i3", label: "计算机网络", parent_id: "i2", position: 2, item_kind: "structure" }),
    ];
    await repo.replaceProfile(profile(), items);

    expect(await repo.getProfile("p1")).toEqual(profile());
    const stored = await repo.listItems("p1");
    expect(stored.map((row) => row.label)).toEqual(["数据结构", "操作系统", "计算机网络"]);
    expect(stored[2]?.parent_id).toBe("i2");
    // concept_id round-trips both the null (coarse/searched item) and string case.
    expect(stored[0]?.concept_id).toBe("concept-data-structures");
    expect(stored[1]?.concept_id).toBeNull();
    // item_kind round-trips per-item (spec 026).
    expect(stored[0]?.item_kind).toBe("knowledge");
    expect(stored[2]?.item_kind).toBe("structure");
  });

  it("round-trips an occupation-category profile with practice/tool item kinds (spec 026)", async () => {
    const { client } = makeFakeSql();
    const repo = createComparisonRepo(client);
    await repo.replaceProfile(
      profile({ id: "p3", title: "前端工程师·某人", category: "occupation" }),
      [
        item({ id: "j1", profile_id: "p3", label: "写过生产级 React 项目", item_kind: "practice" }),
        item({ id: "j2", profile_id: "p3", label: "Webpack", position: 1, item_kind: "tool" }),
      ],
    );

    const storedProfile = await repo.getProfile("p3");
    expect(storedProfile?.category).toBe("occupation");
    const storedItems = await repo.listItems("p3");
    expect(storedItems.map((row) => row.item_kind)).toEqual(["practice", "tool"]);
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
});
