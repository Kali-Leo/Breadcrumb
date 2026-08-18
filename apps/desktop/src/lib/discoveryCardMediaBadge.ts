/**
 * Purpose: the one mark that says what a discovery card is (spec 054 §(d)) — the small line that
 * sits in the corner of every card's picture. All five kinds share that one corner and one shape,
 * so a grid of mixed content reads as one grid instead of five colour-coded families.
 *
 * Two texts come out of here, never one. What the eye reads is short ("约 8 分钟"); what a screen
 * reader says is a whole phrase that names the kind too ("文章，大约 8 分钟"). Reading the short one
 * aloud is how "12:55" becomes "twelve colon fifty-five"; YouTube ships the same pair of texts for
 * the same reason.
 *
 * Duration: no channel we read records how long a video or an episode runs, so nothing here can
 * report one. A video says 视频. The day a running time lands on the card row, this function is the
 * one place that turns it into the two texts — and until then it says what it knows, because a
 * number that was guessed would be read as a fact.
 * Main exports: DISCOVERY_KIND_LABELS, CardMediaBadge, mediaBadgeForCard.
 */
import type { DiscoveryCardKind, DiscoveryCardRow } from "@breadcrumb/core-db";
import { estimateReadingMinutes } from "./discoveryReadingTime";

export const DISCOVERY_KIND_LABELS: Record<DiscoveryCardKind, string> = {
  video: "视频",
  podcast: "播客",
  article: "文章",
  paper: "论文",
  discussion: "讨论",
};

export interface CardMediaBadge {
  /** What is printed on the picture. Kept short: it shares the corner with the picture itself. */
  visual: string;
  /** What is announced instead of the printed text — a phrase, including the kind's name. */
  spoken: string;
}

/** Kinds whose length is a running time we do not have, rather than a text we could time. */
function isPlayable(kind: DiscoveryCardKind): boolean {
  return kind === "video" || kind === "podcast";
}

/**
 * Null only for the retired self-generated cards, which have no kind: they carry no picture and no
 * source either, so there is no corner to mark.
 */
export function mediaBadgeForCard(card: DiscoveryCardRow): CardMediaBadge | null {
  if (card.kind === null) return null;
  const label = DISCOVERY_KIND_LABELS[card.kind];
  if (isPlayable(card.kind)) return { visual: label, spoken: label };

  const minutes = estimateReadingMinutes(card.body_md);
  if (minutes === null) return { visual: label, spoken: label };
  return { visual: `约 ${minutes} 分钟`, spoken: `${label}，大约 ${minutes} 分钟` };
}
