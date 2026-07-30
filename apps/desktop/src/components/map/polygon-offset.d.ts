/**
 * Purpose: minimal type declaration for the untyped polygon-offset package
 * (true polygon buffering used for the coastal water rings).
 */
declare module "polygon-offset" {
  type OffsetPoint = [number, number];
  export default class Offset {
    data(points: OffsetPoint[] | OffsetPoint[][]): Offset;
    /** Outward buffer. */
    margin(distance: number): OffsetPoint[][];
    /** Inward buffer. */
    padding(distance: number): OffsetPoint[][];
  }
}
