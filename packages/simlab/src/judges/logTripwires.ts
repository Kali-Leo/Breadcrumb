/**
 * Purpose: mechanical tripwires (new-tripwire batch, first sim hunt) computed by scanning a
 * journey's own journey-<n>.jsonl records after the run — degenerate-turn count (an empty
 * turn ever reaching a pipeline would be a S1 regression), the student-turn/tutor-turn usage
 * contract (S2), and knowledge-tree extraction responses whose parentLabel is neither null
 * nor a real label (P7 regression, independently re-derived from the logged request text
 * rather than trusted from the response). Pure functions over already-parsed JSONL records —
 * no I/O, no DB — so they're unit-testable with injected bad records.
 * Main exports: countDegenerateTurns, countUsageContractViolations, countParentLabelViolations.
 */

export type JourneyLogRecord = Record<string, unknown>;

/** Number of "degenerate-turn" events in the log — every occurrence means an empty student
 * or tutor reply survived one retry and the conversation had to end early (S1). Should be
 * rare/zero in a healthy run; any nonzero count is worth a human look, not a hard failure. */
export function countDegenerateTurns(records: readonly JourneyLogRecord[]): number {
  return records.filter((record) => record.event === "degenerate-turn").length;
}

/** Every student-turn/tutor-turn event must carry a well-formed usage object (S2's contract).
 * Counts events where it's missing or malformed — a code regression would fire this on every
 * turn, not just occasionally, so even one violation across a whole run is suspicious. */
export function countUsageContractViolations(records: readonly JourneyLogRecord[]): number {
  return records.filter((record) => {
    if (record.event !== "student-turn" && record.event !== "tutor-turn") return false;
    const usage = record.usage;
    if (typeof usage !== "object" || usage === null) return true;
    const { inputTokens, outputTokens } = usage as Record<string, unknown>;
    return typeof inputTokens !== "number" || typeof outputTokens !== "number";
  }).length;
}

interface LoggedExtractedNode {
  label?: unknown;
  parentLabel?: unknown;
}

/** Reconstructs the existing-tree labels the model actually saw for this call, by parsing
 * the same "- label（...）" lines buildExtractionMessages rendered into the logged request's
 * user message (see plugin-knowledge-tree/src/extraction.ts). Independent of the response,
 * so this genuinely re-derives the check rather than trusting the model's own echo. */
function existingLabelsFromLoggedRequest(request: unknown): Set<string> {
  if (!Array.isArray(request)) return new Set();
  const userMessage = request.find(
    (message): message is { role: string; content: string } =>
      typeof message === "object" &&
      message !== null &&
      (message as { role?: unknown }).role === "user" &&
      typeof (message as { content?: unknown }).content === "string",
  );
  if (userMessage === undefined) return new Set();
  const treeSection = userMessage.content.split("\n\n本轮问答")[0] ?? "";
  const labels = new Set<string>();
  for (const match of treeSection.matchAll(/^- (.+?)（/gm)) {
    const label = match[1];
    if (label !== undefined) labels.add(label);
  }
  return labels;
}

/** Counts extraction responses (across every knowledge-tree pipeline-stage record) whose
 * parentLabel is neither null nor an existing/batch-internal label — the exact condition
 * attach.ts's `?? null` fallback silently absorbs (P7). Mirrors planNodeChanges' own
 * label-resolution order: a node's own label becomes available to LATER batch entries only
 * after it's processed, and re-sighted nodes (label already known) never even consult
 * parentLabel, matching attach.ts's `continue` on a matched label. */
export function countParentLabelViolations(records: readonly JourneyLogRecord[]): number {
  let violations = 0;
  for (const record of records) {
    if (record.event !== "pipeline-stage" || record.purpose !== "knowledge-tree") continue;
    const response = record.response as { nodes?: unknown } | undefined;
    if (response === undefined || !Array.isArray(response.nodes)) continue;

    const knownLabels = existingLabelsFromLoggedRequest(record.request);
    for (const rawNode of response.nodes as LoggedExtractedNode[]) {
      const label = typeof rawNode.label === "string" ? rawNode.label : undefined;
      const parentLabel = typeof rawNode.parentLabel === "string" ? rawNode.parentLabel : null;
      if (label === undefined) continue;
      if (knownLabels.has(label)) continue; // re-sighting: parentLabel is never consulted
      if (parentLabel !== null && !knownLabels.has(parentLabel)) violations += 1;
      knownLabels.add(label); // available to later entries in the same batch
    }
  }
  return violations;
}
