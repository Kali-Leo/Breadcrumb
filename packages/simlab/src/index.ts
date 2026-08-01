/**
 * Purpose: public entry of the simlab dev-tooling package — no product package or app may
 * ever depend on this; it exists only for `pnpm --filter @breadcrumb/simlab sim`/`test`.
 * Main exports: the temp-sqlite adapter (db/), synthetic embeddings (embedding/), the persona
 * engine (persona/), the journey runner (runner/), and shared PRNG utilities (util/).
 */
export * from "./db/repos";
export * from "./db/sqliteClient";
export * from "./embedding/embedNodes";
export * from "./embedding/syntheticEmbedding";
export * from "./persona/perturb";
export * from "./persona/schema";
export * from "./persona/seeds";
export * from "./persona/studentPrompt";
export * from "./runner/artifacts";
export * from "./runner/config";
export * from "./runner/conversation";
export * from "./runner/costGuard";
export * from "./runner/dayDigest";
export * from "./runner/journey";
export * from "./runner/journeyActions";
export * from "./runner/nonStreamingChat";
export * from "./runner/pipeline";
export * from "./runner/plannerSnapshot";
export * from "./runner/pool";
export * from "./runner/student";
export * from "./runner/tutor";
export * from "./util/prng";
