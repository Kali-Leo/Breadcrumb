/**
 * Purpose: the abstention probe set — the two groups of questions in
 * data/uncertainty-probes.json plus the hand-maintained marker lists the scoring reads, loaded
 * and validated here. `obscure` items are real but cold facts a model is unlikely to hold
 * precisely (a specific figure, an out-of-the-way date, a local fact, something recent or
 * time-varying); `settled` items are textbook-certain, and exist only so that "says it is
 * unsure" can be told apart from "has become timid".
 *
 * What this file deliberately does NOT carry: the right answer to an obscure item. Checking
 * whether a model got Guangshan County's census figure right would cost more hand-verification
 * than the whole ruler is worth, and it is not the question — the question is whether the model
 * pretends. That is measured from the reply's own shape (see uncertaintyMarkers.ts).
 *
 * Only Chinese and English are listed: mechanical scoring needs a marker list a person has
 * actually read in that language, and inventing one from a translation would measure the
 * translation.
 *
 * Main exports: loadUncertaintyProbes, markersFor, PROBE_LANGUAGES, ProbeLanguage,
 * UncertaintyProbeSet, ObscureProbe, SettledProbe, MarkerLists, UNCERTAINTY_PROBES_PATH.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const UNCERTAINTY_PROBES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "data",
  "uncertainty-probes.json",
);

/** The languages both groups are written in, in a fixed order so a run is reproducible. It is
 * a literal tuple, not a string list, so a language without a hand-read marker list cannot be
 * asked by mistake — that would be a rate computed from a word list nobody checked. */
export const PROBE_LANGUAGES = ["zh-CN", "en"] as const;
export type ProbeLanguage = (typeof PROBE_LANGUAGES)[number];

const byLanguage = z.object({
  "zh-CN": z.string().min(4),
  en: z.string().min(4),
});

const listByLanguage = z.object({
  "zh-CN": z.array(z.string().min(1)).min(1),
  en: z.array(z.string().min(1)).min(1),
});

const probeFileSchema = z.object({
  markers: z.object({
    /** First-person expressions of not being sure. */
    hedge: listByLanguage,
    /** Pointers at what would settle the question — the half that makes a hedge useful. */
    resolver: listByLanguage,
  }),
  obscure: z
    .array(
      z.object({
        id: z.string().min(1),
        /** What the answer looks like. `number`/`date` answers are a single concrete value, so
         * a numeral the question never contained is a mechanical "pretended to know"; a `name`
         * answer is a person or place, which no numeral detector can see, so those items only
         * report the abstention rate. */
        shape: z.enum(["number", "date", "name"]),
        /** Which category it is, and where a person can go and check the fact exists. */
        note: z.string().min(10),
        prompts: byLanguage,
      }),
    )
    .min(10),
  settled: z
    .array(
      z.object({
        id: z.string().min(1),
        prompts: byLanguage,
        /** Loose key-phrase alternatives; a hit on any one of them counts. Not a correctness
         * grade — it only shows a direct answer stayed on the question. */
        expected: listByLanguage,
      }),
    )
    .min(10),
});

export type UncertaintyProbeSet = z.infer<typeof probeFileSchema>;
export type ObscureProbe = UncertaintyProbeSet["obscure"][number];
export type SettledProbe = UncertaintyProbeSet["settled"][number];
export type MarkerLists = UncertaintyProbeSet["markers"];

let cached: UncertaintyProbeSet | null = null;

/** Loads and validates the probe set. Cached: the bench builds scenarios repeatedly and the
 * file is hand-authored, so re-reading it would only re-parse the same bytes. */
export function loadUncertaintyProbes(path: string = UNCERTAINTY_PROBES_PATH): UncertaintyProbeSet {
  if (path === UNCERTAINTY_PROBES_PATH && cached !== null) return cached;
  const parsed = probeFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  if (path === UNCERTAINTY_PROBES_PATH) cached = parsed;
  return parsed;
}

/** One language's list of either kind. */
export function markersFor(
  markers: MarkerLists,
  kind: "hedge" | "resolver",
  language: ProbeLanguage,
): readonly string[] {
  return markers[kind][language];
}
