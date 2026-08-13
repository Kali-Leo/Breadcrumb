/**
 * Purpose: the 🪞 feedback lab's "证据可检视" section — pick a met concept and see the raw
 * evidence behind its mastery judgment: retention, encounters and claims (spec 035 #8, the
 * open-learner-model landing point for vision/09 §5).
 * Main exports: FeedbackEvidenceSection.
 */
import { evidenceClaimLabel, FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useMemo, useState } from "react";
import { useFeedbackStore } from "../stores/feedbackStore";

/** Local calendar date only ("时间显示到日") — matches activity.ts's day-cutting intent. */
function localDate(iso: string): string {
  return iso.slice(0, 10);
}

const MAX_PICKER_RESULTS = 8;

export function FeedbackEvidenceSection() {
  const candidates = useFeedbackStore((state) => state.evidenceCandidates);
  const selectedNodeId = useFeedbackStore((state) => state.selectedEvidenceNodeId);
  const evidence = useFeedbackStore((state) => state.evidence);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim();
    const matches =
      trimmed.length === 0 ? candidates : candidates.filter((c) => c.title.includes(trimmed));
    return matches.slice(0, MAX_PICKER_RESULTS);
  }, [candidates, query]);

  const selectedTitle = candidates.find((c) => c.nodeId === selectedNodeId)?.title ?? "";

  // Archive-drawer form (Leo 2026-08-13): inspection tooling, not daily reading —
  // collapsed by default at the bottom of the panel, same pattern as LabFailuresSection.
  return (
    <details className="rounded border border-stone-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 font-semibold text-stone-600">
        {FEEDBACK_COPY.evidenceTitle}
      </summary>
      <div className="border-t border-stone-100 p-3 pt-2">
        <p className="text-stone-400">{FEEDBACK_COPY.evidenceHint}</p>
        {candidates.length === 0 ? (
          <p className="mt-2 text-stone-400">{FEEDBACK_COPY.evidenceEmpty}</p>
        ) : (
          <div className="mt-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={FEEDBACK_COPY.evidencePickerPlaceholder}
              className="w-full rounded border border-stone-200 px-2 py-1 outline-none focus:border-amber-400"
            />
            <ul className="mt-1 flex flex-wrap gap-1">
              {filtered.map((candidate) => (
                <li key={candidate.nodeId}>
                  <button
                    type="button"
                    onClick={() => useFeedbackStore.getState().selectEvidenceNode(candidate.nodeId)}
                    className={`rounded-full px-2 py-0.5 transition-colors ${
                      candidate.nodeId === selectedNodeId
                        ? "bg-amber-100 text-amber-700"
                        : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                    }`}
                  >
                    {candidate.title}
                  </button>
                </li>
              ))}
            </ul>

            {evidence === null ? (
              <p className="mt-3 text-stone-400">{FEEDBACK_COPY.evidenceEmpty}</p>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="font-medium text-stone-700">{selectedTitle}</p>
                <p className="text-stone-600">
                  {FEEDBACK_COPY.evidenceRetentionLabel}:{" "}
                  {evidence.retention === null
                    ? FEEDBACK_COPY.evidenceRetentionUnknown
                    : `${Math.round(evidence.retention * 100)}%`}
                </p>
                <div>
                  <p className="text-stone-500">{FEEDBACK_COPY.evidenceEncountersLabel}</p>
                  <ul className="mt-1 space-y-0.5">
                    {evidence.encounters.map((encounter) => (
                      <li
                        key={`${encounter.occurredAtIso}-${encounter.conversationTitle}`}
                        className="text-stone-500"
                      >
                        <span className="text-stone-400">{localDate(encounter.occurredAtIso)}</span>{" "}
                        {encounter.conversationTitle}
                      </li>
                    ))}
                  </ul>
                </div>
                {evidence.claims.length > 0 && (
                  <div>
                    <p className="text-stone-500">{FEEDBACK_COPY.evidenceClaimsLabel}</p>
                    <ul className="mt-1 space-y-0.5">
                      {evidence.claims.map((claim) => (
                        <li
                          key={`${claim.occurredAtIso}-${claim.level}`}
                          className="text-stone-500"
                        >
                          <span className="text-stone-400">{localDate(claim.occurredAtIso)}</span>{" "}
                          {evidenceClaimLabel(claim.level)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <p className="mt-2 text-[10px] text-stone-400">{FEEDBACK_COPY.evidenceBasis}</p>
      </div>
    </details>
  );
}
