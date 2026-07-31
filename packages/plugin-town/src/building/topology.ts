/**
 * Purpose: navigation topology of the town — a graph over patch vertices (excluding blocked
 * wall/citadel points) used to route streets and roads with A*.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/Topology.hx.
 * Main exports: Topology.
 */

import { Graph, type Node } from "../geom/graph";
import { Point } from "../geom/point";
import { addUnique, differenceOf } from "./arraySupport";
import type { Model } from "./model";

export class Topology {
  private readonly graph: Graph;

  readonly pt2node: Map<Point, Node>;
  readonly node2pt: Map<Node, Point>;

  private readonly blocked: Point[];

  readonly inner: Node[] = [];
  readonly outer: Node[] = [];

  constructor(model: Model) {
    this.graph = new Graph();
    this.pt2node = new Map();
    this.node2pt = new Map();

    // Building a list of all blocked points (shore + walls excluding gates)
    let blocked: Point[] = [];
    if (model.citadel !== null) {
      blocked = blocked.concat([...model.citadel.shape]);
    }
    if (model.wall !== null) {
      blocked = blocked.concat([...model.wall.shape]);
    }
    this.blocked = differenceOf(blocked, model.gates);

    const border = model.border.shape;

    for (const p of model.patches) {
      const withinCity = p.withinCity;

      let v1: Point = p.shape.at(p.shape.length - 1);
      let n1: Node | null = this.processPoint(v1);

      for (let i = 0; i < p.shape.length; i++) {
        const v0 = v1;
        v1 = p.shape.at(i);
        const n0 = n1;
        n1 = this.processPoint(v1);

        if (n0 !== null && !border.contains(v0)) {
          if (withinCity) {
            addUnique(this.inner, n0);
          } else {
            addUnique(this.outer, n0);
          }
        }
        if (n1 !== null && !border.contains(v1)) {
          if (withinCity) {
            addUnique(this.inner, n1);
          } else {
            addUnique(this.outer, n1);
          }
        }

        if (n0 !== null && n1 !== null) {
          n0.link(n1, Point.distance(v0, v1));
        }
      }
    }
  }

  private processPoint(v: Point): Node | null {
    let n: Node;

    const existing = this.pt2node.get(v);
    if (existing !== undefined) {
      n = existing;
    } else {
      n = this.graph.add();
      this.pt2node.set(v, n);
      this.node2pt.set(n, v);
    }

    return this.blocked.includes(v) ? null : n;
  }

  buildPath(from: Point, to: Point, exclude: Node[] | null = null): Point[] | null {
    const start = this.pt2node.get(from);
    const goal = this.pt2node.get(to);
    if (start === undefined || goal === undefined) {
      return null;
    }

    const path = this.graph.aStar(start, goal, exclude);
    if (path === null) {
      return null;
    }
    return path.map((n) => {
      const p = this.node2pt.get(n);
      if (p === undefined) {
        throw new Error("Topology node without a mapped point");
      }
      return p;
    });
  }
}
