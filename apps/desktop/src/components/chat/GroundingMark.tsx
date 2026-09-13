/**
 * Purpose: the mark itself — one small coloured dot at the end of a sentence, and the source
 * sentence it opens.
 *
 * A dot rather than a second copy of the answer. The evidence behind per-claim marking is
 * about *sentence-level claim-to-source mapping with the source previewable in place*; it is
 * not about restating the reply underneath itself, which is what a list of every sentence
 * amounts to and which pushes the source further from the claim rather than closer. Colour
 * carries the tier because colour beat abstraction and transparency on comprehension,
 * discrimination and transfer in a learning task — nothing here is faded or italicised.
 *
 * Closed, the dot costs one character of line width. Open, the source sentence sits directly
 * under the claim, which is the in-situ preview the eye-tracking work found people actually
 * read. `title` carries the same text for a hover, so the quickest possible look needs no
 * click at all.
 * Main exports: GroundingMark.
 */
import type { GroundedSentence } from "@breadcrumb/feature-factcheck";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const DOT_CLASS: Record<GroundedSentence["label"], string> = {
  grounded: "bg-emerald-400",
  conflicting: "bg-amber-400",
  own: "bg-stone-300",
};

interface GroundingMarkProps {
  sentence: GroundedSentence;
}

export function GroundingMark({ sentence }: GroundingMarkProps) {
  const { t } = useTranslation("chat");
  const [open, setOpen] = useState(false);
  const quote = sentence.quote;
  const label = t(`grounding.mark.${sentence.label}` as never);
  const hover =
    quote === null ? label : `${label} — [${quote.passageIndex}] ${quote.source} · ${quote.text}`;

  return (
    <>
      <button
        type="button"
        data-grounding-mark={sentence.label}
        aria-label={hover}
        title={hover}
        aria-expanded={quote === null ? undefined : open}
        onClick={() => setOpen(!open)}
        className={`mx-0.5 inline-block size-1.5 shrink-0 rounded-full align-middle ${DOT_CLASS[sentence.label]}`}
      />
      {open && (
        <span className="my-0.5 block border-stone-200 border-s-2 ps-2 text-xs text-stone-500">
          {quote === null ? (
            label
          ) : (
            <>
              <span className="text-stone-400">
                [{quote.passageIndex}] {quote.source} ·{" "}
              </span>
              {quote.text}
            </>
          )}
        </span>
      )}
    </>
  );
}
