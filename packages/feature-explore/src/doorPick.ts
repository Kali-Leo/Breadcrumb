/**
 * Purpose: zero-LLM door candidate selection (spec 039 §2.1) — picks which node labels
 * sighted in an assistant message become clickable "doors", capped by density and mastery.
 * Also the shared door-patch shape termAnnotator's locateTermPatches produces (spec 043 §6):
 * nodeId is null there until a caller enriches it against a known label.
 * Main exports: pickDoors, DoorCandidate, DoorPickInput, DOOR_LIT_THRESHOLD, MAX_DOORS_PER_MESSAGE.
 */

export interface DoorCandidate {
  start: number;
  end: number;
  original: string;
  /** null = no known knowledge-tree node matches this door's word (spec 043 §6: an LLM
   * term-marking pick may be a brand-new term with no node at all). Clicking it still opens a
   * focus session — it just has nothing to mark "opened" or grade a guess against. */
  nodeId: string | null;
}

export interface DoorPickInput {
  messageText: string;
  /** Nodes sighted in this message (extraction already attributes them). */
  messageNodes: readonly { nodeId: string; label: string }[];
  masteryByNode: ReadonlyMap<string, number>;
  curiosityByNode: ReadonlyMap<string, number>;
  retentionByNode: ReadonlyMap<string, number>;
  /** Node ids already opened as doors earlier in this conversation. */
  alreadyOpenedNodeIds: ReadonlySet<string>;
  /** Spans already claimed by other display patches (e.g. diglot weave) — doors must not overlap. */
  reservedSpans?: readonly { start: number; end: number }[];
}

/** Lit nodes (well-mastered) never get doors — the door is for what is still worth opening. */
export const DOOR_LIT_THRESHOLD = 0.85;
/** Density cap: never more than three doors per message. */
export const MAX_DOORS_PER_MESSAGE = 3;
/** How many of those doors are awarded on curiosity rank alone. The remaining one is the
 * exploration slot (2026-08-28 audit): filled from the candidates curiosity did NOT pick, so
 * a learner isn't offered the same narrow neighborhood forever and the system gets to see a
 * reaction to something it did not already believe was interesting. Deterministic — lowest
 * retention among the leftovers (hungriest for review), no randomness, no bandit. */
export const CURIOSITY_RANKED_DOORS = MAX_DOORS_PER_MESSAGE - 1;

/** Labels shorter than this are too ambiguous to safely mark (e.g. single CJK characters
 * or single Latin letters collide constantly with ordinary prose). */
const MIN_LABEL_LENGTH = 2;

function spansOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Canonical labels rarely appear verbatim in prose («闭包与作用域链» vs the text's «闭包»),
 * so a label also matches through its significant parts, split on common CJK connectives.
 * The full label is tried first; parts follow in reading order. */
const LABEL_CONNECTIVE_SPLITTER = /[与和的、之/（）()\s]+/;

function matchKeysFor(label: string): string[] {
  const parts = label
    .split(LABEL_CONNECTIVE_SPLITTER)
    .filter((part) => part.length >= MIN_LABEL_LENGTH);
  return [label, ...parts];
}

/** Finds the first case-insensitive occurrence of the label (or one of its significant
 * parts) in `text`, returning the original (case-preserving) slice, or null. */
function findFirstMatch(
  text: string,
  label: string,
): { start: number; end: number; original: string } | null {
  const haystack = text.toLowerCase();
  for (const key of matchKeysFor(label)) {
    const index = haystack.indexOf(key.toLowerCase());
    if (index === -1) continue;
    return {
      start: index,
      end: index + key.length,
      original: text.slice(index, index + key.length),
    };
  }
  return null;
}

/** Selects up to MAX_DOORS_PER_MESSAGE door candidates from a message's sighted nodes.
 * The first CURIOSITY_RANKED_DOORS go to curiosity desc, then retention asc (hungriest
 * first), greedily placed and skipping anything that would overlap an already-placed span
 * (reserved or previously picked). The last door is the exploration slot: the lowest-retention
 * candidate curiosity did not already pick. */
/** pickDoors only ever matches against `input.messageNodes`, whose nodeId is a plain string —
 * narrower than DoorCandidate's public (nullable) nodeId, which exists for termAnnotator's
 * node-less term doors instead. */
type MatchedCandidate = Omit<DoorCandidate, "nodeId"> & { nodeId: string };

export function pickDoors(input: DoorPickInput): DoorCandidate[] {
  const reserved = input.reservedSpans ?? [];

  const matched: MatchedCandidate[] = [];
  for (const node of input.messageNodes) {
    if (node.label.length < MIN_LABEL_LENGTH) continue;
    if ((input.masteryByNode.get(node.nodeId) ?? 0) >= DOOR_LIT_THRESHOLD) continue;
    if (input.alreadyOpenedNodeIds.has(node.nodeId)) continue;
    const match = findFirstMatch(input.messageText, node.label);
    if (match === null) continue;
    matched.push({ ...match, nodeId: node.nodeId });
  }

  const prioritized = [...matched].sort((a, b) => {
    const curiosityA = input.curiosityByNode.get(a.nodeId) ?? 0;
    const curiosityB = input.curiosityByNode.get(b.nodeId) ?? 0;
    if (curiosityA !== curiosityB) return curiosityB - curiosityA;
    const retentionA = input.retentionByNode.get(a.nodeId) ?? 0;
    const retentionB = input.retentionByNode.get(b.nodeId) ?? 0;
    return retentionA - retentionB;
  });

  const placed: MatchedCandidate[] = [];
  const occupied: { start: number; end: number }[] = [...reserved];
  const fits = (candidate: MatchedCandidate) =>
    !occupied.some((span) => spansOverlap(span, candidate));
  const place = (candidate: MatchedCandidate) => {
    placed.push(candidate);
    occupied.push(candidate);
  };

  for (const candidate of prioritized) {
    if (placed.length >= CURIOSITY_RANKED_DOORS) break;
    if (!fits(candidate)) continue;
    place(candidate);
  }

  // The exploration slot: whatever curiosity ranking left over, lowest retention first.
  // Ties keep curiosity order, so the pick is a pure function of the input either way.
  const leftover = prioritized.filter(
    (candidate) => !placed.includes(candidate) && fits(candidate),
  );
  const explorer = leftover.reduce<MatchedCandidate | null>(
    (best, candidate) =>
      best === null ||
      (input.retentionByNode.get(candidate.nodeId) ?? 0) <
        (input.retentionByNode.get(best.nodeId) ?? 0)
        ? candidate
        : best,
    null,
  );
  if (explorer !== null && placed.length < MAX_DOORS_PER_MESSAGE) place(explorer);

  return placed.sort((a, b) => a.start - b.start);
}
