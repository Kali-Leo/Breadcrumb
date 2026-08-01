/**
 * Purpose: deterministic persona variation — given a seed persona and an integer variant
 * number, produces a reproducible jittered behavior axis and a reproducible topic subset,
 * using a seeded mulberry32 PRNG (never Math.random, per spec 013's determinism rule).
 * Main exports: perturbPersona, mulberry32.
 */
import type { Persona, PersonaBehavior } from "./schema";

/** mulberry32: a small, fast, well-known 32-bit seeded PRNG. Returns a function yielding
 * successive floats in [0, 1); same seed -> same sequence, always. */
export function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combines the persona id and variant number into one 32-bit seed via FNV-1a, so distinct
 * (seed persona, variant number) pairs get distinct-but-reproducible PRNG streams. */
function seedFor(personaId: string, variantNumber: number): number {
  let hash = 0x811c9dc5;
  for (const source of [personaId, String(variantNumber)]) {
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

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
  const random = mulberry32(seedFor(seed.id, variantNumber));
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
