/**
 * Purpose: tests for the meetable review-debt window — only due words still circulating in
 * the recent conversation count, and the window forgets old topics (audit 2026-08-28 #3).
 */
import { describe, expect, it } from "vitest";
import { createMeetableDebtWindow } from "./reviewDebt";

describe("createMeetableDebtWindow", () => {
  it("counts only due words the recent conversation can still deliver", () => {
    const window = createMeetableDebtWindow(3);
    window.noteMessageCandidates(["书本", "朋友"]);
    window.noteMessageCandidates(["朋友", "喜欢"]);
    expect(window.countMeetable(["书本", "朋友", "喜欢", "光合作用"])).toBe(3);
    expect(window.countMeetable(["光合作用"])).toBe(0);
  });

  it("forgets words whose topic has left the window", () => {
    const window = createMeetableDebtWindow(2);
    window.noteMessageCandidates(["递归"]);
    window.noteMessageCandidates(["朋友"]);
    expect(window.countMeetable(["递归"])).toBe(1);
    window.noteMessageCandidates(["喜欢"]);
    expect(window.countMeetable(["递归"])).toBe(0);
    expect(window.countMeetable(["朋友", "喜欢"])).toBe(2);
  });

  it("ignores messages that offered no candidates at all", () => {
    const window = createMeetableDebtWindow(2);
    window.noteMessageCandidates(["递归"]);
    window.noteMessageCandidates([]);
    window.noteMessageCandidates([]);
    expect(window.countMeetable(["递归"])).toBe(1);
  });
});
