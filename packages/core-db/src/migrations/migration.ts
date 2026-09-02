/**
 * Purpose: the shape of one shipped migration, shared by every numbered segment file and by
 * the runner in ./index.ts. Kept in its own module so the segments never import the barrel
 * that imports them.
 * Main exports: Migration.
 */
export interface Migration {
  /** Stable id, ordered lexicographically, e.g. "0003_user_level_tree". */
  id: string;
  statements: readonly string[];
}
