/**
 * Purpose: the diglot weave data layer as one repo object, composed from its two halves so
 * every existing caller keeps a single handle. Split by table group only: word states/events/
 * guesses in diglotWordRepositories.ts, packs and context embeddings in
 * diglotPackRepositories.ts.
 * Main exports: createDiglotRepo factory.
 */
import { createDiglotPackRepo } from "./diglotPackRepositories";
import { createDiglotWordRepo } from "./diglotWordRepositories";
import type { SqlClient } from "./types";

export function createDiglotRepo(sql: SqlClient) {
  return { ...createDiglotWordRepo(sql), ...createDiglotPackRepo(sql) };
}
