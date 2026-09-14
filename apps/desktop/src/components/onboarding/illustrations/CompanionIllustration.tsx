/**
 * Purpose: the companions — a small figure asking, and the learner answering at length: the
 * larger bubble belongs to the person, not to the app, because here it is the learner who
 * explains.
 * Main exports: CompanionIllustration.
 */
import { Illustration, INK, TextLine } from "./Illustration";

function Figure({
  x,
  y,
  scale,
  fill,
  stroke,
}: {
  x: number;
  y: number;
  scale: number;
  fill: string;
  stroke: string;
}) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.2 / scale}
    >
      <circle cx="0" cy="-22" r="12" />
      <path d="M-22 22c0-16 10-24 22-24s22 8 22 24z" />
    </g>
  );
}

export function CompanionIllustration() {
  return (
    <Illustration>
      <Figure x={64} y={122} scale={0.9} fill={INK.amberPale} stroke={INK.amberDeep} />
      <path
        d="M92 56h46a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6h-30l-12 10v-10h-4a6 6 0 0 1-6-6V62a6 6 0 0 1 6-6z"
        fill={INK.white}
        stroke={INK.stone300}
      />
      <path
        d="M111 66c0-5 8-5 8 0 0 3-4 3-4 7"
        fill="none"
        stroke={INK.amberDeep}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="115" cy="78" r="1.6" fill={INK.amberDeep} />

      <Figure x={266} y={126} scale={1.3} fill={INK.stone200} stroke={INK.stone500} />
      <path
        d="M126 94h88a8 8 0 0 1 8 8v10l12 6-12 6v22a8 8 0 0 1-8 8h-88a8 8 0 0 1-8-8v-44a8 8 0 0 1 8-8z"
        fill={INK.white}
        stroke={INK.amber}
        strokeWidth="1.4"
      />
      <TextLine x={128} y={106} width={72} color={INK.amber} />
      <TextLine x={128} y={118} width={84} />
      <TextLine x={128} y={130} width={60} />
      <TextLine x={128} y={142} width={76} />
    </Illustration>
  );
}
