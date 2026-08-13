/**
 * Purpose: the 🪞 feedback lab's "已长期掌握" section — settled concepts and words as flat
 * pill lists; long lists collapse behind a native disclosure (spec 035 #7).
 * Main exports: FeedbackSettledSection.
 */
import { FEEDBACK_COPY } from "@breadcrumb/plugin-feedback";
import { useFeedbackStore } from "../stores/feedbackStore";

const VISIBLE_LIMIT = 20;

function PillGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  const visible = items.slice(0, VISIBLE_LIMIT);
  const rest = items.slice(VISIBLE_LIMIT);
  return (
    <div>
      <p className="mb-1 text-stone-500">{label}</p>
      <div className="flex flex-wrap gap-1">
        {visible.map((item) => (
          <span
            key={`${label}-${item}`}
            className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600"
          >
            {item}
          </span>
        ))}
      </div>
      {rest.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-stone-400">
            {FEEDBACK_COPY.settledShowMore}
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {rest.map((item) => (
              <span
                key={`${label}-${item}`}
                className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600"
              >
                {item}
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export function FeedbackSettledSection() {
  const settled = useFeedbackStore((state) => state.settled);
  const isEmpty = settled.nodes.length === 0 && settled.words.length === 0;

  // Archive-drawer form (Leo 2026-08-13): a factual roster, not a headline — collapsed
  // by default at the bottom of the panel, same disclosure pattern as LabFailuresSection.
  return (
    <details className="rounded border border-stone-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 font-semibold text-stone-600">
        {FEEDBACK_COPY.settledTitle}
      </summary>
      <div className="border-t border-stone-100 p-3 pt-2">
        <p className="text-stone-400">{FEEDBACK_COPY.settledHint}</p>
        {isEmpty ? (
          <p className="mt-2 text-stone-400">{FEEDBACK_COPY.settledEmpty}</p>
        ) : (
          <div className="mt-2 space-y-2">
            <PillGroup
              label={FEEDBACK_COPY.settledNodesLabel}
              items={settled.nodes.map((node) => node.title)}
            />
            <PillGroup
              label={FEEDBACK_COPY.settledWordsLabel}
              items={settled.words.map((word) => word.lemma)}
            />
          </div>
        )}
        <p className="mt-2 text-[10px] text-stone-400">{FEEDBACK_COPY.settledBasis}</p>
      </div>
    </details>
  );
}
