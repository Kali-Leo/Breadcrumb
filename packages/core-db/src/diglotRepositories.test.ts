/**
 * Purpose: unit tests for createDiglotRepo using an in-memory fake SqlClient — state
 * upsert/due-query semantics, append-only event and guess logs, pack lifecycle (spec 033).
 */
import { describe, expect, it } from "vitest";
import { createDiglotRepo } from "./diglotRepositories";
import type {
  DiglotLanguagePackRow,
  DiglotWordEventRow,
  DiglotWordGuessRow,
  DiglotWordStateRow,
} from "./diglotTypes";
import { withSequentialTransactions } from "./transactionFallback";
import type { SqlClient } from "./types";

function makeFakeSql() {
  const states = new Map<string, DiglotWordStateRow>();
  const events: DiglotWordEventRow[] = [];
  const guesses: DiglotWordGuessRow[] = [];
  const packs = new Map<string, DiglotLanguagePackRow>();
  const client: SqlClient = withSequentialTransactions({
    select: <Row>(sql: string, params?: readonly unknown[]) => {
      const p = (params ?? []) as string[];
      if (sql.includes("FROM diglot_word_states WHERE pair = ? AND due <= ?")) {
        const rows = [...states.values()]
          .filter((row) => row.pair === p[0] && row.due <= String(p[1]))
          .sort((a, b) => a.due.localeCompare(b.due))
          .slice(0, Number(p[2]));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM diglot_word_states WHERE pair = ?")) {
        const rows = [...states.values()]
          .filter((row) => row.pair === p[0])
          .sort((a, b) => a.lemma.localeCompare(b.lemma));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM diglot_word_events WHERE pair = ? AND lemma = ?")) {
        const rows = events
          .filter((row) => row.pair === p[0] && row.lemma === p[1])
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, Number(p[2]));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM diglot_word_guesses WHERE pair = ?")) {
        const rows = guesses
          .filter((row) => row.pair === p[0])
          .sort((a, b) => a.created_at.localeCompare(b.created_at));
        return Promise.resolve(rows as Row[]);
      }
      if (sql.includes("FROM diglot_language_packs")) {
        const rows = [...packs.values()].sort((a, b) => a.id.localeCompare(b.id));
        return Promise.resolve(rows as Row[]);
      }
      return Promise.resolve([] as Row[]);
    },
    execute: (sql: string, params?: readonly unknown[]) => {
      if (sql.includes("INTO diglot_word_states")) {
        const [lemma, pair, fsrs_json, due, introduced_at, last_event_at] = params as [
          string,
          string,
          string,
          string,
          string,
          string | null,
        ];
        states.set(`${lemma}|${pair}`, {
          lemma,
          pair,
          fsrs_json,
          due,
          introduced_at,
          last_event_at,
        });
      }
      if (sql.includes("INTO diglot_word_events")) {
        const [id, lemma, pair, kind, message_id, context_hash, latency_ms, created_at] =
          params as [
            string,
            string,
            string,
            DiglotWordEventRow["kind"],
            string | null,
            string | null,
            number | null,
            string,
          ];
        events.push({ id, lemma, pair, kind, message_id, context_hash, latency_ms, created_at });
      }
      if (sql.includes("INTO diglot_word_guesses")) {
        const [id, lemma, pair, guess, grade, context, latency_ms, created_at] = params as [
          string,
          string,
          string,
          string,
          DiglotWordGuessRow["grade"],
          string,
          number,
          string,
        ];
        guesses.push({ id, lemma, pair, guess, grade, context, latency_ms, created_at });
      }
      if (sql.includes("INTO diglot_language_packs")) {
        const [id, source_lang, target_lang, version, meta_json, installed_at] = params as [
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        packs.set(id, { id, source_lang, target_lang, version, meta_json, installed_at });
      }
      if (sql.startsWith("DELETE FROM diglot_language_packs")) {
        packs.delete(String((params as string[])[0]));
      }
      return Promise.resolve();
    },
  });
  return { client, states, events, guesses, packs };
}

