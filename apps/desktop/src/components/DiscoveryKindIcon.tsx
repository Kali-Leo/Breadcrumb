/**
 * Purpose: the small mark that says what a discovery card is — a video, an episode, an article,
 * a paper or a discussion (spec 053 §6). Drawn from the icon set the rest of the app uses
 * (lucide). It sits next to the source name and carries a spoken label for screen readers; the
 * word itself is not printed, because the picture already says it.
 * Main exports: DiscoveryKindIcon.
 */
import type { DiscoveryCardKind } from "@breadcrumb/core-db";
import { FileText, GraduationCap, MessagesSquare, Mic, Play } from "lucide-react";
import type { ComponentType } from "react";

interface KindMark {
  Icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}

const KIND_MARKS: Record<DiscoveryCardKind, KindMark> = {
  video: { Icon: Play, label: "视频" },
  podcast: { Icon: Mic, label: "播客" },
  article: { Icon: FileText, label: "文章" },
  paper: { Icon: GraduationCap, label: "论文" },
  discussion: { Icon: MessagesSquare, label: "讨论" },
};

export function DiscoveryKindIcon({
  kind,
  className = "size-3.5",
}: {
  kind: DiscoveryCardKind | null;
  className?: string;
}) {
  if (kind === null) return null;
  const { Icon, label } = KIND_MARKS[kind];
  return (
    <span className="inline-flex shrink-0 items-center" title={label}>
      <Icon className={className} aria-hidden={true} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
