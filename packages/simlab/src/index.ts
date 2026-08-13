/**
 * Purpose: public entry of the simlab dev-tooling package — no product package or app may
 * ever depend on this; it exists only for `pnpm --filter @breadcrumb/simlab sim`/`test`.
 * Main exports: the temp-sqlite adapter (db/), synthetic embeddings (embedding/), the persona
 * engine (persona/), the journey runner (runner/), the mechanical judges (judges/), and
 * shared PRNG utilities (util/).
 */
export * from "./db/repos";
export * from "./db/sqliteClient";
export * from "./embedding/embedNodes";
export * from "./embedding/syntheticEmbedding";
export * from "./judges/callLedger";
export * from "./judges/goldBaseline";
export * from "./judges/invariants";
export * from "./judges/invariantsFromRepos";
export * from "./judges/masteryTripwire";
export * from "./judges/metrics";
export * from "./judges/pressureLexicon";
export * from "./judges/scriptedRecovery";
export * from "./judges/targetConceptsRecall";
export * from "./judges/teachingDiscipline";
export * from "./judges/telemetry";
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
export * from "./runner/journeyDay";
export * from "./runner/nonStreamingChat";
export * from "./runner/pipeline";
export * from "./runner/plannerSnapshot";
export * from "./runner/pool";
export * from "./runner/student";
export * from "./runner/trailSummaryStage";
export * from "./runner/tutor";
export * from "./util/prng";
