/**
 * Purpose: unit tests for the safety module — manipulation-phrase detection, crisis-keyword
 * detection (including known false positives we accept), and the continuous-session break
 * reminder's boundary behavior.
 */
import { describe, expect, it } from "vitest";
import {
  BREAK_REMINDER_INTERVAL_MS,
  containsManipulation,
  detectCrisis,
  nextBreakReminderAt,
  shouldRemindBreak,
} from "./safety";

describe("containsManipulation", () => {
  it("flags a farewell-manipulation phrase (first lexicon-order hit wins)", () => {
    // "先别走" itself contains "别走" as a substring, and "别走" precedes "先别走" in the
    // lexicon, so it is the first hit — matching findPressureLexiconHits' lexicon-order
    // convention used elsewhere in the repo.
    expect(containsManipulation("先别走,再陪我一会儿")).toBe("别走");
  });

  it("flags a phrase whose only lexicon match is the longer entry", () => {
    expect(containsManipulation("怎么才来啊")).toBe("怎么才来");
  });

  it("returns null for plain text", () => {
    expect(containsManipulation("今天先到这里,下次继续。")).toBeNull();
  });
});

describe("detectCrisis", () => {
  it("matches Chinese crisis keywords", () => {
    expect(detectCrisis("我想自杀")).toBe(true);
    expect(detectCrisis("最近总想着自残")).toBe(true);
  });

  it("matches English crisis keywords case-insensitively", () => {
    expect(detectCrisis("I want to KILL MYSELF")).toBe(true);
  });

  it("does not match unrelated words containing similar characters", () => {
    expect(detectCrisis("我在图书馆自习")).toBe(false);
    expect(detectCrisis("电影已经杀青了")).toBe(false);
  });

  it("over-triggers on substrings like 'suicide prevention' (accepted current behavior)", () => {
    expect(detectCrisis("This hotline is for suicide prevention.")).toBe(true);
  });
});

describe("shouldRemindBreak", () => {
  const now = 0;
  const minutesAgo = (minutes: number): number => now - minutes * 60 * 1000;

  it("returns true for a continuous ~2h span ending near now", () => {
    const timestamps: number[] = [];
    for (let minutes = 125; minutes >= 0; minutes -= 5) {
      timestamps.push(minutesAgo(minutes));
    }
    expect(shouldRemindBreak(timestamps, now)).toBe(true);
  });

  it("returns false when a 20-minute gap splits the session below 2h continuous", () => {
    const blockA = [130, 120, 110, 100, 90, 80].map(minutesAgo);
    // 80 -> 60 is a 20-minute gap, exceeding the 15-minute continuity threshold.
    const blockB = [60, 50, 40, 30, 20, 10, 0].map(minutesAgo);
    expect(shouldRemindBreak([...blockA, ...blockB], now)).toBe(false);
  });

  it("returns false for a short session", () => {
    const timestamps = [30, 20, 10, 0].map(minutesAgo);
    expect(shouldRemindBreak(timestamps, now)).toBe(false);
  });

  it("returns false when there is no activity", () => {
    expect(shouldRemindBreak([], now)).toBe(false);
  });

  it("returns false when the most recent activity is stale (>15min before now)", () => {
    const timestamps = [140, 130, 120, 110, 20].map(minutesAgo);
    expect(shouldRemindBreak(timestamps, now)).toBe(false);
  });
});

describe("nextBreakReminderAt", () => {
  it("adds the break interval to the session start", () => {
    expect(nextBreakReminderAt(1000)).toBe(1000 + BREAK_REMINDER_INTERVAL_MS);
  });
});
