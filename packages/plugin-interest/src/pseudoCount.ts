/**
 * Purpose: empirical-Bayes estimate of the shrinkage pseudo-count K (spec 060 §4) — the one
 * hyper-parameter that CAN be learned from a single user's data, because it reads the whole
 * ensemble of nodes (method of moments: within-node noise vs between-node spread on the
 * curiosity dimension), not any single node's small sample. Pure math, no DB, no I/O.
 * Main exports: estimatePseudoCount, PSEUDO_COUNT_MIN, PSEUDO_COUNT_MAX.
 */
import type { InterestSignalRow } from "@breadcrumb/core-db";
import { K_PSEUDO } from "./aggregate";

export const PSEUDO_COUNT_MIN = 1;
export const PSEUDO_COUNT_MAX = 10;
/** Below these data thresholds the estimate would itself be noise — fall back to K_PSEUDO. */
const MIN_NODES_WITH_SIGNALS = 20;
const MIN_NODES_WITH_REPEATS = 5;

interface NodeSample {
  values: number[];
  mean: number;
}

function sampleVariance(values: readonly number[], mean: number): number {
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

/**
 * K ≈ pooled within-node variance / between-node variance of node means. A learner whose
 * nodes differ sharply (clear tastes, steady signals) gets a small K — shrink less; a learner
 * whose signals look like noise gets a large K — shrink more. Clamped to
 * [PSEUDO_COUNT_MIN, PSEUDO_COUNT_MAX]; near-zero between-variance means nodes are
 * indistinguishable, so the clamp's upper end applies. Returns K_PSEUDO (the cold-start
 * default) whenever the data is too thin for the estimate to mean anything.
 */
export function estimatePseudoCount(signals: readonly InterestSignalRow[]): number {
  const valuesByNode = new Map<string, number[]>();
  for (const signal of signals) {
    const values = valuesByNode.get(signal.node_id) ?? [];
    values.push(signal.curiosity);
    valuesByNode.set(signal.node_id, values);
  }
  if (valuesByNode.size < MIN_NODES_WITH_SIGNALS) return K_PSEUDO;

  const samples: NodeSample[] = [...valuesByNode.values()].map((values) => ({
    values,
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  }));
  const repeated = samples.filter((sample) => sample.values.length >= 2);
  if (repeated.length < MIN_NODES_WITH_REPEATS) return K_PSEUDO;

  // Pooled within-node variance over nodes that have repeats (single-signal nodes carry no
  // information about noise), weighted by their degrees of freedom.
  let withinSum = 0;
  let withinDegrees = 0;
  for (const sample of repeated) {
    withinSum += sampleVariance(sample.values, sample.mean) * (sample.values.length - 1);
    withinDegrees += sample.values.length - 1;
  }
  const withinVariance = withinDegrees > 0 ? withinSum / withinDegrees : 0;

  const grandMean = samples.reduce((sum, sample) => sum + sample.mean, 0) / samples.length;
  const betweenVariance = sampleVariance(
    samples.map((sample) => sample.mean),
    grandMean,
  );

  if (betweenVariance <= Number.EPSILON) return PSEUDO_COUNT_MAX;
  const ratio = withinVariance / betweenVariance;
  if (!Number.isFinite(ratio)) return K_PSEUDO;
  return Math.min(PSEUDO_COUNT_MAX, Math.max(PSEUDO_COUNT_MIN, ratio));
}
