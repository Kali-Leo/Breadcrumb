/**
 * Purpose: relative-assertion tests for computeMastery — real footprints beat self-report,
 * self-report beats nothing, both fade with neglect, and a node nobody was ever observed
 * retrieving cannot reach "lit" however often it was mentioned. Fixed NOW for determinism.
 */
import type { MasteryClaimRow, NodeSightingGrade, NodeSightingRow } from "@breadcrumb/core-db";
import { describe, expect, it } from "vitest";
import {
  computeMastery,
  DIM_THRESHOLD,
  hasRetrievalEvidence,
  LIT_THRESHOLD,
  masteryTier,
} from "./mastery";

const NOW = "2026-07-29T12:00:00Z";

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 24 * 60 * 60 * 1000).toISOString();
}

function sighting(nodeId: string, createdAt: string, grade?: NodeSightingGrade): NodeSightingRow {
  return {
    id: `s-${nodeId}-${createdAt}-${grade ?? "default"}`,
    node_id: nodeId,
    conversation_id: "c1",
    message_id: null,
    created_at: createdAt,
    origin_node_id: null,
    ...(grade === undefined ? {} : { grade }),
  };
}

function claim(
  nodeId: string,
  level: MasteryClaimRow["level"],
  createdAt: string,
): MasteryClaimRow {
  return {
    id: `cl-${nodeId}-${createdAt}`,
    node_id: nodeId,
    level,
    source: "self-report",
    created_at: createdAt,
  };
}

describe("computeMastery", () => {
  it("ranks: recalled-on-demand node > merely-met node > no-evidence node", () => {
    const sightings = [
      sighting("recalled", daysAgo(30)),
      sighting("recalled", daysAgo(20)),
      sighting("recalled", daysAgo(1), "easy"),
      sighting("merely-met", daysAgo(30)),
      sighting("merely-met", daysAgo(20)),
      sighting("merely-met", daysAgo(10)),
      sighting("merely-met", daysAgo(1)),
    ];
    const claims = [claim("self-report-only", "learned", daysAgo(1))];

    const mastery = computeMastery(sightings, claims, NOW);

    const recalled = mastery.get("recalled") ?? 0;
    const merelyMet = mastery.get("merely-met") ?? 0;
    const selfReportOnly = mastery.get("self-report-only") ?? 0;
    const noEvidence = mastery.get("no-evidence") ?? 0;

    expect(recalled).toBeGreaterThan(merelyMet);
    expect(merelyMet).toBeGreaterThan(noEvidence);
    expect(selfReportOnly).toBeGreaterThan(noEvidence);
    expect(noEvidence).toBe(0);
  });

  it("weighs a 'learned' claim above a 'familiar' claim of the same age", () => {
    const claims = [
      claim("learned-node", "learned", daysAgo(1)),
      claim("familiar-node", "familiar", daysAgo(1)),
    ];
    const mastery = computeMastery([], claims, NOW);
    expect(mastery.get("learned-node") ?? 0).toBeGreaterThan(mastery.get("familiar-node") ?? 0);
  });

  it("decays a self-report-only claim over time", () => {
    const claims = [claim("recent", "learned", daysAgo(1)), claim("stale", "learned", daysAgo(90))];
    const mastery = computeMastery([], claims, NOW);
    expect(mastery.get("recent") ?? 0).toBeGreaterThan(mastery.get("stale") ?? 0);
  });

  it("decays a long-neglected sighted node relative to a fresh one", () => {
    const sightings = [
      sighting("fresh", daysAgo(0), "hard"),
      sighting("neglected", daysAgo(90), "hard"),
    ];
    const mastery = computeMastery(sightings, [], NOW);
    expect(mastery.get("fresh") ?? 0).toBeGreaterThan(mastery.get("neglected") ?? 0);
  });

  it("never lets self-report push a node above its real-footprint retention ceiling", () => {
    const sightings = [sighting("solid", daysAgo(20), "hard")];
    const withoutClaim = computeMastery(sightings, [], NOW).get("solid") ?? 0;
    const withClaim =
      computeMastery(sightings, [claim("solid", "learned", daysAgo(0))], NOW).get("solid") ?? 0;
    expect(withClaim).toBeGreaterThanOrEqual(withoutClaim);
    expect(withClaim).toBeLessThanOrEqual(1);
  });

  it("caps a node the learner was never observed retrieving below the lit tier", () => {
    // Four fresh passive mentions — the exact shape that used to read 1.0 and print "已完成"
    // on a concept the learner was never asked a single question about (audit G1).
    const merelyMet = [
      sighting("mentioned", daysAgo(3)),
      sighting("mentioned", daysAgo(2)),
      sighting("mentioned", daysAgo(1)),
      sighting("mentioned", daysAgo(0)),
    ];
    const value = computeMastery(merelyMet, [], NOW).get("mentioned") ?? 0;
    expect(value).toBeLessThanOrEqual(DIM_THRESHOLD);
    expect(masteryTier(value)).not.toBe("lit");
  });

  it("lets one correct guess lift that same node past the cap", () => {
    const merelyMet = [
      sighting("mentioned", daysAgo(3)),
      sighting("mentioned", daysAgo(2)),
      sighting("mentioned", daysAgo(1)),
    ];
    const capped = computeMastery(merelyMet, [], NOW).get("mentioned") ?? 0;
    const afterGuess =
      computeMastery([...merelyMet, sighting("mentioned", daysAgo(0), "easy")], [], NOW).get(
        "mentioned",
      ) ?? 0;
    expect(capped).toBeLessThanOrEqual(DIM_THRESHOLD);
    expect(afterGuess).toBeGreaterThan(DIM_THRESHOLD);
    expect(masteryTier(afterGuess)).toBe("lit");
  });

  it("keeps the cap when the only retrieval attempt failed", () => {
    // 'again' is observed evidence, but evidence of NOT knowing it — it must not act as the
    // key that unlocks the ceiling.
    const failed = [
      sighting("guessed-wrong", daysAgo(1)),
      sighting("guessed-wrong", daysAgo(0), "again"),
    ];
    const value = computeMastery(failed, [], NOW).get("guessed-wrong") ?? 0;
    expect(value).toBeLessThanOrEqual(DIM_THRESHOLD);
  });

  it("caps a self-report-only node too — saying you learned it is not retrieving it", () => {
    const claims = [claim("said-so", "learned", daysAgo(0))];
    const value = computeMastery([], claims, NOW).get("said-so") ?? 0;
    expect(value).toBeLessThanOrEqual(DIM_THRESHOLD);
  });

  it("treats an accepted teach-back as the retrieval it is", () => {
    const sightings = [sighting("explained", daysAgo(1))];
    const capped = computeMastery(sightings, [], NOW).get("explained") ?? 0;
    const taught =
      computeMastery(sightings, [claim("explained", "taught_principled", daysAgo(0))], NOW).get(
        "explained",
      ) ?? 0;
    expect(capped).toBeLessThanOrEqual(DIM_THRESHOLD);
    expect(taught).toBeGreaterThan(DIM_THRESHOLD);
  });
});

