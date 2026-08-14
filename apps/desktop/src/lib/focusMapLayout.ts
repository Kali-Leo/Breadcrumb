/**
 * Purpose: pure pixel-layout math for a focus session's subway map (spec 042 §4) — one row per
 * node in preorder, one column per line: a node's first word child stays on the parent's
 * column (straight vertical), every other child (any question child, or any word child past
 * the first) forks a brand-new column with a diagonal connector, dashed only for question
 * children. No rendering.
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

export interface FocusMapLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dashed: boolean;
}

export interface FocusMapLayout {
  stations: FocusMapStation[];
  links: FocusMapLink[];
  width: number;
  height: number;
}

export const STATION_X = 24;
export const COLUMN_WIDTH = 84;
export const ROW_HEIGHT = 34;
export const TOP_MARGIN = 20;
const BOTTOM_MARGIN = 20;
/** Room to the right of a station's dot for its truncated label (11px, up to 8 chars). */
const LABEL_ALLOWANCE = 80;

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

/** Lays out one focus session's whole map (spec 042 §4): every station and connector always
 * present (nothing collapses or hides), positioned by a preorder walk that hands each line its
 * own column. */
export function layoutFocusMap(
  nodes: readonly FocusMapNode[],
  currentId: string | null,
): FocusMapLayout {
  const childrenByParent = groupByParent(nodes);
  const onPath = ancestorPath(nodes, currentId);
  const positions = new Map<string, { x: number; y: number }>();
  const stations: FocusMapStation[] = [];

  let nextRow = 0;
  let nextColumn = 1; // column 0 belongs to the root's own line

  // Pass 1 (preorder): assign every station's row/column and build the station list.
  function visit(node: FocusMapNode, column: number): void {
    const x = STATION_X + column * COLUMN_WIDTH;
    const y = TOP_MARGIN + nextRow * ROW_HEIGHT;
    nextRow += 1;
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

    (childrenByParent.get(node.id) ?? []).forEach((child, index) => {
      const inherits = index === 0 && child.kind === "word";
      visit(child, inherits ? column : nextColumn++);
    });
  }
  for (const root of childrenByParent.get(null) ?? []) {
    visit(root, 0);
  }

  // Pass 2: one link per non-root node, in input order — every position is already known.
  const links: FocusMapLink[] = [];
  for (const node of nodes) {
    if (node.parentId === null) continue;
    const from = positions.get(node.parentId);
    const to = positions.get(node.id);
    if (from === undefined || to === undefined) continue;
    links.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, dashed: node.kind === "question" });
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
