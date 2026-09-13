/**
 * Purpose: one labelled sentence under an answer — the mark, the sentence it belongs to, and
 * the source sentence itself where there is one.
 *
 * The source text is printed here rather than linked. The measured reason: readers do not
 * open citations (under 10% of cited answers ever get one opened), and the three design
 * properties that do work are pre-click identifiability, sentence-level claim-to-source
 * mapping, and in-situ preview — all three of which are satisfied by putting the sentence on
 * the page. The colour carries the label because colour beat abstraction/transparency on
 * comprehension, discrimination and transfer in a learning task; nothing here is faded out.
 * Main exports: GroundingSentenceLine.
 */
import type { GroundedSentence } from "@breadcrumb/feature-factcheck";
import { useTranslation } from "react-i18next";

const MARK_CLASS: Record<GroundedSentence["label"], string> = {
  grounded: "border-emerald-400",
  conflicting: "border-amber-400",
  own: "border-stone-300",
};

interface GroundingSentenceLineProps {
  sentence: GroundedSentence;
}

export function GroundingSentenceLine({ sentence }: GroundingSentenceLineProps) {
  const { t } = useTranslation("chat");
  return (
    <li className={`border-s-2 ps-2 ${MARK_CLASS[sentence.label]}`}>
      <p className="text-xs text-stone-700">{sentence.text}</p>
      {sentence.quote !== null && (
        <p className="mt-0.5 text-xs text-stone-500">
          <span className="text-stone-400">
            [{sentence.quote.passageIndex}] {sentence.quote.source} ·{" "}
          </span>
          {sentence.quote.text}
        </p>
      )}
      {sentence.rival !== null && (
        <p className="mt-0.5 text-xs text-stone-500">
          <span className="text-stone-400">
            {t("grounding.alsoSays")} [{sentence.rival.passageIndex}] {sentence.rival.source} ·{" "}
          </span>
          {sentence.rival.text}
        </p>
      )}
    </li>
  );
}
