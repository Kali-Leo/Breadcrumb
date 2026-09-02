/**
 * Purpose: renders explore-door spans inside an assistant message (spec 039 §2.1, spec 042
 * §5) — click-only, no popover: an ordinary reply's door click opens a focus session directly
 * (no guess, no card); the focus overlay's own doors reuse the same click-to-select rendering.
 * Main exports: FocusDoorText, splitDoorSegments, DoorSegment.
 */
import type { DoorCandidate } from "@breadcrumb/feature-explore";

export type DoorSegment = { kind: "text"; text: string } | { kind: "door"; patch: DoorCandidate };

/** Splits `slice` into plain-text runs and door spans (local offsets). pickDoors already
 * guarantees non-overlapping, original-matching spans; any mismatch degrades that one span
 * back to plain text instead of rendering a wrong button. */
export function splitDoorSegments(slice: string, patches: readonly DoorCandidate[]): DoorSegment[] {
  const segments: DoorSegment[] = [];
  let cursor = 0;
  for (const patch of patches) {
    if (patch.start < cursor || patch.end > slice.length) continue;
    if (slice.slice(patch.start, patch.end) !== patch.original) continue;
    if (patch.start > cursor)
      segments.push({ kind: "text", text: slice.slice(cursor, patch.start) });
    segments.push({ kind: "door", patch });
    cursor = patch.end;
  }
  if (cursor < slice.length) segments.push({ kind: "text", text: slice.slice(cursor) });
  return segments;
}

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
  /** nodeId is the door's matching knowledge node, or null for a term-marked word with no
   * known node (spec 043 §6). Ordinary replies use a non-null id to mark the node "opened"
   * (spec 039 §2.1's alreadyOpenedNodeIds); the focus overlay's own doors ignore it either way. */
  onSelect: (word: string, nodeId: string | null) => void;
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
            onClick={() => onSelect(segment.patch.original, segment.patch.nodeId)}
            className="cursor-pointer rounded px-0.5 text-stone-700 underline decoration-stone-300 decoration-dotted underline-offset-2 hover:decoration-stone-500"
          >
            {segment.patch.original}
          </button>
        ),
      )}
    </span>
  );
}
