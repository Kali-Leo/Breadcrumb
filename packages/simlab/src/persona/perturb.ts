/**
 * Purpose: deterministic persona variation — given a seed persona and an integer variant
 * number, produces a reproducible jittered behavior axis and a reproducible topic subset,
 * using the shared seeded PRNG (never Math.random, per spec 013's determinism rule).
 * Main exports: perturbPersona.
 */
import { mulberry32, seedFromStrings } from "../util/prng";
import type { Persona, PersonaBehavior } from "./schema";

const JITTER_RANGE = 0.2;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Nudges one behavior-axis value by up to +/-JITTER_RANGE/2, clamped to [0, 1]. */
function jitter(value: number, random: () => number): number {
  return clamp01(value + (random() - 0.5) * JITTER_RANGE);
}

function jitterBehavior(behavior: PersonaBehavior, random: () => number): PersonaBehavior {
  return {
    typoRate: jitter(behavior.typoRate, random),
    codeSwitching: jitter(behavior.codeSwitching, random),
    driftTendency: jitter(behavior.driftTendency, random),
    boredomThreshold: jitter(behavior.boredomThreshold, random),
    confusionTendency: jitter(behavior.confusionTendency, random),
  };
}

/** Picks a deterministic non-empty subset of a list: keeps each element with probability
 * `keepProbability`, but always keeps at least one so the subset is never vacuous. */
function subset<Value>(
  items: readonly Value[],
  random: () => number,
  keepProbability: number,
): Value[] {
  if (items.length === 0) return [];
  const kept = items.filter(() => random() < keepProbability);
  return kept.length > 0 ? kept : [items[0] as Value];
}

const TOPIC_KEEP_PROBABILITY = 0.7;

/** Produces a reproducible variant of `seed`: jittered behavior axis, plus a reproducible
 * subset of knownTopics/misconceptions (targetConcepts is left intact — it's the ground
 * truth the harness scores recall against, not something to randomly drop). */
export function perturbPersona(seed: Persona, variantNumber: number): Persona {
  const random = mulberry32(seedFromStrings([seed.id, String(variantNumber)]));
  return {
    ...seed,
    id: `${seed.id}-v${variantNumber}`,
    name: `${seed.name}（变体${variantNumber}）`,
    knowledge: {
      knownTopics: subset(seed.knowledge.knownTopics, random, TOPIC_KEEP_PROBABILITY),
      misconceptions: subset(seed.knowledge.misconceptions, random, TOPIC_KEEP_PROBABILITY),
      targetConcepts: seed.knowledge.targetConcepts,
    },
    behavior: jitterBehavior(seed.behavior, random),
  };
}