describe("hasRetrievalEvidence", () => {
  it("accepts a graded guess and a judged teach-back, and nothing else", () => {
    const met = sighting("n", daysAgo(1));
    expect(hasRetrievalEvidence([met], [])).toBe(false);
    expect(hasRetrievalEvidence([met], [claim("n", "learned", daysAgo(1))])).toBe(false);
    expect(hasRetrievalEvidence([met], [claim("n", "familiar", daysAgo(1))])).toBe(false);
    expect(hasRetrievalEvidence([sighting("n", daysAgo(1), "again")], [])).toBe(false);

    expect(hasRetrievalEvidence([sighting("n", daysAgo(1), "hard")], [])).toBe(true);
    expect(hasRetrievalEvidence([sighting("n", daysAgo(1), "easy")], [])).toBe(true);
    expect(hasRetrievalEvidence([met], [claim("n", "taught_surface", daysAgo(1))])).toBe(true);
    expect(hasRetrievalEvidence([met], [claim("n", "taught_principled", daysAgo(1))])).toBe(true);
  });

  it("says no when there is no evidence at all", () => {
    expect(hasRetrievalEvidence([], [])).toBe(false);
  });
});

describe("masteryTier", () => {
  it("classifies the three tiers at their boundaries", () => {
    expect(masteryTier(LIT_THRESHOLD)).toBe("lit");
    expect(masteryTier(LIT_THRESHOLD - 0.01)).toBe("dim");
    expect(masteryTier(DIM_THRESHOLD)).toBe("dim");
    expect(masteryTier(DIM_THRESHOLD - 0.01)).toBe("unlit");
  });
});
