/**
 * Purpose: tests for the meetable review-debt window — only due words still circulating in
 * the recent conversation count, and the window forgets old topics (audit 2026-08-28 #3).
 */
import { describe, expect, it } from "vitest";
import { createMeetableDebtWindow } from "./reviewDebt";

describe("createMeetableDebtWindow", () => {
  it("counts only due words the recent conversation can still deliver", () => {
    const debtWindow = createMeetableDebtWindow(3);
    debtWindow.noteMessageCandidates(["书本", "朋友"]);
    debtWindow.noteMessageCandidates(["朋友", "喜欢"]);
    expect(debtWindow.countMeetable(["书本", "朋友", "喜欢", "光合作用"])).toBe(3);
    expect(debtWindow.countMeetable(["光合作用"])).toBe(0);
  });

  it("forgets words whose topic has left the window", () => {
    const debtWindow = createMeetableDebtWindow(2);
    debtWindow.noteMessageCandidates(["递归"]);
    debtWindow.noteMessageCandidates(["朋友"]);
    expect(debtWindow.countMeetable(["递归"])).toBe(1);
    debtWindow.noteMessageCandidates(["喜欢"]);
    expect(debtWindow.countMeetable(["递归"])).toBe(0);
    expect(debtWindow.countMeetable(["朋友", "喜欢"])).toBe(2);
  });

  it("ignores messages that offered no candidates at all", () => {
    const debtWindow = createMeetableDebtWindow(2);
    debtWindow.noteMessageCandidates(["递归"]);
    debtWindow.noteMessageCandidates([]);
    debtWindow.noteMessageCandidates([]);
    expect(debtWindow.countMeetable(["递归"])).toBe(1);
  });
});
