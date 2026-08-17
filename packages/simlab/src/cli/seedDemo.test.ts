/**
 * Purpose: real-SQLite regression tests for the zero-LLM demo seed (spec 035 T7b) — row
 * counts per table, full reversibility (wipe touches only `demo-`/DEMO_PAIR rows), replayed
 * word fsrs_json is parseable with a real settled tail, and "today" carries real activity.
 */
import { cardFromJson } from "@breadcrumb/plugin-diglot-weave";
import { WORD_SETTLED_STABILITY_DAYS } from "@breadcrumb/plugin-feedback";
import { afterEach, describe, expect, it } from "vitest";
import { createTempDatabase, type TempDatabase } from "../db/sqliteClient";
import { DEMO_PAIR, insertDemoData, wipeDemoData } from "../seedDemo";

const NOW = new Date(2026, 7, 13, 9, 0, 0);

function localDayStart(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

async function countDemoRows(temp: TempDatabase, table: string, idLike = true): Promise<number> {
  const where = idLike ? "WHERE id LIKE 'demo-%'" : `WHERE pair = '${DEMO_PAIR}'`;
  const rows = await temp.sql.select<{ n: number }>(`SELECT COUNT(*) as n FROM ${table} ${where}`);
  return rows[0]?.n ?? 0;
}

describe("seedDemo (real sqlite)", () => {
  let temp: TempDatabase | null = null;

  afterEach(() => {
    temp?.close();
    temp = null;
  });

  it("writes a full demo landscape with real, believable numbers", async () => {
    temp = await createTempDatabase();
    const summary = await insertDemoData(temp.sql, NOW);

    expect(summary.conversations).toBe(4);
    expect(summary.messages).toBeGreaterThanOrEqual(14);
    expect(summary.nodes).toBe(39);
    expect(summary.sightings).toBeGreaterThanOrEqual(50);
    expect(summary.claims).toBe(6);
    expect(summary.wordStates).toBe(50);
    expect(summary.wordEvents).toBeGreaterThanOrEqual(60);
    expect(summary.wordGuesses).toBeGreaterThanOrEqual(8);

    expect(await countDemoRows(temp, "conversations")).toBe(4);
    expect(await countDemoRows(temp, "messages")).toBe(summary.messages);
    expect(await countDemoRows(temp, "knowledge_nodes")).toBe(39);
    expect(await countDemoRows(temp, "node_sightings")).toBe(summary.sightings);
    expect(await countDemoRows(temp, "mastery_claims")).toBe(6);
    expect(await countDemoRows(temp, "diglot_word_states", false)).toBe(50);
    expect(await countDemoRows(temp, "diglot_word_events")).toBe(summary.wordEvents);
    expect(await countDemoRows(temp, "diglot_word_guesses")).toBe(summary.wordGuesses);

    // Guesses within the last 30 days feed systemGauge's word sample (needs >= 5).
    const guesses = await temp.repos.diglot.listGuesses(DEMO_PAIR);
    const thirtyDaysAgoMs = NOW.getTime() - 30 * 86400000;
    const recentGuesses = guesses.filter((g) => Date.parse(g.created_at) >= thirtyDaysAgoMs);
    expect(recentGuesses.length).toBeGreaterThanOrEqual(8);

    // Every word's fsrs_json is a real, parseable FSRS card, and settled.ts's bar is crossed
    // by a healthy majority of the "diligent" bucket.
    const states = await temp.repos.diglot.listStates(DEMO_PAIR);
    expect(states).toHaveLength(50);
    const settledCount = states.filter(
      (state) => cardFromJson(state.fsrs_json).stability >= WORD_SETTLED_STABILITY_DAYS,
    ).length;
    expect(settledCount).toBeGreaterThanOrEqual(15);

    // Today carries real reencounter/new-concept/word activity (dailyBite + smallWins T2/T5).
    const todayStartMs = localDayStart(NOW).getTime();
    const sightings = await temp.repos.nodeSightings.listAll();
    const todaySightings = sightings.filter((s) => Date.parse(s.created_at) >= todayStartMs);
    expect(todaySightings.length).toBeGreaterThanOrEqual(4);

    const firstSightingByNode = new Map<string, string>();
    for (const s of [...sightings].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (!firstSightingByNode.has(s.node_id)) firstSightingByNode.set(s.node_id, s.created_at);
    }
    const todayNewNodes = todaySightings.filter(
      (s) =>
        firstSightingByNode.get(s.node_id) === s.created_at &&
        Date.parse(s.created_at) >= todayStartMs,
    );
    const todayReencounters = todaySightings.length - todayNewNodes.length;
    expect(todayNewNodes.length).toBeGreaterThanOrEqual(1);
    expect(todayReencounters).toBeGreaterThanOrEqual(3);

    const events = await temp.repos.diglot.listAllEvents(DEMO_PAIR);
    const todayWordEvents = events.filter((e) => Date.parse(e.created_at) >= todayStartMs);
    expect(todayWordEvents.length).toBeGreaterThanOrEqual(2);
    // Real-sqlite seeding takes 10s+ on slow CI runners (2026-08-17 CI timeouts).
  }, 60_000);

  it("is fully reversible: --wipe clears every demo row and leaves real data untouched", async () => {
    temp = await createTempDatabase();
    const realNow = "2026-05-01T09:00:00.000Z";
    await temp.repos.knowledgeNodes.insert({
      id: "real-node-1",
      parent_id: null,
      label: "真实用户节点",
      summary: "非演示数据。",
      kind: "concept",
      created_at: realNow,
    });
    await temp.repos.conversations.create({
      id: "real-conv-1",
      title: "真实对话",
      created_at: realNow,
      updated_at: realNow,
      kind: "chat",
    });

    await insertDemoData(temp.sql, NOW);
    expect(await countDemoRows(temp, "knowledge_nodes")).toBe(39);

    await wipeDemoData(temp.sql);

    for (const [table, idLike] of [
      ["conversations", true],
      ["messages", true],
      ["knowledge_nodes", true],
      ["node_sightings", true],
      ["mastery_claims", true],
      ["diglot_word_events", true],
      ["diglot_word_guesses", true],
      ["diglot_word_states", false],
    ] as const) {
      expect(await countDemoRows(temp, table, idLike)).toBe(0);
    }
    const packs = await temp.repos.diglot.listPacks();
    expect(packs.find((p) => p.id === DEMO_PAIR)).toBeUndefined();

    const remainingNode = await temp.repos.knowledgeNodes.listAll();
    expect(remainingNode.map((n) => n.id)).toEqual(["real-node-1"]);
    const remainingConversations = await temp.repos.conversations.listRecentFirst();
    expect(remainingConversations.map((c) => c.id)).toEqual(["real-conv-1"]);

    // wipe -> insert is idempotent: re-running produces the exact same row counts.
    const again = await insertDemoData(temp.sql, NOW);
    await wipeDemoData(temp.sql);
    const secondInsert = await insertDemoData(temp.sql, NOW);
    expect(secondInsert).toEqual(again);
    // Triple seed+wipe on real sqlite runs 18s+ on slow CI runners (2026-08-17 CI timeouts).
  }, 120_000);
});
