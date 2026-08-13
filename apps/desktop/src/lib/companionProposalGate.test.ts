/**
 * Purpose: unit tests for the pure proposal-expiry sweep (spec 037) — pending proposals past
 * the 48h expiry window flip to 'expired' with no DB access; other statuses pass through
 * untouched.
 */
import type { CompanionProposalRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import { sweepExpiredProposals } from "./companionProposalGate";

function proposal(
  id: string,
  status: CompanionProposalRow["status"],
  createdAt: string,
): CompanionProposalRow {
  return {
    id,
    companion_id: "shichimi",
    node_id: null,
    topic: "闭包",
    status,
    created_at: createdAt,
    resolved_at: status === "pending" ? null : createdAt,
  };
}

describe("sweepExpiredProposals", () => {
  it("expires a pending proposal older than 48h", () => {
    const now = "2026-08-13T12:00:00.000Z";
    const stale = proposal("p1", "pending", "2026-08-10T00:00:00.000Z");
    const { updatedRows, newlyExpiredIds } = sweepExpiredProposals([stale], now);

    expect(newlyExpiredIds).toEqual(["p1"]);
    expect(updatedRows[0]).toMatchObject({ id: "p1", status: "expired", resolved_at: now });
  });

  it("leaves a fresh pending proposal untouched", () => {
    const now = "2026-08-13T12:00:00.000Z";
    const fresh = proposal("p2", "pending", "2026-08-13T00:00:00.000Z");
    const { updatedRows, newlyExpiredIds } = sweepExpiredProposals([fresh], now);

    expect(newlyExpiredIds).toEqual([]);
    expect(updatedRows[0]).toEqual(fresh);
  });

  it("leaves already-resolved proposals untouched regardless of age", () => {
    const now = "2026-08-13T12:00:00.000Z";
    const declined = proposal("p3", "declined", "2026-08-01T00:00:00.000Z");
    const accepted = proposal("p4", "accepted", "2026-08-01T00:00:00.000Z");
    const { updatedRows, newlyExpiredIds } = sweepExpiredProposals([declined, accepted], now);

    expect(newlyExpiredIds).toEqual([]);
    expect(updatedRows).toEqual([declined, accepted]);
  });
});
