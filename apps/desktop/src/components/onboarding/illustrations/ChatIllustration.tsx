/**
 * Purpose: the chat page, reduced to its shape — a sidebar, a question, an answer whose
 * sentences end in source dots, and the composer with its two-way mode switch above it.
 * Main exports: ChatIllustration.
 */
import { Illustration, INK, TextLine } from "./Illustration";

export function ChatIllustration() {
  return (
    <Illustration>
      <defs>
        <clipPath id="chat-window">
          <rect x="28" y="14" width="264" height="152" rx="10" />
        </clipPath>
      </defs>
      <rect x="28" y="14" width="264" height="152" rx="10" fill={INK.white} stroke={INK.stone200} />
      <g clipPath="url(#chat-window)">
        <rect x="28" y="14" width="60" height="152" fill={INK.stone100} />
        <rect
          x="36"
          y="24"
          width="44"
          height="12"
          rx="4"
          fill="none"
          stroke={INK.amber}
          strokeDasharray="3 2"
        />
        <TextLine x={36} y={46} width={40} />
        <TextLine x={36} y={58} width={30} />
        <TextLine x={36} y={70} width={36} />
        <circle cx="42" cy="152" r="3" fill={INK.stone400} />
        <circle cx="58" cy="152" r="3" fill={INK.stone400} />
        <circle cx="74" cy="152" r="3" fill={INK.stone400} />
      </g>
      <line x1="88" y1="14" x2="88" y2="166" stroke={INK.stone200} />

      <rect x="176" y="30" width="102" height="20" rx="8" fill={INK.cream} stroke={INK.amberPale} />
      <TextLine x={186} y={37.5} width={70} color={INK.amberDeep} />

      <rect x="102" y="58" width="150" height="50" rx="8" fill={INK.white} stroke={INK.stone200} />
      <TextLine x={112} y={67} width={112} />
      <circle cx="230" cy="69.5" r="2.5" fill={INK.green} />
      <TextLine x={112} y={80} width={96} />
      <circle cx="214" cy="82.5" r="2.5" fill={INK.green} />
      <TextLine x={112} y={93} width={120} />
      <circle cx="238" cy="95.5" r="2.5" fill={INK.amber} />

      <rect x="102" y="116" width="58" height="12" rx="6" fill={INK.white} stroke={INK.stone300} />
      <rect x="130" y="116" width="30" height="12" rx="6" fill={INK.amber} />
      <TextLine x={110} y={120.5} width={12} height={3} color={INK.stone400} />
      <TextLine x={138} y={120.5} width={14} height={3} color={INK.white} />

      <rect x="102" y="134" width="178" height="24" rx="8" fill={INK.white} stroke={INK.stone300} />
      <TextLine x={112} y={143.5} width={60} color={INK.stone200} />
      <rect x="248" y="138" width="26" height="16" rx="5" fill={INK.amber} />
    </Illustration>
  );
}
