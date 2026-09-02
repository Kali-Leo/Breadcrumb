/**
 * Purpose: pure merge of diglot-weave and explore-door patches within one markdown text node
 * into ordered same-type runs plus the plain-text gaps between them (spec 039 §2.1) — a door
 * span overlapping a diglot span is dropped (weave has priority; conceptDoors.ts already
 * reserves diglot spans so this only fires as a render-time backstop).
 * Main exports: mergeTextRuns, TextRun.
 */
import type { ReplacementPatch } from "@breadcrumb/feature-diglot-weave";
import type { DoorCandidate } from "@breadcrumb/feature-explore";

export type TextRun =
  | { kind: "plain"; start: number; end: number }
  | { kind: "diglot"; start: number; end: number; patches: ReplacementPatch[] }
  | { kind: "door"; start: number; end: number; patches: DoorCandidate[] };

function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Splits [nodeStart, nodeEnd) into plain-text runs and same-type patch clusters, sorted by
 * position. Door patches overlapping any diglot patch are dropped before merging. */
export function mergeTextRuns(
  nodeStart: number,
  nodeEnd: number,
  diglotPatches: readonly ReplacementPatch[],
  doorPatches: readonly DoorCandidate[],
): TextRun[] {
  const clearDoors = doorPatches.filter(
    (door) => !diglotPatches.some((patch) => spansOverlap(patch, door)),
  );
  type Tagged =
    | { type: "diglot"; patch: ReplacementPatch }
    | { type: "door"; patch: DoorCandidate };
  const merged: Tagged[] = [
    ...diglotPatches.map((patch) => ({ type: "diglot" as const, patch })),
    ...clearDoors.map((patch) => ({ type: "door" as const, patch })),
  ].sort((a, b) => a.patch.start - b.patch.start);

  const runs: TextRun[] = [];
  let cursor = nodeStart;
  let index = 0;
  while (index < merged.length) {
    const item = merged[index];
    if (item === undefined) break;
    const type = item.type;
    const clusterStart = item.patch.start;
    const clusterPatches: (ReplacementPatch | DoorCandidate)[] = [];
    let clusterEnd = clusterStart;
    while (index < merged.length && merged[index]?.type === type) {
      const next = merged[index];
      if (next === undefined) break;
      clusterPatches.push(next.patch);
      clusterEnd = next.patch.end;
      index += 1;
    }
    if (clusterStart > cursor) runs.push({ kind: "plain", start: cursor, end: clusterStart });
    runs.push(
      type === "diglot"
        ? {
            kind: "diglot",
            start: clusterStart,
            end: clusterEnd,
            patches: clusterPatches as ReplacementPatch[],
          }
        : {
            kind: "door",
            start: clusterStart,
            end: clusterEnd,
            patches: clusterPatches as DoorCandidate[],
          },
    );
    cursor = clusterEnd;
  }
  if (cursor < nodeEnd) runs.push({ kind: "plain", start: cursor, end: nodeEnd });
  return runs;
}
