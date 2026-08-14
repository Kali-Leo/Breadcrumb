/**
 * Purpose: zero-LLM door candidate selection (spec 039 §2.1) — picks which node labels
 * sighted in an assistant message become clickable "doors", capped by density and mastery.
 * Main exports: pickDoors, DoorCandidate, DoorPickInput, DOOR_LIT_THRESHOLD, MAX_DOORS_PER_MESSAGE.
 */

export interface DoorCandidate {
  start: number;
  end: number;
  original: string;
  nodeId: string;
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
 * Priority for the density cut is curiosity desc, then retention asc (hungriest first);
 * candidates are then greedily placed in priority order, skipping anything that would
 * overlap an already-placed span (reserved or previously picked). */
export function pickDoors(input: DoorPickInput): DoorCandidate[] {
  const reserved = input.reservedSpans ?? [];

  const matched: DoorCandidate[] = [];
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

  const placed: DoorCandidate[] = [];
  const occupied: { start: number; end: number }[] = [...reserved];
  for (const candidate of prioritized) {
    if (placed.length >= MAX_DOORS_PER_MESSAGE) break;
    if (occupied.some((span) => spansOverlap(span, candidate))) continue;
    placed.push(candidate);
    occupied.push(candidate);
  }

  return placed.sort((a, b) => a.start - b.start);
}
