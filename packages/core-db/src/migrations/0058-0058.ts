/**
 * Purpose: shipped migration 0058. Part of the append-only MIGRATIONS list assembled in
 * ./index.ts — see that file for the rules.
 * 0058 — the per-claim fact-check tables, gone with the feature that wrote them.
 *
 * That feature was the one that picked claims out of a finished answer, searched each one,
 * and had a model return a verdict per claim. It has been replaced by teaching against
 * retrieved source material and marking each sentence of the answer as grounded or not
 * (packages/feature-factcheck/src/grounding), which keeps no rows of its own: the marks are
 * recomputed from the answer and the passages that produced it.
 *
 * Dropped rather than left in place: an empty table nothing reads is a promise that the
 * feature might come back, and the rows that ARE in there are per-claim verdicts no part of
 * the product can render any more.
 * Main exports: MIGRATIONS_0058_0058.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0058_0058: readonly Migration[] = [
  {
    // Children first: factcheck_claims declares a foreign key to factcheck_runs.
    id: "0058_drop_factcheck",
    statements: [
      `DROP INDEX IF EXISTS idx_factcheck_claims_run;`,
      `DROP TABLE IF EXISTS factcheck_claims;`,
      `DROP INDEX IF EXISTS idx_factcheck_runs_conversation;`,
      `DROP TABLE IF EXISTS factcheck_runs;`,
    ],
  },
];
