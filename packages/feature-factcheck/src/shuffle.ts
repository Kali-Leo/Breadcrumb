/**
 * Purpose: deterministic evidence ordering. LLM judges carry a position bias strong enough
 * to reach a 75% first-slot preference (arXiv:2606.19544), so the order evidence reaches the
 * judge must not be the order the providers happened to return it in. Seeding from the claim
 * text keeps the same claim reproducible across runs. The FNV-1a + mulberry32 Fisher-Yates
 * itself lives in @breadcrumb/core-random (2026-09-02) — it was copied here from the map
 * module, and from there into simlab, before there was a core package to hold it.
 * Main exports: seededShuffle.
 */

export { seededShuffle } from "@breadcrumb/core-random";
