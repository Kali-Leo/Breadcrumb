/**
 * Purpose: street/road/artery construction for the town model (Model.buildStreets and
 * Model.tidyUpRoads as free functions over the public Model surface).
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/building/Model.hx.
 * Main exports: buildModelStreets.
 */

import { Point } from "../geom/point";
import { Polygon } from "../geom/polygon";
import { Segment } from "../geom/segment";
import type { Model, Street } from "./model";
import { Topology } from "./topology";

function smoothStreet(street: Street): void {
  const smoothed = street.smoothVertexEq(3);
  for (let i = 1; i < street.length - 1; i++) {
    street.at(i).set(smoothed.at(i));
  }
}

/** Model.buildStreets: routes a street from every gate to the center, roads outwards. */
export function buildModelStreets(model: Model): void {
  const topology = new Topology(model);
  model.topology = topology;

  for (const gate of model.gates) {
    // Each gate is connected to the nearest corner of the plaza or to the central junction
    const end: Point =
      model.plaza !== null ? model.plaza.shape.min((v) => Point.distance(v, gate)) : model.center;

    const street = topology.buildPath(gate, end, topology.outer);
    if (street === null) {
      throw new Error("Unable to build a street!");
    }
    model.streets.push(new Polygon(street));

    if (model.border.gates.includes(gate)) {
      const dir = gate.norm(1000);
      let start: Point | null = null;
      let dist = Number.POSITIVE_INFINITY;
      for (const p of topology.node2pt.values()) {
        const d = Point.distance(p, dir);
        if (d < dist) {
          dist = d;
          start = p;
        }
      }

      if (start !== null) {
        const road = topology.buildPath(start, gate, topology.inner);
        if (road !== null) {
          model.roads.push(new Polygon(road));
        }
      }
    }
  }

  tidyUpRoads(model);

  for (const artery of model.arteries) {
    smoothStreet(artery);
  }
}

/** Model.tidyUpRoads: dedupes street/road segments and chains them into arteries. */
function tidyUpRoads(model: Model): void {
  const segments: Segment[] = [];

  const cut2segments = (street: Street): void => {
    let v1 = street.at(0);
    for (let i = 1; i < street.length; i++) {
      const v0 = v1;
      v1 = street.at(i);

      // Removing segments which go along the plaza
      if (model.plaza?.shape.contains(v0) && model.plaza.shape.contains(v1)) {
        continue;
      }

      let exists = false;
      for (const seg of segments) {
        if (seg.start === v0 && seg.end === v1) {
          exists = true;
          break;
        }
      }

      if (!exists) {
        segments.push(new Segment(v0, v1));
      }
    }
  };

  for (const street of model.streets) {
    cut2segments(street);
  }
  for (const road of model.roads) {
    cut2segments(road);
  }

  model.arteries = [];
  while (segments.length > 0) {
    const seg = segments.pop();
    if (seg === undefined) {
      break;
    }

    let attached = false;
    for (const artery of model.arteries) {
      if (artery.at(0) === seg.end) {
        artery.unshift(seg.start);
        attached = true;
        break;
      }
      if (artery.at(artery.length - 1) === seg.start) {
        artery.push(seg.end);
        attached = true;
        break;
      }
    }

    if (!attached) {
      model.arteries.push(new Polygon([seg.start, seg.end]));
    }
  }
}
