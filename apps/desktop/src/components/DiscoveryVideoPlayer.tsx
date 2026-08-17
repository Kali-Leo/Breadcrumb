/**
 * Purpose: play a video inside the reader using the publisher's own player (spec 053 §7) —
 * YouTube's embed page or bilibili's player page, framed at 16:9. Only the official players are
 * used; nothing about the video is fetched or re-hosted here.
 *
 * No "read through" signal comes from here: the player runs on the publisher's own page, which
 * does not report back what was watched. Watching still counts through the open and dwell
 * signals the overlay records around it.
 * Main exports: DiscoveryVideoPlayer.
 */
import type { VideoEmbed } from "../lib/discoveryVideoEmbeds";

export function DiscoveryVideoPlayer({ embed }: { embed: VideoEmbed }) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl bg-stone-900">
      <iframe
        src={embed.embedUrl}
        title={embed.title}
        className="size-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen={true}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