function stateRow(overrides: Partial<DiglotWordStateRow>): DiglotWordStateRow {
  return {
    lemma: "book",
    pair: "zh:en",
    fsrs_json: "{}",
    due: "2026-08-12T00:00:00.000Z",
    introduced_at: "2026-08-01T00:00:00.000Z",
    last_event_at: null,
    ...overrides,
  };
}

describe("createDiglotRepo", () => {
  it("round-trips and overwrites word states keyed by (lemma, pair)", async () => {
    const repo = createDiglotRepo(makeFakeSql().client);
    await repo.upsertState(stateRow({ fsrs_json: '{"reps":1}' }));
    await repo.upsertState(stateRow({ fsrs_json: '{"reps":2}' }));
    await repo.upsertState(stateRow({ lemma: "book", pair: "zh:fr" }));
    const states = await repo.listStates("zh:en");
    expect(states).toHaveLength(1);
    expect(states[0]?.fsrs_json).toBe('{"reps":2}');
  });

  it("listDueStates filters by due date, orders oldest first and respects the limit", async () => {
    const repo = createDiglotRepo(makeFakeSql().client);
    await repo.upsertState(stateRow({ lemma: "late", due: "2026-08-10T00:00:00.000Z" }));
    await repo.upsertState(stateRow({ lemma: "later", due: "2026-08-11T00:00:00.000Z" }));
    await repo.upsertState(stateRow({ lemma: "future", due: "2026-09-01T00:00:00.000Z" }));
    const due = await repo.listDueStates("zh:en", "2026-08-12T00:00:00.000Z", 1);
    expect(due).toHaveLength(1);
    expect(due[0]?.lemma).toBe("late");
  });

  it("keeps the event log append-only and lists newest first with a limit", async () => {
    const repo = createDiglotRepo(makeFakeSql().client);
    const base = {
      lemma: "book",
      pair: "zh:en",
      message_id: null,
      context_hash: null,
      latency_ms: null,
    };
    await repo.insertEvent({ ...base, id: "e1", kind: "exposure", created_at: "t1" });
    await repo.insertEvent({ ...base, id: "e2", kind: "hover", created_at: "t2" });
    await repo.insertEvent({
      ...base,
      id: "e3",
      kind: "guess_correct",
      created_at: "t3",
      latency_ms: 900,
    });
    const recent = await repo.listRecentEvents("zh:en", "book", 2);
    expect(recent.map((event) => event.id)).toEqual(["e3", "e2"]);
  });

  it("stores guesses verbatim and lists them oldest first", async () => {
    const repo = createDiglotRepo(makeFakeSql().client);
    const base = { lemma: "book", pair: "zh:en", context: "我在读一本 book。", latency_ms: 1200 };
    await repo.insertGuess({ ...base, id: "g1", guess: "书", grade: "correct", created_at: "t1" });
    await repo.insertGuess({ ...base, id: "g2", guess: "杂志", grade: "wrong", created_at: "t2" });
    const rows = await repo.listGuesses("zh:en");
    expect(rows.map((row) => row.guess)).toEqual(["书", "杂志"]);
    expect(rows[1]?.grade).toBe("wrong");
  });

  it("registers, lists and deletes language packs without touching word states", async () => {
    const fake = makeFakeSql();
    const repo = createDiglotRepo(fake.client);
    await repo.upsertState(stateRow({}));
    await repo.upsertPack({
      id: "zh:en",
      source_lang: "zh",
      target_lang: "en",
      version: "2026.08",
      meta_json: "{}",
      installed_at: "t1",
    });
    expect(await repo.listPacks()).toHaveLength(1);
    await repo.deletePack("zh:en");
    expect(await repo.listPacks()).toHaveLength(0);
    expect(await repo.listStates("zh:en")).toHaveLength(1);
  });
});
