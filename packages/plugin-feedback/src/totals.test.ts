/**
 * Purpose: unit tests for the cumulative totals — distinct concept/encounter counts, the
 * learning/settled word split at the stability threshold, and the chat-only conversation
 * count.
 */
import type { ConversationRow, DiglotWordStateRow, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { WORD_SETTLED_STABILITY_DAYS } from "./settled";
import { computeCumulativeTotals } from "./totals";

function sighting(nodeId: string, id: string): NodeSightingRow {
  return {
    id,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    origin_node_id: null,
  };
}

function wordState(lemma: string, stability: number): DiglotWordStateRow {
  return {
    lemma,
    pair: "zh:en",
    fsrs_json: JSON.stringify({
      stability,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      due: "2026-08-01T00:00:00.000Z",
      last_review: "2026-08-01T00:00:00.000Z",
    }),
    due: "2026-08-01T00:00:00.000Z",
    introduced_at: "2026-07-01T00:00:00.000Z",
    last_event_at: null,
  };
}

function conversation(id: string, kind: ConversationRow["kind"]): ConversationRow {
  return {
    id,
    title: id,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    kind,
    companion_id: null,
    auto_title: null,
    study_mode: 0,
  };
}

describe("computeCumulativeTotals", () => {
  it("is all zero for empty input", () => {
    expect(computeCumulativeTotals({ sightings: [], wordStates: [], conversations: [] })).toEqual({
      conceptsMet: 0,
      totalEncounters: 0,
      wordsLearning: 0,
      wordsSettled: 0,
      conversationCount: 0,
    });
  });

  it("counts distinct concepts separately from total encounters", () => {
    const sightings = [sighting("a", "s1"), sighting("a", "s2"), sighting("b", "s3")];
    const totals = computeCumulativeTotals({ sightings, wordStates: [], conversations: [] });
    expect(totals.conceptsMet).toBe(2);
    expect(totals.totalEncounters).toBe(3);
  });

  it("splits words at the settled-stability threshold, inclusive", () => {
    const wordStates = [
      wordState("below", WORD_SETTLED_STABILITY_DAYS - 0.01),
      wordState("exact", WORD_SETTLED_STABILITY_DAYS),
      wordState("above", WORD_SETTLED_STABILITY_DAYS + 10),
    ];
    const totals = computeCumulativeTotals({ sightings: [], wordStates, conversations: [] });
    expect(totals.wordsLearning).toBe(1);
    expect(totals.wordsSettled).toBe(2);
  });

  it("counts only 'chat' conversations, not practice or teach", () => {
    const conversations = [
      conversation("c1", "chat"),
      conversation("c2", "chat"),
      conversation("c3", "practice"),
      conversation("c4", "teach"),
    ];
    const totals = computeCumulativeTotals({ sightings: [], wordStates: [], conversations });
    expect(totals.conversationCount).toBe(2);
  });
});
