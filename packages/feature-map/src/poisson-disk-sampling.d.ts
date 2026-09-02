/**
 * Purpose: minimal type declaration for the untyped poisson-disk-sampling package
 * (blue-noise point sampling used by the island mesh).
 */
declare module "poisson-disk-sampling" {
  export default class PoissonDiskSampling {
    constructor(
      options: {
        shape: number[];
        minDistance: number;
        maxDistance?: number;
        tries?: number;
      },
      rng?: () => number,
    );
    fill(): number[][];
  }
}
