/**
 * Purpose: the last slide — the loaf the app is named after, and the trail of crumbs that
 * leads up to it.
 * Main exports: StartIllustration.
 */
import { Illustration, INK } from "./Illustration";

const CRUMBS: readonly [number, number, number][] = [
  [30, 150, 2],
  [52, 138, 2.4],
  [76, 132, 2.8],
  [100, 120, 3.2],
  [122, 114, 3.6],
  [146, 104, 4],
];

export function StartIllustration() {
  return (
    <Illustration>
      <path
        d="M176 104c0-24 22-42 52-42s52 18 52 42v40a8 8 0 0 1-8 8H184a8 8 0 0 1-8-8z"
        fill={INK.amberSoft}
        stroke={INK.amberDeep}
        strokeWidth="1.6"
      />
      <path
        d="M190 106c0-16 16-30 38-30s38 14 38 30v34H190z"
        fill={INK.cream}
        stroke={INK.amberDeep}
        strokeWidth="1"
        strokeOpacity="0.5"
      />
      <path
        d="M212 96c4-6 12-10 20-10"
        fill="none"
        stroke={INK.white}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {CRUMBS.map(([x, y, r]) => (
        <circle key={x} cx={x} cy={y} r={r} fill={INK.amber} />
      ))}
      <circle cx="160" cy="96" r="4.5" fill={INK.amberDeep} />
    </Illustration>
  );
}
