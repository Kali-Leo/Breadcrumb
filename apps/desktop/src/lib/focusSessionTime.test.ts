/**
 * Purpose: unit tests for formatFocusSessionTimestamp — today, yesterday, and older-date forms,
 * all relative to an injected `now`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "../i18n";
import { formatFocusSessionTimestamp } from "./focusSessionTime";

describe("formatFocusSessionTimestamp", () => {
  // The label is a catalogue sentence now, so the messages have to be loaded — which also
  // makes these assertions check the real wording rather than a template in this file.
  beforeAll(async () => {
    await initI18n();
  });

  const now = new Date(2026, 7, 14, 15, 30); // 2026-08-14 15:30 local

  it("renders today's timestamp as 今天 HH:mm", () => {
    const createdAt = new Date(2026, 7, 14, 9, 5).toISOString();
    expect(formatFocusSessionTimestamp(createdAt, now)).toBe("今天 09:05");
  });

  it("renders yesterday's timestamp as 昨天 HH:mm", () => {
    const createdAt = new Date(2026, 7, 13, 22, 0).toISOString();
    expect(formatFocusSessionTimestamp(createdAt, now)).toBe("昨天 22:00");
  });

  it("renders anything older as a plain date", () => {
    const createdAt = new Date(2026, 7, 1, 8, 0).toISOString();
    expect(formatFocusSessionTimestamp(createdAt, now)).toBe("2026-08-01");
  });
});
