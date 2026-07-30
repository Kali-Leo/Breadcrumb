/**
 * Purpose: undirected weighted graph with A*-style pathfinding used for town roads.
 * Ported from watabou's TownGeneratorOS (GPL-3.0) Source/com/watabou/geom/Graph.hx.
 * Main exports: Graph, Node.
 */

import { remove } from "../utils/arrayHelpers";

export class Node {
  readonly links = new Map<Node, number>();

  link(node: Node, price = 1, symmetrical = true): void {
    this.links.set(node, price);
    if (symmetrical) {
      node.links.set(this, price);
    }
  }

  unlink(node: Node, symmetrical = true): void {
    this.links.delete(node);
    if (symmetrical) {
      node.links.delete(this);
    }
  }

  unlinkAll(): void {
    for (const node of this.links.keys()) {
      this.unlink(node);
    }
  }
}

export class Graph {
  nodes: Node[] = [];

  add(node: Node | null = null): Node {
    const added = node ?? new Node();
    this.nodes.push(added);
    return added;
  }

  remove(node: Node): void {
    node.unlinkAll();
    remove(this.nodes, node);
  }

  aStar(start: Node, goal: Node, exclude: Node[] | null = null): Node[] | null {
    const closedSet: Node[] = exclude !== null ? exclude.slice() : [];
    const openSet: Node[] = [start];
    const cameFrom = new Map<Node, Node>();
    const gScore = new Map<Node, number>([[start, 0]]);

    while (openSet.length > 0) {
      const current = openSet.shift();
      if (current === undefined) {
        break;
      }
      if (current === goal) {
        return this.buildPath(cameFrom, current);
      }

      closedSet.push(current);

      // Invariant: every node in the open set has a gScore entry (as in the Haxe source).
      const currentScore = gScore.get(current) ?? Number.NaN;
      for (const neighbour of current.links.keys()) {
        if (closedSet.includes(neighbour)) {
          continue;
        }

        const score = currentScore + (current.links.get(neighbour) ?? Number.NaN);
        if (!openSet.includes(neighbour)) {
          openSet.push(neighbour);
        } else if (score >= (gScore.get(neighbour) ?? Number.NEGATIVE_INFINITY)) {
          continue;
        }

        cameFrom.set(neighbour, current);
        gScore.set(neighbour, score);
      }
    }

    return null;
  }

  private buildPath(cameFrom: Map<Node, Node>, current: Node): Node[] {
    const path = [current];

    let node = current;
    let previous = cameFrom.get(node);
    while (previous !== undefined) {
      node = previous;
      path.push(node);
      previous = cameFrom.get(node);
    }

    return path;
  }

  calculatePrice(path: Node[]): number {
    if (path.length < 2) {
      return 0;
    }

    let price = 0;
    let current = path[0];
    let next = path[1];
    for (let i = 0; i < path.length - 1; i++) {
      if (current === undefined || next === undefined) {
        return Number.NaN;
      }
      const linkPrice = current.links.get(next);
      if (linkPrice === undefined) {
        return Number.NaN;
      }
      price += linkPrice;
      current = next;
      // Note: `path[i + 1]` (not i + 2) is preserved verbatim from the Haxe source.
      next = path[i + 1];
    }
    return price;
  }
}
