/**
 * Purpose: semantic zoom — turns the viewport scale into target opacities for the
 * three content bands (geo / kingdom / village) with smooth crossfades.
 * Main exports: bandVisibility, BandVisibility.
 */
import { ZOOM_BANDS } from "./mapTheme";

export interface BandVisibility {
  geo: number;
  kingdom: number;
  village: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

export function bandVisibility(scale: number): BandVisibility {
  const intoKingdom = smoothstep(ZOOM_BANDS.geoMax * 0.85, ZOOM_BANDS.geoMax * 1.35, scale);
  const intoVillage = smoothstep(ZOOM_BANDS.villageMin * 0.85, ZOOM_BANDS.villageMin * 1.35, scale);
  return {
    geo: 1 - intoKingdom,
    kingdom: intoKingdom * (1 - intoVillage * 0.82),
    village: intoVillage,
  };
}
