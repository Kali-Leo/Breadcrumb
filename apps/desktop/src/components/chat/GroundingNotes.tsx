/**
 * Purpose: the one thing that cannot be said with a dot — a disagreement between sources.
 *
 * Everything else is marked in place, on the sentence itself (GroundingMark). This panel used
 * to list every sentence with its label, which put the whole answer on screen a second time:
 * the same words twice, the source further from the claim than before, and a wall in the shape
 * of a disclaimer. The research behind per-claim marking asks for sentence-level mapping with
 * the source previewable in place; restating the reply is not that.
 *
 * A conflict stays here because it genuinely does not fit in place: two sources saying
 * different things needs both readings side by side, and it is the one finding worth reading
 * before anything else — which is why it is outside any fold. No disclaimer, no "已核查",
 * no confidence number.
 * Main exports: GroundingNotes.
 */
import { useTranslation } from "react-i18next";
import { useGroundingStore } from "../../stores/groundingStore";
import { GroundingSentenceLine } from "./GroundingSentenceLine";

interface GroundingNotesProps {
  messageId: string;
}

export function GroundingNotes({ messageId }: GroundingNotesProps) {
  const { t } = useTranslation("chat");
  const annotation = useGroundingStore((state) => state.annotationByMessage.get(messageId));
  const conflicts = (annotation?.sentences ?? []).filter(
    (sentence) => sentence.label === "conflicting",
  );
  if (conflicts.length === 0) return null;

  return (
    <div className="max-w-[76%] space-y-1 rounded-xl border border-amber-200 bg-amber-50/80 p-3 ps-1">
      <p className="text-amber-800 text-xs">{t("grounding.conflictHeading")}</p>
      <ul className="space-y-1.5">
        {conflicts.map((sentence) => (
          <GroundingSentenceLine key={sentence.order} sentence={sentence} />
        ))}
      </ul>
    </div>
  );
}
