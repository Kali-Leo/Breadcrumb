/**
 * Purpose: shipped migration 0055. Part of the append-only MIGRATIONS list assembled in
 * ./index.ts — see that file for the rules.
 * 0055 — the decisive sentence a fact-check verdict rests on, kept instead of thrown away.
 *
 * The judge already had to copy that sentence verbatim out of the evidence (the anchor gate in
 * feature-factcheck checks it really is in there), and until now it was used for the check and
 * discarded. Storing it is what lets the chat show the source's own words under a claim rather
 * than a link the reader would have to leave the app to follow.
 * Main exports: MIGRATIONS_0055_0055.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0055_0055: readonly Migration[] = [
  {
    // DEFAULT '' rather than nullable: every older row was checked without a stored quote, and
    // "no quote" and "empty quote" are the same thing to every reader of this column.
    id: "0055_factcheck_quote",
    statements: [`ALTER TABLE factcheck_claims ADD COLUMN quote TEXT NOT NULL DEFAULT '';`],
  },
];
