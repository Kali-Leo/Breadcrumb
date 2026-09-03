/**
 * Purpose: the comparison tree's pure layout math (spec 023, ADR-0016) — the d3-hierarchy
 * tidy layout over the currently expanded nodes (the layout IS the collapse mechanism), the
 * drawing constants every part of the view shares, and the two number-to-ink helpers.
 * No React, no rendering.
 * Main exports: CompareTreeLayout, CompareTreePoint, buildCompareTreeLayout, fillFor,
 * percentOf, NODE_WIDTH, NODE_HEIGHT, TOUCH_TARGET_HEIGHT, PADDING.
 */
import type { OverlapNode } from "@breadcrumb/feature-compare";
import { type HierarchyNode, hierarchy, tree } from "d3-hierarchy";

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 34;
/** A fingertip's target (Apple HIG 44pt / WCAG 2.5.5). The box is shorter than that, so on
 * a touch screen the node's hit area is padded out into the row gap instead. */
export const TOUCH_TARGET_HEIGHT = 44;
const LEVEL_GAP = 216;
const ROW_GAP = 44;
export const PADDING = 16;

export interface LayoutEntry {
  node: OverlapNode;
  hasHiddenChildren: boolean;
  children?: LayoutEntry[];
}

export type CompareTreePoint = HierarchyNode<LayoutEntry>;

export interface CompareTreeLayout {
  visible: CompareTreePoint[];
  minX: number;
  maxX: number;
  maxY: number;
}

/** White→amber-500 wash: 0% overlap is nearly paper, 100% is a confident amber. */
export function fillFor(ratio: number): string {
  return `rgba(245, 158, 11, ${0.06 + 0.5 * ratio})`;
}

/**
 * Overlap as a percentage, without the two lies rounding tells at the ends: a sliver of
 * overlap must not read as "0%", and one item short of everything must not read as "100%".
 */
export function percentOf(ratio: number): string {
  const percent = ratio * 100;
  if (ratio > 0 && percent < 1) return "<1%";
  if (ratio < 1 && percent > 99) return ">99%";
  return `${Math.round(percent)}%`;
}

export function buildCompareTreeLayout(
  root: OverlapNode,
  expandedKeys: ReadonlySet<string>,
): CompareTreeLayout {
  // Only expanded nodes contribute children — the layout IS the collapse mechanism.
  function toEntry(node: OverlapNode): LayoutEntry {
    const expanded = expandedKeys.has(node.key);
    return {
      node,
      hasHiddenChildren: !expanded && node.children.length > 0,
      children: expanded ? node.children.map(toEntry) : undefined,
    };
  }
  const rootEntry = hierarchy<LayoutEntry>(toEntry(root), (entry) => entry.children);
  tree<LayoutEntry>().nodeSize([ROW_GAP, LEVEL_GAP])(rootEntry);
  const visible = rootEntry.descendants();
  const minX = Math.min(...visible.map((point) => point.x ?? 0));
  const maxX = Math.max(...visible.map((point) => point.x ?? 0));
  const maxY = Math.max(...visible.map((point) => point.y ?? 0));
  return { visible, minX, maxX, maxY };
}
