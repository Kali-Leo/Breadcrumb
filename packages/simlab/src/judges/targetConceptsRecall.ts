/**
 * Purpose: the "被看见" recall metric — fraction of a persona's targetConcepts that showed up
 * among the labels a journey actually created or sighted. Matching rule (spec 013 T4,
 * documented here since it's a judgment call): exact match after trim first; if that fails,
 * substring containment in either direction as a fallback, since the extraction LLM may use
 * a slightly different granularity (e.g. persona target "判别式" vs extracted "二次方程的判别式").
 * Main exports: computeTargetConceptsRecall.
 */
export function computeTargetConceptsRecall(
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
