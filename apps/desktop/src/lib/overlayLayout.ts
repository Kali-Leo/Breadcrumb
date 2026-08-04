/**
 * Purpose: pure headless force-directed layout for GoalOverlayView (spec 017 #2, ADR-0013) —
 * runs d3-force to convergence off-screen and freezes each node's coordinates (fx/fy) so the
 * same node/edge set always lays out identically before react-force-graph-2d ever sees it
 * (cooldownTicks={0} on the renderer then has nothing left to move). No React/DOM here.
 * Main exports: computeOverlayLayout, overlayNodeRadius, OverlayLayoutNode, OverlayLayout.
 */
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import type { OverlayEdge, OverlayNode } from "./overlayModel";

export interface OverlayLayoutNode extends OverlayNode {
  x: number;
  y: number;
  /** Fixed (frozen) position — set equal to x/y so react-force-graph-2d's own force engine
   * treats every node as pinned instead of re-simulating it. */
  fx: number;
  fy: number;
}

export interface OverlayLayout {
  nodes: OverlayLayoutNode[];
  edges: OverlayEdge[];
}

const SIMULATION_TICKS = 300;
const REQUIRES_LINK_DISTANCE = 90;
const REQUIRES_LINK_STRENGTH = 0.9;
const HELPS_LINK_DISTANCE = 170;
const HELPS_LINK_STRENGTH = 0.2;
const CHARGE_STRENGTH = -220;
const NODE_BASE_RADIUS = 16;
const NODE_RADIUS_PER_CHAR = 3.2;
const NODE_MAX_RADIUS = 46;
const COLLIDE_GAP = 14;

/** Visual + hit-test radius for a node's circle, sized from its label so long labels get more
 * breathing room — shared by the layout's collision force, the canvas painter, and the pointer
 * hit area so all three agree on where a node "is". */
export function overlayNodeRadius(label: string | undefined): number {
  const radius = NODE_BASE_RADIUS + [...(label ?? "")].length * NODE_RADIUS_PER_CHAR;
  return Math.min(radius, NODE_MAX_RADIUS);
}

interface SimNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  index?: number;
}

interface SimLink {
  source: string;
  target: string;
  type: OverlayEdge["type"];
}

/** Runs d3-force headlessly to convergence and returns every input node with frozen (fx/fy)
 * coordinates. Deterministic: node/link order is sorted by id before simulating (d3-force's
 * default phyllotaxis initial placement depends only on array index, and its internal jitter
 * uses a seeded generator, not Math.random — so the same scope always lays out pixel-identically
 * regardless of call order or React re-render timing). */
export function computeOverlayLayout(
  nodes: readonly OverlayNode[],
  edges: readonly OverlayEdge[],
): OverlayLayout {
  const orderedNodes = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  const simNodes: SimNode[] = orderedNodes.map((node) => ({ id: node.id, label: node.label }));
  const simLinks: SimLink[] = [...edges]
    .sort((a, b) => `${a.source}>${a.target}`.localeCompare(`${b.source}>${b.target}`))
    .map((edge) => ({ source: edge.source, target: edge.target, type: edge.type }));

  const simulation = forceSimulation(simNodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((node) => node.id)
        .distance((link) =>
          link.type === "requires" ? REQUIRES_LINK_DISTANCE : HELPS_LINK_DISTANCE,
        )
        .strength((link) =>
          link.type === "requires" ? REQUIRES_LINK_STRENGTH : HELPS_LINK_STRENGTH,
        ),
    )
    .force("charge", forceManyBody().strength(CHARGE_STRENGTH))
    .force(
      "collide",
      forceCollide<SimNode>((node) => overlayNodeRadius(node.label) + COLLIDE_GAP),
    )
    .force("center", forceCenter(0, 0))
    .stop();

  for (let tick = 0; tick < SIMULATION_TICKS; tick += 1) simulation.tick();

  const positionById = new Map(
    simNodes.map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
  );

  const layoutNodes: OverlayLayoutNode[] = nodes.map((node) => {
    const position = positionById.get(node.id) ?? { x: 0, y: 0 };
    return { ...node, x: position.x, y: position.y, fx: position.x, fy: position.y };
  });

  return { nodes: layoutNodes, edges: [...edges] };
}
