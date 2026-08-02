/**
 * Purpose: unit tests for day-boundary math and the no-pressure, no-praise tone contract of
 * the summary prompt.
 */
import { describe, expect, it } from "vitest";
import { buildTrailSummaryMessages, localDateString, localDayRange } from "./index";

describe("localDateString", () => {
  it("formats the local calendar date", () => {
    expect(localDateString(new Date(2026, 6, 29, 15, 30))).toBe("2026-07-29");
  });
});

describe("localDayRange", () => {
  it("covers exactly one local day starting at midnight", () => {
    const { fromIso, toIso } = localDayRange(new Date(2026, 6, 29, 15, 30), 0);
    const from = new Date(fromIso);
    const to = new Date(toIso);
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(from.getHours()).toBe(0);
    expect(from.getDate()).toBe(29);
  });

  it("shifts backwards for yesterday", () => {
    const { fromIso } = localDayRange(new Date(2026, 6, 29, 15, 30), -1);
    expect(new Date(fromIso).getDate()).toBe(28);
  });
});

describe("buildTrailSummaryMessages", () => {
  const node = {
    id: "n1",
    conversation_id: "c1",
    parent_id: null,
    label: "闭包",
    summary: "函数携带其词法作用域",
    kind: "concept" as const,
    source_message_id: null,
    created_at: "2026-07-28T12:00:00Z",
  };

  it("includes every node label in the user message", () => {
    const messages = buildTrailSummaryMessages([node]);
    expect(messages[1]?.content).toContain("闭包");
  });

  it("forbids pressure language and evaluative praise in the system prompt (product principle 1)", () => {
    const systemPrompt = buildTrailSummaryMessages([node])[0]?.content ?? "";
    expect(systemPrompt).toContain("禁止");
    expect(systemPrompt).toContain("不评价");
  });
});
