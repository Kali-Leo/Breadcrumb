/**
 * Purpose: renders focus-overlay door spans (spec 042 §3) — a click-only twin of
 * ConceptDoorText: no popover, no hover delay, no gate decision here (focusStore.selectWord
 * runs the gate); clicking a marked word just calls onSelect.
 * Main exports: FocusDoorText.
 */
import type { DoorCandidate } from "@breadcrumb/plugin-explore";
import { splitDoorSegments } from "./ConceptDoorText";

export function FocusDoorText({
  content,
  patches,
  rangeStart,
  rangeEnd,
  onSelect,
}: {
  content: string;
  patches: DoorCandidate[];
  rangeStart?: number;
  rangeEnd?: number;
  onSelect: (word: string) => void;
}) {
  const base = rangeStart ?? 0;
  const slice = rangeEnd === undefined ? content.slice(base) : content.slice(base, rangeEnd);
  const localPatches = patches.map((patch) => ({
    ...patch,
    start: patch.start - base,
    end: patch.end - base,
  }));
  const segments = splitDoorSegments(slice, localPatches);

  return (
    <span>
      {segments.map((segment) =>
        segment.kind === "text" ? (
          <span key={`t${segment.text.slice(0, 8)}${segment.text.length}`}>{segment.text}</span>
        ) : (
          <button
            key={`w${segment.patch.start}`}
            type="button"
            onClick={() => onSelect(segment.patch.original)}
            className="cursor-pointer rounded px-0.5 text-stone-700 underline decoration-stone-300 decoration-dotted underline-offset-2 hover:decoration-stone-500"
          >
            {segment.patch.original}
          </button>
        ),
      )}
    </span>
  );
}
