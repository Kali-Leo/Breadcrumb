/**
 * Purpose: pure proposal-expiry sweep for the companion proactive gate (spec 037) — decides
 * which pending proposals in a batch have crossed the 48h expiry window, without touching the
 * database; companionStore performs the actual UPDATE for whatever this returns as newly expired.
 * Main exports: sweepExpiredProposals.
 */
import type { CompanionProposalRow } from "@breadcrumb/core-db";
import { isProposalExpired } from "@breadcrumb/plugin-companion";

export interface ProposalExpirySweep {
  /** Every input row, with 'pending' rows past the expiry window rewritten to 'expired' — feed
   * this straight into decideProposal's recentProposals input. */
  updatedRows: CompanionProposalRow[];
  /** Ids of rows that just crossed into 'expired' this sweep — the caller persists these. */
  newlyExpiredIds: string[];
}

export function sweepExpiredProposals(
  rows: readonly CompanionProposalRow[],
  nowIso: string,
): ProposalExpirySweep {
  const newlyExpiredIds: string[] = [];
  const updatedRows = rows.map((row) => {
    if (!isProposalExpired(row, nowIso)) return row;
    newlyExpiredIds.push(row.id);
    return { ...row, status: "expired" as const, resolved_at: nowIso };
  });
  return { updatedRows, newlyExpiredIds };
}
