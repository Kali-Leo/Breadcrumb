/**
 * Purpose: Thompson sampling (textbook algorithm, Thompson 1933) over per-topic Beta(opens+1,
 * dislikes+1) posteriors, used to pick the discovery feed's explore-slot topics. Beta variates
 * are built from two Gamma(shape,1) draws via the Marsaglia–Tsang (2000) method; the random
 * source is injected so the whole pick is deterministic under test. Pure math, no DB, no I/O.
 * Main exports: pickExploreTopics.
 */

/** Standard normal draw via Box-Muller, from a caller-supplied [0,1) uniform source. */
function sampleStandardNormal(random: () => number): number {
  let u1 = 0;
  while (u1 === 0) u1 = random();
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Marsaglia–Tsang: exact for shape >= 1. For shape < 1, boosts via Gamma(shape) =
 * Gamma(shape+1) * U^(1/shape) (a standard correction for the method's shape >= 1 requirement). */
function sampleGamma(shape: number, random: () => number): number {
  if (shape < 1) {
    const boostUniform = random();
    return sampleGamma(shape + 1, random) * boostUniform ** (1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleStandardNormal(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(alpha, beta) via the Gamma-ratio construction: X~Gamma(alpha,1), Y~Gamma(beta,1),
 * X/(X+Y) ~ Beta(alpha, beta). */
function sampleBeta(alpha: number, beta: number, random: () => number): number {
  const x = sampleGamma(alpha, random);
  const y = sampleGamma(beta, random);
  return x / (x + y);
}

export interface TopicOpenDislikeStats {
  topicLabel: string;
  opens: number;
  dislikes: number;
}

/** Draws one Beta(opens+1, dislikes+1) sample per topic and returns the top `count` topics by
 * drawn value — the classic Thompson-sampling explore policy applied to topics instead of
 * arms. `random` must be a [0,1) uniform source; inject a seeded generator for deterministic
 * tests, Math.random in production. */
export function pickExploreTopics(
  stats: readonly TopicOpenDislikeStats[],
  count: number,
  random: () => number,
): string[] {
  const sampled = stats.map((topic) => ({
    topicLabel: topic.topicLabel,
    sample: sampleBeta(topic.opens + 1, topic.dislikes + 1, random),
  }));
  sampled.sort((a, b) => b.sample - a.sample);
  return sampled.slice(0, count).map((entry) => entry.topicLabel);
}
