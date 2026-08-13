/**
 * Purpose: unit tests for the proactive-initiation gate — every silent reason is reachable,
 * the daily cap uses the local calendar day, quiet hours wrap around midnight, the backoff
 * ladder follows 1->2->4->8 days and resets after an accepted proposal, expired proposals
 * never count toward the decline streak, and isProposalExpired's boundary is exact.
 * All timestamps are built from local (year, month, day, hour) components via `localIso` so
 * the assertions hold regardless of the machine's timezone — decideProposal itself reads
 * `new Date(iso).getHours()` / calendar fields in the same local timezone the test builds them in.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUIET_HOURS,
  decideProposal,
  isProposalExpired,
  PROPOSAL_EXPIRY_HOURS,
  type ProposalLike,
} from "./proactiveGate";

function localIso(year: number, month: number, day: number, hour = 12, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

const NOON_AUG13 = localIso(2026, 8, 13, 12);
const CANDIDATE = [{ nodeId: "n1", topic: "递归" }];

function baseInput(overrides: Partial<Parameters<typeof decideProposal>[0]> = {}) {
  return {
    nowIso: NOON_AUG13,
    recentProposals: [] as ProposalLike[],
    candidateTopics: CANDIDATE,
    quietHours: DEFAULT_QUIET_HOURS,
    ...overrides,
  };
}

describe("decideProposal", () => {
  it("proposes the first candidate when nothing blocks it", () => {
    expect(decideProposal(baseInput())).toEqual({
      verdict: "propose",
      topic: "递归",
      nodeId: "n1",
    });
  });

  it("is silent with 'no-candidates' when there are no candidate topics", () => {
    expect(decideProposal(baseInput({ candidateTopics: [] }))).toEqual({
      verdict: "silent",
      reason: "no-candidates",
    });
  });

  it("is silent with 'pending-exists' when a pending proposal exists", () => {
    const result = decideProposal(
      baseInput({ recentProposals: [{ status: "pending", created_at: localIso(2026, 8, 1) }] }),
    );
    expect(result).toEqual({ verdict: "silent", reason: "pending-exists" });
  });

  it("is silent with 'daily-cap' when any proposal was created earlier the same local day", () => {
    const result = decideProposal(
      baseInput({
        recentProposals: [{ status: "declined", created_at: localIso(2026, 8, 13, 1) }],
      }),
    );
    expect(result).toEqual({ verdict: "silent", reason: "daily-cap" });
  });

  it("is silent with 'quiet-hours' at 23:00 local and at 07:00 local, not at 12:00", () => {
    const at2300 = decideProposal(baseInput({ nowIso: localIso(2026, 8, 13, 23) }));
    const at0700 = decideProposal(baseInput({ nowIso: localIso(2026, 8, 14, 7) }));
    const at1200 = decideProposal(baseInput({ nowIso: localIso(2026, 8, 13, 12) }));
    expect(at2300).toEqual({ verdict: "silent", reason: "quiet-hours" });
    expect(at0700).toEqual({ verdict: "silent", reason: "quiet-hours" });
    expect(at1200).toEqual({ verdict: "propose", topic: "递归", nodeId: "n1" });
  });

  it("backs off 1 day after a single decline, and proposes again once elapsed", () => {
    const declinedAt = localIso(2026, 8, 10, 12);
    const stillWaiting = decideProposal(
      baseInput({
        nowIso: localIso(2026, 8, 11, 8, 1), // ~20h01m later, different calendar day
        recentProposals: [{ status: "declined", created_at: declinedAt }],
      }),
    );
    expect(stillWaiting).toEqual({ verdict: "silent", reason: "backoff" });

    const elapsed = decideProposal(
      baseInput({
        nowIso: localIso(2026, 8, 11, 13), // 25h later
        recentProposals: [{ status: "declined", created_at: declinedAt }],
      }),
    );
    expect(elapsed).toEqual({ verdict: "propose", topic: "递归", nodeId: "n1" });
  });

  it("follows the 1->2->4->8 day backoff ladder for consecutive declines", () => {
    const decline = (createdAt: string): ProposalLike => ({
      status: "declined",
      created_at: createdAt,
    });

    // Two consecutive declines, newest at Aug10 noon -> required wait is 2 days.
    const newestOfTwo = localIso(2026, 8, 10, 12);
    const olderOfTwo = localIso(2026, 8, 1, 12);
    const twoDeclinesStillWaiting = decideProposal(
      baseInput({
        nowIso: localIso(2026, 8, 11, 20), // ~32h after newest -> under the 48h requirement
        recentProposals: [decline(newestOfTwo), decline(olderOfTwo)],
      }),
    );
    expect(twoDeclinesStillWaiting).toEqual({ verdict: "silent", reason: "backoff" });

    const twoDeclinesElapsed = decideProposal(
      baseInput({
        nowIso: localIso(2026, 8, 12, 13), // ~49h after newest -> past the 48h requirement
        recentProposals: [decline(newestOfTwo), decline(olderOfTwo)],
      }),
    );
    expect(twoDeclinesElapsed).toEqual({ verdict: "propose", topic: "递归", nodeId: "n1" });

    // Four consecutive declines cap the wait at 8 days (192h): ~176h after the newest is
    // still short of the cap.
    const newestOfFour = localIso(2026, 8, 10, 12);
    const fourDeclines = decideProposal(
      baseInput({
        nowIso: localIso(2026, 8, 17, 20),
        recentProposals: [
          decline(newestOfFour),
          decline(localIso(2026, 8, 1, 12)),
          decline(localIso(2026, 7, 20, 12)),
          decline(localIso(2026, 7, 1, 12)),
        ],
      }),
    );
    expect(fourDeclines).toEqual({ verdict: "silent", reason: "backoff" });
  });

  it("resets the backoff streak after an accepted proposal", () => {
    const result = decideProposal(
      baseInput({
        nowIso: localIso(2026, 8, 13, 12),
        recentProposals: [
          { status: "accepted", created_at: localIso(2026, 8, 12, 12) },
          { status: "declined", created_at: localIso(2026, 8, 11, 12) },
          { status: "declined", created_at: localIso(2026, 8, 10, 12) },
        ],
      }),
    );
    expect(result).toEqual({ verdict: "propose", topic: "递归", nodeId: "n1" });
  });

  it("ignores expired proposals when counting the decline streak", () => {
    const result = decideProposal(
      baseInput({
        nowIso: localIso(2026, 8, 10, 13), // ~49h after the newest decline (Aug8 noon)
        recentProposals: [
          { status: "expired", created_at: localIso(2026, 8, 9, 18) },
          { status: "declined", created_at: localIso(2026, 8, 8, 12) },
          { status: "expired", created_at: localIso(2026, 8, 7, 9) },
          { status: "declined", created_at: localIso(2026, 8, 1, 12) },
        ],
      }),
    );
    // Two real declines (expired entries skipped) -> 48h wait, satisfied here.
    expect(result).toEqual({ verdict: "propose", topic: "递归", nodeId: "n1" });
  });
});

describe("isProposalExpired", () => {
  it("is false for a non-pending proposal regardless of age", () => {
    expect(
      isProposalExpired({ status: "declined", created_at: localIso(2020, 1, 1, 0) }, NOON_AUG13),
    ).toBe(false);
  });

  it("is false exactly at the expiry boundary and true just past it", () => {
    const createdAt = localIso(2026, 8, 11, 12);
    const atBoundary = new Date(
      Date.parse(createdAt) + PROPOSAL_EXPIRY_HOURS * 3_600_000,
    ).toISOString();
    const pastBoundary = new Date(
      Date.parse(createdAt) + PROPOSAL_EXPIRY_HOURS * 3_600_000 + 1,
    ).toISOString();
    expect(isProposalExpired({ status: "pending", created_at: createdAt }, atBoundary)).toBe(false);
    expect(isProposalExpired({ status: "pending", created_at: createdAt }, pastBoundary)).toBe(
      true,
    );
  });
});
