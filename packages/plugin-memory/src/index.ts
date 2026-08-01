/**
 * Purpose: public entry of the memory plugin (headless logic only — UI lives in the
 * desktop app).
 * Main exports: FSRS retention (retention.ts) and the evidence-modulated mastery estimate
 * plus its three-tier thresholds (mastery.ts).
 */
export * from "./mastery";
export * from "./retention";
