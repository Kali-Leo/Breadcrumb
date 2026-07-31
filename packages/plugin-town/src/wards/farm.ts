/**
 * Purpose: farm ward — a small rotated homestead placed between a random vertex and the
 * patch centroid, subdivided orthogonally.
 * Ported from watabou's TownGeneratorOS (GPL-3.0)
 * Source/com/watabou/towngenerator/wards/Farm.hx.
 * Main exports: Farm.
 */

import { interpolate } from "../geom/geomUtils";
import { Polygon } from "../geom/polygon";
import { random } from "../utils/arrayHelpers";
import { townRandom } from "../utils/townRandom";
import { Ward } from "./ward";
import { createOrthoBuilding } from "./wardShapes";

export class Farm extends Ward {
  override createGeometry(): void {
    const housing = Polygon.rect(4, 4);
    const pos = interpolate(
      random([...this.patch.shape]),
      this.patch.shape.centroid,
      0.3 + townRandom.float() * 0.4,
    );
    housing.rotate(townRandom.float() * Math.PI);
    housing.offset(pos);

    this.geometry = createOrthoBuilding(housing, 8, 0.5);
  }

  override getLabel(): string {
    return "Farm";
  }
}
