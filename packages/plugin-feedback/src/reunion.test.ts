/**
 * Purpose: unit tests for reunion invite picking — waiting-count vs invite-count
 * separation, the below-threshold boundary, lowest-retention-first ordering, the limit
 * cap, and the empty case.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_REUNION_WAITING_THRESHOLD, pickReunionInvites } from "./reunion";

const titles = new Map([
  ["a", "A"],
  ["b", "B"],
  ["c", "C"],
]);

describe("pickReunionInvites", () => {
  it("returns no waiting and no invites for an empty map", () => {
    const result = pickReunionInvites(new Map(), titles, {
      limit: 3,
      waitingThreshold: DEFAULT_REUNION_WAITING_THRESHOLD,
    });
    expect(result).toEqual({ waitingCount: 0, invites: [] });
  });

  it("excludes a node exactly at the threshold (not below it)", () => {
    const result = pickReunionInvites(new Map([["a", DEFAULT_REUNION_WAITING_THRESHOLD]]), titles, {
      limit: 3,
      waitingThreshold: DEFAULT_REUNION_WAITING_THRESHOLD,
    });
    expect(result.waitingCount).toBe(0);
  });

  it("includes a node just below the threshold", () => {
    const result = pickReunionInvites(
      new Map([["a", DEFAULT_REUNION_WAITING_THRESHOLD - 0.01]]),
      titles,
      { limit: 3, waitingThreshold: DEFAULT_REUNION_WAITING_THRESHOLD },
    );
    expect(result.waitingCount).toBe(1);
    expect(result.invites).toEqual([
      { nodeId: "a", title: "A", retention: DEFAULT_REUNION_WAITING_THRESHOLD - 0.01 },
    ]);
  });

  it("orders invites lowest retention first and reports the full waiting count separately from a smaller limit", () => {
    const retentionByNode = new Map([
      ["a", 0.5],
      ["b", 0.1],
      ["c", 0.3],
    ]);
    const result = pickReunionInvites(retentionByNode, titles, { limit: 2, waitingThreshold: 0.6 });
    expect(result.waitingCount).toBe(3);
    expect(result.invites.map((invite) => invite.nodeId)).toEqual(["b", "c"]);
  });
});
