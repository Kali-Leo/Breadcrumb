/**
 * Purpose: renders a completed focus session's subway map as the plain record text that lands
 * in the host conversation on exit (spec 042 §5) — a preorder walk of every station, root
 * first, so branches and dashed question stops are both fully represented.
 * Main exports: buildFocusRecordText, FocusRecordNode.
 */

export interface FocusRecordNode {
  kind: "word" | "question";
  label: string;
  /** null = this node is the session's root station (spec 042 §1). */
  parentId: string | null;
  id: string;
}

/** Question stations are marked with a leading「？」so a flat arrow chain still shows which
 * stops were free-text prompts rather than picked words (spec 042 §5). */
function stationLabel(node: FocusRecordNode): string {
  return node.kind === "question" ? `？${node.label}` : node.label;
}

/** Groups nodes by parent id, preserving each group's existing order (repo rows already come
 * created_at, id ascending — the order a preorder walk should visit siblings in). */
function groupByParent(nodes: readonly FocusRecordNode[]): Map<string | null, FocusRecordNode[]> {
  const groups = new Map<string | null, FocusRecordNode[]>();
  for (const node of nodes) {
    const siblings = groups.get(node.parentId) ?? [];
    siblings.push(node);
    groups.set(node.parentId, siblings);
  }
  return groups;
}

/** Depth-first, root-first walk: a node's whole subtree is listed before its next sibling's,
 * so every branch stays fully present instead of collapsing to one path (spec 042 §4). */
function walkPreorder(
  childrenByParent: ReadonlyMap<string | null, FocusRecordNode[]>,
  parentId: string | null,
  out: string[],
): void {
  for (const node of childrenByParent.get(parentId) ?? []) {
    out.push(stationLabel(node));
    walkPreorder(childrenByParent, node.id, out);
  }
}

/** Plain record of one focus session (spec 042 §5): a header stating the root and station
 * count, followed by the full preorder station sequence. No evaluation, no praise. */
export function buildFocusRecordText(rootLabel: string, nodes: readonly FocusRecordNode[]): string {
  const childrenByParent = groupByParent(nodes);
  const walk: string[] = [];
  walkPreorder(childrenByParent, null, walk);

  const headerLine = `刚才就「${rootLabel}」做了一次专注探索（${nodes.length} 站）。`;
  const walkLine = `走过：${walk.join(" → ")}`;
  return `${headerLine}\n${walkLine}`;
}
