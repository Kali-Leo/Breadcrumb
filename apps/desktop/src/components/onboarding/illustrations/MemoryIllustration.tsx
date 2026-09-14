/**
 * Purpose: the mirror — three islands and the days under each: land that was visited stays
 * vivid, land left alone for long pales, and the calendar beneath shows which is which.
 * Main exports: MemoryIllustration.
 */
import { Illustration, INK } from "./Illustration";

const ISLAND =
  "M0 0c12-12 34-14 50-6 14 8 22 24 16 38-7 13-26 19-43 16-17-4-31-14-33-26-2-8 3-17 10-22z";

function Island({ x, y, opacity }: { x: number; y: number; opacity: number }) {
  return (
    <g transform={`translate(${x} ${y})`} opacity={opacity}>
      <path d={ISLAND} fill={INK.land} stroke={INK.mapInk} strokeOpacity="0.55" />
      <line x1="18" y1="16" x2="42" y2="10" stroke={INK.mapInk} strokeOpacity="0.35" />
      <line x1="42" y1="10" x2="52" y2="30" stroke={INK.mapInk} strokeOpacity="0.35" />
      <circle cx="18" cy="16" r="4" fill={INK.amberDeep} />
      <circle cx="42" cy="10" r="4" fill={INK.amberDeep} />
      <circle cx="52" cy="30" r="4" fill={INK.amberDeep} />
    </g>
  );
}

const DAYS = Array.from({ length: 14 }, (_, day) => day);

/** A fortnight of days under one island; `active` says which of them were visited. */
function Days({ x, active }: { x: number; active: number[] }) {
  return (
    <g>
      {DAYS.map((day) => (
        <rect
          key={`${x}-${day}`}
          x={x + (day % 7) * 10}
          y={122 + Math.floor(day / 7) * 10}
          width="8"
          height="8"
          rx="2"
          fill={active.includes(day) ? INK.amber : INK.white}
          fillOpacity={active.includes(day) ? 1 : 0.7}
        />
      ))}
    </g>
  );
}

export function MemoryIllustration() {
  return (
    <Illustration>
      <rect x="0" y="0" width="320" height="180" rx="12" fill={INK.parchment} />
      <Island x={30} y={40} opacity={0.3} />
      <Island x={128} y={36} opacity={0.65} />
      <Island x={226} y={42} opacity={1} />
      <Days x={30} active={[]} />
      <Days x={128} active={[1, 4]} />
      <Days x={226} active={[0, 1, 3, 5, 6, 8, 9, 11, 13]} />
    </Illustration>
  );
}
