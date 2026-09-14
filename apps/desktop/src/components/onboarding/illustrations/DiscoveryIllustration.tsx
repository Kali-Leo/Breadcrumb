/**
 * Purpose: the discovery page — a browser with a video playing on one side, and on the
 * other the interest panel it fills in, drawn as circles of the sizes the topics reach.
 * Main exports: DiscoveryIllustration.
 */
import { Illustration, INK, TextLine } from "./Illustration";

export function DiscoveryIllustration() {
  return (
    <Illustration>
      <defs>
        <marker
          id="discovery-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M0 0L8 4L0 8z" fill={INK.amber} />
        </marker>
      </defs>
      <rect x="16" y="22" width="150" height="136" rx="8" fill={INK.white} stroke={INK.stone200} />
      <line x1="16" y1="38" x2="166" y2="38" stroke={INK.stone200} />
      <circle cx="26" cy="30" r="2.5" fill={INK.stone300} />
      <circle cx="34" cy="30" r="2.5" fill={INK.stone300} />
      <circle cx="42" cy="30" r="2.5" fill={INK.stone300} />
      <rect x="56" y="26" width="90" height="8" rx="4" fill={INK.stone100} />

      <rect x="26" y="46" width="130" height="66" rx="4" fill={INK.stone200} />
      <path d="M84 68l20 11-20 11z" fill={INK.stone500} />
      <rect x="26" y="106" width="130" height="3" fill={INK.stone300} />
      <rect x="26" y="106" width="78" height="3" fill={INK.amber} />

      <rect x="26" y="120" width="30" height="20" rx="3" fill={INK.stone200} />
      <TextLine x={62} y={123} width={70} height={4} />
      <TextLine x={62} y={132} width={44} height={4} />
      <rect x="26" y="146" width="30" height="8" rx="3" fill={INK.stone200} />
      <TextLine x={62} y={148} width={60} height={4} />

      <path
        d="M170 90c10 0 14 0 24 0"
        fill="none"
        stroke={INK.amber}
        strokeWidth="1.6"
        strokeDasharray="3 3"
        markerEnd="url(#discovery-arrow)"
      />

      <rect x="204" y="22" width="100" height="136" rx="8" fill={INK.white} stroke={INK.stone200} />
      <TextLine x={214} y={32} width={40} color={INK.amberDeep} />
      <circle cx="240" cy="72" r="18" fill={INK.amber} />
      <circle cx="274" cy="60" r="11" fill={INK.amberSoft} />
      <circle cx="222" cy="106" r="9" fill={INK.amberPale} />
      <circle cx="270" cy="98" r="13" fill={INK.amberSoft} />
      <circle cx="248" cy="126" r="7" fill={INK.amberPale} />
      <circle cx="284" cy="130" r="5" fill={INK.stone300} />
      <circle cx="222" cy="134" r="4" fill={INK.stone300} />
    </Illustration>
  );
}
