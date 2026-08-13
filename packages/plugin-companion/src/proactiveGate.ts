/**
 * Purpose: proactive-initiation decision gate (spec 037) — ported pattern from
 * thunlp/ProactiveAgent (ICLR 2025, Apache-2.0): the decision to speak is kept separate from
 * content generation, false alarms are avoided (daily cap, quiet hours), and a declined
 * proposal backs the companion off exponentially rather than re-asking. Pure, deterministic,
 * zero LLM calls — callers pass in recent proposal history and today's candidate topics.
 * Main exports: ProposalLike, CandidateTopic, GateInput, GateDecision, DEFAULT_QUIET_HOURS,
 * PROPOSAL_EXPIRY_HOURS, isProposalExpired, decideProposal.
 */

export interface ProposalLike {
  status: "pending" | "accepted" | "declined" | "expired";
  /** ISO 8601 timestamp. */
  created_at: string;
}

export interface CandidateTopic {
  nodeId: string | null;
  topic: string;
}

export interface GateInput {
  nowIso: string;
  /** Newest first — e.g. this companion's last 30 days of proposals. */
  recentProposals: readonly ProposalLike[];
  candidateTopics: readonly CandidateTopic[];
  /** Local-time window in which the gate never proposes. */
  quietHours: { startHour: number; endHour: number };
}

/** 22:00–08:00 local time — the default quiet window. */
export const DEFAULT_QUIET_HOURS: { startHour: number; endHour: number } = {
  startHour: 22,
  endHour: 8,
};

export type GateDecision =
  | { verdict: "propose"; topic: string; nodeId: string | null }
  | {
      verdict: "silent";
      reason: "no-candidates" | "daily-cap" | "quiet-hours" | "backoff" | "pending-exists";
    };

/** A pending proposal older than this should be marked 'expired' by the caller before the
 * next gate run — expiry is neutral, never counted as a decline in the backoff streak. */
export const PROPOSAL_EXPIRY_HOURS = 48;

export function isProposalExpired(proposal: ProposalLike, nowIso: string): boolean {
  if (proposal.status !== "pending") return false;
  const hoursSinceCreated = (Date.parse(nowIso) - Date.parse(proposal.created_at)) / 3_600_000;
  return hoursSinceCreated > PROPOSAL_EXPIRY_HOURS;
}

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Local hour-of-day inside [startHour, endHour), handling a window that wraps past
 * midnight (e.g. 22 -> 8 covers 22:00..23:59 and 00:00..07:59). */
function isWithinQuietHours(
  hour: number,
  quietHours: { startHour: number; endHour: number },
): boolean {
  const { startHour, endHour } = quietHours;
  if (startHour === endHour) return false; // zero-width window never blocks
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  return hour >= startHour || hour < endHour;
}

/** Consecutive 'declined' proposals at the head of `recentProposals` (newest first),
 * skipping over 'expired' entries and stopping at the first 'accepted' (by rule 1 above, a
 * 'pending' entry can never appear here — its presence would already have short-circuited). */
function countConsecutiveDeclines(recentProposals: readonly ProposalLike[]): number {
  let count = 0;
  for (const proposal of recentProposals) {
    if (proposal.status === "expired") continue;
    if (proposal.status === "declined") {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

// Backoff ladder: 1st decline -> wait 1 day, 2nd -> 2, 3rd -> 4, 4th+ -> 8 (capped). That is
// 2^(consecutiveDeclines - 1), not 2^consecutiveDeclines — the spec's own "(1→2→4→8)" example
// only lines up with the minus-one form, so that is the contract this code follows.
const MAX_BACKOFF_DAYS = 8;

function requiredBackoffDays(consecutiveDeclines: number): number {
  return Math.min(MAX_BACKOFF_DAYS, 2 ** (consecutiveDeclines - 1));
}

/** Decides whether the companion may propose right now, and if so, which topic — content
 * generation happens only after this returns 'propose'. */
export function decideProposal(input: GateInput): GateDecision {
  if (input.recentProposals.some((proposal) => proposal.status === "pending")) {
    return { verdict: "silent", reason: "pending-exists" };
  }

  const now = new Date(input.nowIso);
  const today = localDateKey(now);
  const proposedToday = input.recentProposals.some(
    (proposal) => localDateKey(new Date(proposal.created_at)) === today,
  );
  if (proposedToday) {
    return { verdict: "silent", reason: "daily-cap" };
  }

  if (isWithinQuietHours(now.getHours(), input.quietHours)) {
    return { verdict: "silent", reason: "quiet-hours" };
  }

  const consecutiveDeclines = countConsecutiveDeclines(input.recentProposals);
  if (consecutiveDeclines > 0) {
    const newestDeclined = input.recentProposals.find((proposal) => proposal.status === "declined");
    if (newestDeclined !== undefined) {
      const hoursSinceDeclined =
        (now.getTime() - Date.parse(newestDeclined.created_at)) / 3_600_000;
      if (hoursSinceDeclined < requiredBackoffDays(consecutiveDeclines) * 24) {
        return { verdict: "silent", reason: "backoff" };
      }
    }
  }

  const firstCandidate = input.candidateTopics[0];
  if (firstCandidate === undefined) {
    return { verdict: "silent", reason: "no-candidates" };
  }
  return { verdict: "propose", topic: firstCandidate.topic, nodeId: firstCandidate.nodeId };
}
