/**
 * Purpose: canvas drawing calls for GoalOverlayView's react-force-graph-2d renderer (spec 017
 * #2, ADR-0013) — paints both node layers (ghost/goal underlay + solid/owned overlay) in one
 * pass, requires/helps edges with arrowheads, the next-step breathing halo, and the pointer hit
 * area. Visual *decisions* live in overlayVisualStyle.ts (pure, unit-tested); this module only
 * issues the CanvasRenderingContext2D calls.
 * Main exports: paintOverlayNode, paintOverlayLink, paintOverlayNodePointerArea.
 */

import type { OverlayLayoutNode } from "./overlayLayout";
import { overlayNodeRadius } from "./overlayLayout";
import type { OverlayEdge } from "./overlayModel";
import { resolveEdgeVisual, resolveNodeVisual } from "./overlayVisualStyle";

const BREATH_PERIOD_MS = 1800;
const BREATH_MIN_ALPHA = 0.25;
const BREATH_AMPLITUDE = 0.35;
const BREATH_GLOW_BLUR = 18;
const RESTING_GLOW_BLUR = 6;
const LABEL_FONT_PX = 11;
const LABEL_MAX_CHARS = 8;
const HOVER_RING_COLOR = "#d97706"; // amber-600
const HOVER_STROKE_COLOR = "#b45309"; // amber-700

function truncateLabel(label: string, maxChars: number): string {
  const chars = [...label];
  if (chars.length <= maxChars) return label;
  return `${chars.slice(0, maxChars).join("")}…`;
}

/** Time-based sin alpha for the next-step node's glow radius — react-force-graph-2d repaints
 * every animation frame (autoPauseRedraw={false} on the renderer keeps it doing so at rest), so
 * reading the clock here is enough to breathe without any extra requestAnimationFrame loop. */
function breathingGlowBlur(nowMs: number): number {
  const phase = (nowMs % BREATH_PERIOD_MS) / BREATH_PERIOD_MS;
  const alpha = BREATH_MIN_ALPHA + BREATH_AMPLITUDE * (0.5 + 0.5 * Math.sin(phase * Math.PI * 2));
  return BREATH_GLOW_BLUR * alpha;
}

/** Paints both layers of one node in a single pass: ghost/goal underlay first, then the solid
 * owned layer over it (if any), then its label. */
export function paintOverlayNode(
  ctx: CanvasRenderingContext2D,
  node: OverlayLayoutNode,
  isHovered: boolean,
): void {
  const visual = resolveNodeVisual(node);

  ctx.save();
  ctx.setLineDash([...visual.ghost.lineDash]);
  ctx.beginPath();
  ctx.arc(node.x, node.y, visual.ghost.radius, 0, Math.PI * 2);
  ctx.fillStyle = visual.ghost.fillStyle;
  ctx.fill();
  ctx.strokeStyle = visual.ghost.strokeStyle;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  if (visual.owned !== null) {
    ctx.save();
    ctx.globalAlpha = visual.owned.alpha;
    ctx.shadowColor = visual.owned.glowColor;
    ctx.shadowBlur = node.isNextStep ? breathingGlowBlur(performance.now()) : RESTING_GLOW_BLUR;
    ctx.beginPath();
    ctx.arc(node.x, node.y, visual.owned.radius, 0, Math.PI * 2);
    ctx.fillStyle = visual.owned.fillStyle;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = isHovered ? 2.5 : 1.5;
    ctx.strokeStyle = isHovered ? HOVER_STROKE_COLOR : visual.owned.strokeStyle;
    ctx.stroke();
    ctx.restore();
  } else if (isHovered) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(node.x, node.y, visual.ghost.radius, 0, Math.PI * 2);
    ctx.strokeStyle = HOVER_RING_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.font = `${LABEL_FONT_PX}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = visual.owned?.labelColor ?? visual.ghost.labelColor;
  ctx.fillText(
    truncateLabel(node.label, LABEL_MAX_CHARS),
    node.x,
    node.y + visual.ghost.radius + 3,
  );
  ctx.restore();
}

/** The node's full circle as its clickable/hoverable pointer area, painted in force-graph's
 * off-screen hit-detection color — matches the ghost layer's radius so the whole visible node
 * (owned or not) is interactive, not just its label. */
export function paintOverlayNodePointerArea(
  node: OverlayLayoutNode,
  color: string,
  ctx: CanvasRenderingContext2D,
): void {
  ctx.beginPath();
  ctx.arc(node.x, node.y, overlayNodeRadius(node.label), 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

const ARROW_LENGTH = 7;
const ARROW_HALF_ANGLE = Math.PI / 6;

function shortenToCircleEdges(
  source: { x: number; y: number },
  target: { x: number; y: number },
  sourceRadius: number,
  targetRadius: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { from: source, to: target };
  const unitX = dx / distance;
  const unitY = dy / distance;
  return {
    from: { x: source.x + unitX * sourceRadius, y: source.y + unitY * sourceRadius },
    to: { x: target.x - unitX * targetRadius, y: target.y - unitY * targetRadius },
  };
}

/** Draws one edge between two already-laid-out nodes: a straight line stopping at each node's
 * circle boundary, plus a small triangular arrowhead for requires edges. */
export function paintOverlayLink(
  ctx: CanvasRenderingContext2D,
  edge: OverlayEdge,
  source: OverlayLayoutNode,
  target: OverlayLayoutNode,
): void {
  const visual = resolveEdgeVisual(edge, source.state, target.state);
  const { from, to } = shortenToCircleEdges(
    source,
    target,
    overlayNodeRadius(source.label),
    overlayNodeRadius(target.label),
  );

  ctx.save();
  ctx.strokeStyle = visual.color;
  ctx.lineWidth = visual.width;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  if (visual.arrow) {
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - ARROW_LENGTH * Math.cos(angle - ARROW_HALF_ANGLE),
      to.y - ARROW_LENGTH * Math.sin(angle - ARROW_HALF_ANGLE),
    );
    ctx.lineTo(
      to.x - ARROW_LENGTH * Math.cos(angle + ARROW_HALF_ANGLE),
      to.y - ARROW_LENGTH * Math.sin(angle + ARROW_HALF_ANGLE),
    );
    ctx.closePath();
    ctx.fillStyle = visual.color;
    ctx.fill();
  }
  ctx.restore();
}
