/**
 * Purpose: pure pixel-layout math for a focus session's subway map (spec 042 §4) — a vertical
 * tidy tree, mind-map style: every node's children are peers, laid out side by side on the
 * next row, with the parent centered above them (Leo: "a 下挂 (b,c)" — a single child falls
 * straight down, no fork). Classic post-order subtree-width tidy tree: a leaf claims one
 * column, a parent's column span is the sum of its children's, so sibling subtrees never
 * overlap. No rendering.
 * Main exports: layoutFocusMap, FocusMapNode, FocusMapStation, FocusMapLink, FocusMapLayout,
 * STATION_X, COLUMN_WIDTH, ROW_HEIGHT, TOP_MARGIN.
 */

export interface FocusMapNode {
  id: string;
  label: string;
  kind: "word" | "question";
  parentId: string | null;
}

export interface FocusMapStation {
  id: string;
  label: string;
  kind: "word" | "question";
  x: number;
  y: number;
  onCurrentPath: boolean;
  isCurrent: boolean;
}

/** One child's connector: a subway-style right-angle fork — down from the parent to
 * mid-height, across to the child's column, down into the child. points[0] is the parent end,
 * points[3] the child end; a single child's fork collapses to a straight vertical line because
 * both x's already match. */
export interface FocusMapLink {
  points: readonly { x: number; y: number }[];
  dashed: boolean;
}

export interface FocusMapLayout {
  stations: FocusMapStation[];
  links: FocusMapLink[];
  width: number;
  height: number;
}

export const STATION_X = 24;
export const COLUMN_WIDTH = 96;
export const ROW_HEIGHT = 34;
export const TOP_MARGIN = 20;
const BOTTOM_MARGIN = 20;
/** Room to the right of a station's dot for its truncated label (11px, up to 12 chars). */
const LABEL_ALLOWANCE = 120;

function groupByParent(nodes: readonly FocusMapNode[]): Map<string | null, FocusMapNode[]> {
  const groups = new Map<string | null, FocusMapNode[]>();
  for (const node of nodes) {
    const siblings = groups.get(node.parentId) ?? [];
    siblings.push(node);
    groups.set(node.parentId, siblings);
  }
  return groups;
}

/** Ids from the root down to (and including) currentId, or an empty set when currentId isn't
 * reachable (e.g. the map is still empty). */
function ancestorPath(
  nodes: readonly FocusMapNode[],
  currentId: string | null,
): ReadonlySet<string> {
  if (currentId === null) return new Set();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path = new Set<string>();
  let cursor: string | null = currentId;
  while (cursor !== null) {
    path.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return path;
}

/** The midpoint elbow between a parent and one child (spec 042 §4's "U 形" fork). */
function buildLink(
  from: { x: number; y: number },
  to: { x: number; y: number },
  dashed: boolean,
): FocusMapLink {
  const midY = (from.y + to.y) / 2;
  return {
    points: [
      { x: from.x, y: from.y },
      { x: from.x, y: midY },
      { x: to.x, y: midY },
      { x: to.x, y: to.y },
    ],
    dashed,
  };
}

/** Lays out one focus session's whole map (spec 042 §4): every station and connector always
 * present (nothing collapses or hides). Same-parent stations are peers — they lay out side by
 * side on the next row; the parent centers over its children's x-span (one child means the
 * center equals that child's own x, so it falls straight down). */
export function layoutFocusMap(
  nodes: readonly FocusMapNode[],
  currentId: string | null,
): FocusMapLayout {
  const childrenByParent = groupByParent(nodes);
  const onPath = ancestorPath(nodes, currentId);
  const positions = new Map<string, { x: number; y: number }>();
  const stations: FocusMapStation[] = [];
  let nextLeafColumn = 0;

  // Post-order (tidy tree): a leaf claims the next free column; an internal node centers over
  // the x-span its children just claimed. Every subtree owns a private, contiguous block of
  // columns, so sibling subtrees can never overlap.
  function place(node: FocusMapNode, depth: number): number {
    const children = childrenByParent.get(node.id) ?? [];
    const y = TOP_MARGIN + depth * ROW_HEIGHT;
    let x: number;
    if (children.length === 0) {
      x = STATION_X + nextLeafColumn * COLUMN_WIDTH;
      nextLeafColumn += 1;
    } else {
      const childXs = children.map((child) => place(child, depth + 1));
      x = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    }
    positions.set(node.id, { x, y });
    stations.push({
      id: node.id,
      label: node.label,
      kind: node.kind,
      x,
      y,
      onCurrentPath: onPath.has(node.id),
      isCurrent: node.id === currentId,
    });
    return x;
  }
  for (const root of childrenByParent.get(null) ?? []) place(root, 0);

  // One link per non-root node, in input order — every position is already known.
  const links: FocusMapLink[] = [];
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const from = positions.get(node.parentId);
    const to = positions.get(node.id);
    if (from === undefined || to === undefined) continue;
    links.push(buildLink(from, to, node.kind === "question"));
  }

  const maxX = Math.max(STATION_X, ...stations.map((station) => station.x));
  const maxY = Math.max(TOP_MARGIN, ...stations.map((station) => station.y));

  return {
    stations,
    links,
    width: maxX + LABEL_ALLOWANCE,
    height: maxY + BOTTOM_MARGIN,
  };
}
