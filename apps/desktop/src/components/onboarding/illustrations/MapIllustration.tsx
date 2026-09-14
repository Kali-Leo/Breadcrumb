/**
 * Purpose: the map page — parchment sea, islands of land, and the concept dots on them,
 * with a conversation at the corner feeding dots onto the islands along dotted paths.
 * Main exports: MapIllustration.
 */
import { Illustration, INK, TextLine } from "./Illustration";

const ISLAND_A =
  "M120 62c14-14 40-16 58-6 16 9 26 28 18 44-8 15-30 22-50 18-20-4-36-16-38-30-2-10 4-20 12-26z";
const ISLAND_B = "M214 96c10-8 30-8 40 2 10 10 10 26-2 34-12 8-30 6-38-4-8-10-8-24 0-32z";
const ISLAND_C = "M96 130c8-6 22-6 30 2 6 6 4 16-4 20-10 4-24 2-28-6-4-6-4-12 2-16z";

function Concept({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y} r="4.5" fill={INK.amberDeep} />
      <circle cx={x} cy={y} r="2" fill={INK.cream} />
    </>
  );
}

export function MapIllustration() {
  return (
    <Illustration>
      <defs>
        <marker
          id="map-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="4.5"
          markerHeight="4.5"
          orient="auto"
        >
          <path d="M0 0L8 4L0 8z" fill={INK.amberDeep} />
        </marker>
      </defs>
      <rect x="0" y="0" width="320" height="180" rx="12" fill={INK.parchment} />
      <g fill={INK.land} stroke={INK.mapInk} strokeOpacity="0.55" strokeWidth="1">
        <path d={ISLAND_A} />
        <path d={ISLAND_B} />
        <path d={ISLAND_C} />
      </g>
      <g stroke={INK.mapInk} strokeOpacity="0.35" strokeWidth="1">
        <line x1="138" y1="80" x2="166" y2="70" />
        <line x1="166" y1="70" x2="182" y2="96" />
        <line x1="138" y1="80" x2="150" y2="104" />
        <line x1="150" y1="104" x2="182" y2="96" />
        <line x1="236" y1="112" x2="252" y2="126" />
      </g>
      <Concept x={138} y={80} />
      <Concept x={166} y={70} />
      <Concept x={182} y={96} />
      <Concept x={150} y={104} />
      <Concept x={236} y={112} />
      <Concept x={252} y={126} />
      <Concept x={112} y={142} />

      <rect x="18" y="18" width="84" height="40" rx="8" fill={INK.white} stroke={INK.stone300} />
      <TextLine x={28} y={27} width={56} color={INK.amberDeep} />
      <TextLine x={28} y={38} width={64} />
      <TextLine x={28} y={47} width={44} />
      <g
        fill="none"
        stroke={INK.amberDeep}
        strokeWidth="1.4"
        strokeDasharray="3 3"
        markerEnd="url(#map-arrow)"
      >
        <path d="M102 34c20 0 30 20 30 40" />
        <path d="M102 46c40 4 74 10 100 60" />
        <path d="M76 58c4 30 14 60 30 78" />
      </g>
    </Illustration>
  );
}
