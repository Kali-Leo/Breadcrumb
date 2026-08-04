/**
 * Purpose: pure visual-style decisions for the goal overlay's two-layer look (spec 017 #2,
 * ADR-0013) — which colors/alpha/width a node or edge paints in, given its state. Deliberately
 * has no canvas calls so it's unit-testable without a CanvasRenderingContext2D; overlayPainters.ts
 * consumes it to actually draw.
 * Main exports: resolveNodeVisual, resolveEdgeVisual, NodeVisual, EdgeVisual.
 */
import { overlayNodeRadius } from "./overlayLayout";
import type { OverlayEdge, OverlayNodeState } from "./overlayModel";

/** The subset of an overlay node resolveNodeVisual actually needs — kept structural (not
 * imported from overlayLayout) so this module doesn't depend on the full layout node shape. */
interface OverlayLayoutNodeLike {
  label: string;
  state: OverlayNodeState;
}

const GHOST_FILL = "rgba(245, 245, 244, 0.35)"; // stone-100 @ low alpha
const GHOST_STROKE = "#d6d3d1"; // stone-300
const GHOST_LABEL = "#a8a29e"; // stone-400
const GHOST_DASH: readonly [number, number] = [3, 3];

const OWNED_FILL = "#fcd34d"; // amber-300
const OWNED_STROKE = "#d97706"; // amber-600
const OWNED_GLOW = "rgba(217, 119, 6, 0.55)";
const OWNED_LABEL = "#44403c"; // stone-700
const DIM_ALPHA = 0.55;

const REQUIRES_GHOST_COLOR = "rgba(168, 162, 158, 0.35)"; // stone-400 @ low alpha
const REQUIRES_SOLID_COLOR = "#f59e0b"; // amber-500
const HELPS_COLOR_RGB = "253, 230, 138"; // amber-200
const HELPS_GHOST_ALPHA = 0.3;
const HELPS_SOLID_ALPHA = 0.9;

export interface GhostNodeStyle {
  radius: number;
  fillStyle: string;
  strokeStyle: string;
  lineDash: readonly [number, number];
  labelColor: string;
}

export interface OwnedNodeStyle {
  radius: number;
  fillStyle: string;
  strokeStyle: string;
  /** globalAlpha for the owned layer — 1 when lit, faded when dim (partial ownership). */
  alpha: number;
  glowColor: string;
  labelColor: string;
}

export interface NodeVisual {
  ghost: GhostNodeStyle;
  /** null for 'target' nodes — ghost-only, nothing owned to overlay yet. */
  owned: OwnedNodeStyle | null;
}

/** Which layers a node paints and in what colors, from its label (radius) and state. */
export function resolveNodeVisual(node: OverlayLayoutNodeLike): NodeVisual {
  const radius = overlayNodeRadius(node.label);
  const ghost: GhostNodeStyle = {
    radius,
    fillStyle: GHOST_FILL,
    strokeStyle: GHOST_STROKE,
    lineDash: GHOST_DASH,
    labelColor: GHOST_LABEL,
  };
  if (node.state === "target") return { ghost, owned: null };
  return {
    ghost,
    owned: {
      radius,
      fillStyle: OWNED_FILL,
      strokeStyle: OWNED_STROKE,
      alpha: node.state === "lit" ? 1 : DIM_ALPHA,
      glowColor: OWNED_GLOW,
      labelColor: OWNED_LABEL,
    },
  };
}

export interface EdgeVisual {
  color: string;
  width: number;
  arrow: boolean;
}

/** requires edges are ghosted stone unless both endpoints are owned (lit/dim), in which case
 * solid amber with an arrowhead; helps edges keep amber-200 throughout and only change alpha,
 * with width proportional to weight either way. */
export function resolveEdgeVisual(
  edge: OverlayEdge,
  sourceState: OverlayNodeState,
  targetState: OverlayNodeState,
): EdgeVisual {
  const bothOwned = sourceState !== "target" && targetState !== "target";
  if (edge.type === "requires") {
    return {
      color: bothOwned ? REQUIRES_SOLID_COLOR : REQUIRES_GHOST_COLOR,
      width: bothOwned ? 2 : 1.25,
      arrow: true,
    };
  }
  const alpha = bothOwned ? HELPS_SOLID_ALPHA : HELPS_GHOST_ALPHA;
  return {
    color: `rgba(${HELPS_COLOR_RGB}, ${alpha})`,
    width: Math.min(4, 1 + edge.weight * 2.5),
    arrow: false,
  };
}
