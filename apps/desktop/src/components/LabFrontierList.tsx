/**
 * Purpose: lab-panel frontier list — recommendation candidates with their score and a
 * structured, suggest-only explanation ("因为你已掌握 X、Y"). Copy carries no pressure
 * language (product principle 1): this is what you could learn next, never what you're
 * behind on. Also surfaces a "通往你感兴趣的「X」" reason for candidates whose interest was
 * inherited via one-hop propagation, and a subtle "依据尚少" tag when the underlying
 * interest evidence is still thin (spec 014).
 * Main exports: LabFrontierList.
 */
import { usePlannerStore } from "../stores/plannerStore";

/** Below this, aggregateInterest's shrinkage evidenceWeight counts as "still thin" — a node
 * with only a signal or two of support, not yet corroborated. */
const THIN_EVIDENCE_THRESHOLD = 1;

export function LabFrontierList() {
  const candidates = usePlannerStore((state) => state.frontierCandidates);

  return (
    <section>
      <h3 className="mb-1 font-semibold text-stone-600">你现在可以学</h3>
      {candidates.length === 0 ? (
        <p className="text-stone-400">暂时没有新的推荐——继续学，边界会自然往外扩。</p>
      ) : (
        <ul className="space-y-1">
          {candidates.map((candidate) => (
            <li key={candidate.nodeId} className="rounded border border-stone-200 px-2 py-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 font-medium">
                  {candidate.label}
                  {candidate.reason.wasLitBefore && (
                    <span className="rounded bg-stone-100 px-1 text-stone-500 text-xs">
                      重逢 · 以前学过，最近有点生疏
                    </span>
                  )}
                  {candidate.evidenceWeight !== undefined &&
                    candidate.evidenceWeight < THIN_EVIDENCE_THRESHOLD && (
                      <span className="rounded bg-stone-100 px-1 text-stone-400 text-xs">
                        依据尚少
                      </span>
                    )}
                </span>
                <span className="text-stone-400">点亮分 {candidate.score.toFixed(2)}</span>
              </div>
              {candidate.reason.litPrerequisiteLabels.length > 0 && (
                <p className="text-stone-400">
                  因为你已掌握 {candidate.reason.litPrerequisiteLabels.join("、")}
                </p>
              )}
              {candidate.reason.litHelpsSources.length > 0 && (
                <p className="text-stone-400">
                  {candidate.reason.litHelpsSources
                    .map((source) => `${source.label}(${source.weight.toFixed(1)})`)
                    .join("、")}{" "}
                  对理解它有帮助
                </p>
              )}
              {candidate.reason.gatewayTo && (
                <p className="text-stone-400">
                  通往你感兴趣的「{candidate.reason.gatewayTo.label}」
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
