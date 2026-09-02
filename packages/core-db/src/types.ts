/**
 * Purpose: the SqlClient interface each host app injects, plus the few unions that more than
 * one domain's row types share. The row types themselves live in the domain files next door
 * (chatTypes, knowledgeTypes, comparisonTypes, featureTypes, focusTypes, researchTypes,
 * diglotTypes, companionTypes), all re-exported from index.ts.
 * Main exports: SqlClient, SqlTransactionStatement, MessageRole, Currency, AlignmentVerdict,
 * AlignmentConfidence.
 */

/** One statement of an executeTransaction batch. */
export interface SqlTransactionStatement {
  readonly sql: string;
  readonly params?: readonly unknown[];
}

/** Minimal SQL access the host provides (tauri-plugin-sql in the app, fakes in tests). */
export interface SqlClient {
  /** Runs a SELECT; returns rows as objects keyed by column name. */
  select<Row>(sql: string, params?: readonly unknown[]): Promise<Row[]>;
  /** Runs a mutating statement (INSERT/UPDATE/DELETE/DDL). */
  execute(sql: string, params?: readonly unknown[]): Promise<void>;
  /** Runs the whole batch inside ONE database transaction: either every statement persists
   * or none does. Deliberately a batch of precomputed statements, not a callback — any reads
   * a caller needs happen BEFORE the call and are baked into the params. That is enough for
   * this single-user local app: the failure mode being defended against is a crash mid-write
   * corrupting a multi-statement invariant (write atomicity), not concurrent readers. */
  executeTransaction(statements: ReadonlyArray<SqlTransactionStatement>): Promise<void>;
}

export type MessageRole = "user" | "assistant" | "system";
export type Currency = "USD" | "CNY";

export type AlignmentVerdict = "same" | "different";
/** ASCII on purpose (migration 0047): this tier travels inside a JSON contract the judge is
 * separately instructed to answer in the learner's own language, so Chinese literals here
 * would fight that directive. */
export type AlignmentConfidence = "high" | "medium" | "low";
