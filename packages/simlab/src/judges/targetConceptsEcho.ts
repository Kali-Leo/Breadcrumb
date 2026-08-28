/**
 * Purpose: the fraction of a persona's targetConcepts that came back out of the pipeline as
 * labels the journey created or sighted.
 *
 * Named "echo", not "recall", since the 2026-08-28 design audit (simlab与测试策略 #3): input
 * echo, not extraction evidence. The same targetConcepts array is written into the student's
 * system prompt AND handed to pickDomainHint, which puts it in the opening line — so the
 * ground truth here is a copy of the input, and the double-ended substring match below makes
 * it looser still (a one-character label matches almost anything). Both live runs scored a
 * flat 1.0. It stays in metrics.json because a value that suddenly drops means the pipeline
 * stopped extracting the words that were literally said to it, which is worth seeing; it is
 * out of `sim summarize` because a number that cannot go down is not a finding. Making it
 * mean something would need personas that never name their target concepts, only act confused
 * about them, plus an explicit alias table instead of substring matching.
 * Main exports: computeTargetConceptsEcho.
 */
export function computeTargetConceptsEcho(
  targetConcepts: readonly string[],
  touchedLabels: readonly string[],
): number {
  if (targetConcepts.length === 0) return 1;
  const normalizedTouched = touchedLabels.map((label) => label.trim());
  const matchedCount = targetConcepts.filter((concept) => {
    const normalizedConcept = concept.trim();
    return normalizedTouched.some(
      (label) =>
        label === normalizedConcept ||
        label.includes(normalizedConcept) ||
        normalizedConcept.includes(label),
    );
  }).length;
  return matchedCount / targetConcepts.length;
}
