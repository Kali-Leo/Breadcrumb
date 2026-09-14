/**
 * Purpose: the library page — a stack of the learner's own documents going into the panel
 * that lists them, with the search box that reads them first when a question comes.
 * Main exports: LibraryIllustration.
 */
import { Illustration, INK, TextLine } from "./Illustration";

function Page({ x, y, front }: { x: number; y: number; front: boolean }) {
  return (
    <g>
      <path
        d={`M${x} ${y}h40l14 14v56H${x}z`}
        fill={front ? INK.white : INK.stone100}
        stroke={INK.stone300}
      />
      <path d={`M${x + 40} ${y}v14h14`} fill="none" stroke={INK.stone300} />
      {front && (
        <>
          <TextLine x={x + 8} y={y + 24} width={34} height={4} />
          <TextLine x={x + 8} y={y + 34} width={38} height={4} />
          <TextLine x={x + 8} y={y + 44} width={26} height={4} />
          <TextLine x={x + 8} y={y + 54} width={36} height={4} />
        </>
      )}
    </g>
  );
}

export function LibraryIllustration() {
  return (
    <Illustration>
      <defs>
        <marker
          id="library-arrow"
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
      <Page x={44} y={70} front={false} />
      <Page x={36} y={62} front={false} />
      <Page x={28} y={54} front />

      <path
        d="M96 96c20 0 30 0 44 0"
        fill="none"
        stroke={INK.amber}
        strokeWidth="1.6"
        strokeDasharray="3 3"
        markerEnd="url(#library-arrow)"
      />

      <rect x="150" y="26" width="150" height="128" rx="8" fill={INK.white} stroke={INK.stone200} />
      <rect x="160" y="36" width="52" height="14" rx="5" fill={INK.amber} />
      <TextLine x={218} y={41} width={40} height={4} color={INK.stone200} />

      <rect
        x="160"
        y="60"
        width="130"
        height="16"
        rx="6"
        fill={INK.stone100}
        stroke={INK.stone200}
      />
      <circle cx="170" cy="68" r="3.5" fill="none" stroke={INK.stone400} strokeWidth="1.4" />
      <line x1="172.6" y1="70.6" x2="176" y2="74" stroke={INK.stone400} strokeWidth="1.4" />

      {[88, 108, 128].map((y, index) => (
        <g key={y}>
          <rect
            x="160"
            y={y}
            width="12"
            height="14"
            rx="2"
            fill={INK.cream}
            stroke={INK.amberPale}
          />
          <TextLine x={178} y={y + 2} width={index === 1 ? 72 : 96} height={4} />
          <TextLine x={178} y={y + 9} width={40} height={3} color={INK.stone200} />
        </g>
      ))}
    </Illustration>
  );
}
