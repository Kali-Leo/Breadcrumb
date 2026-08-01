/**
 * Purpose: public entry of the simlab dev-tooling package — no product package or app may
 * ever depend on this; it exists only for `pnpm --filter @breadcrumb/simlab sim`/`test`.
 * Main exports: the temp-sqlite adapter (db/), synthetic embeddings (embedding/).
 */
export * from "./db/repos";
export * from "./db/sqliteClient";
export * from "./embedding/embedNodes";
export * from "./embedding/syntheticEmbedding";
export * from "./persona/perturb";
export * from "./persona/schema";
export * from "./persona/seeds";
export * from "./persona/studentPrompt";
