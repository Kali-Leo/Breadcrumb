/**
 * Purpose: keeps migration 0054 and the repository that reads those tables spelling the schema
 * the same way.
 *
 * The two are deliberately separate copies: the schema is designed in
 * feature-browsing-interest/eventStore.ts next to the queries that depend on it, and shipped
 * from core-db's append-only migration list, which must not import a feature package. This app
 * depends on both, so this is the one place the two can be laid side by side — and a drift
 * between them would not be an error anywhere else. It would be a column the repository selects
 * and the table does not have, on a fresh install only.
 */
import { MIGRATIONS } from "@breadcrumb/core-db";
import { BROWSING_EVENTS_MIGRATION } from "@breadcrumb/feature-browsing-interest";
import { describe, expect, it } from "vitest";

describe("the browsing tables", () => {
  it("are created exactly as the repository that reads them describes", () => {
    const shipped = MIGRATIONS.find((migration) => migration.id === BROWSING_EVENTS_MIGRATION.id);
    expect(shipped).toBeDefined();
    expect(shipped?.statements).toEqual([...BROWSING_EVENTS_MIGRATION.statements]);
  });
});
