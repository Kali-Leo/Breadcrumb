/**
 * Purpose: the small mark that says what a discovery card is — a video, an episode, an article,
 * a paper or a discussion (spec 053 §6). Drawn from the icon set the rest of the app uses
 * (lucide). It carries a spoken label for screen readers; the word itself is not printed, because
 * the picture already says it.
 *
 * `decorative` turns that spoken label off, for the places where the words are already said right
 * next to the icon — the card's corner mark says 视频 in its own screen-reader text (spec 054
 * §(d)), and an icon that repeated it would be announced twice.
 * Main exports: DiscoveryKindIcon.
 */
import type { DiscoveryCardKind } from "@breadcrumb/core-db";
import { FileText, GraduationCap, MessagesSquare, Mic, Play } from "lucide-react";
import type { ComponentType } from "react";
import { DISCOVERY_KIND_LABELS } from "../lib/discoveryCardMediaBadge";

const KIND_ICONS: Record<
  DiscoveryCardKind,
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  video: Play,
  podcast: Mic,
  article: FileText,
  paper: GraduationCap,
  discussion: MessagesSquare,
};

export function DiscoveryKindIcon({
  kind,
  className = "size-3.5",
  decorative = false,
}: {
  kind: DiscoveryCardKind | null;
  className?: string;
  decorative?: boolean;
}) {
  if (kind === null) return null;
  const Icon = KIND_ICONS[kind];
  const label = DISCOVERY_KIND_LABELS[kind];
  return (
    <span className="inline-flex shrink-0 items-center" title={decorative ? undefined : label}>
      <Icon className={className} aria-hidden={true} />
      {!decorative && <span className="sr-only">{label}</span>}
    </span>
  );
}
