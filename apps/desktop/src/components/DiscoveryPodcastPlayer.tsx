/**
 * Purpose: listen to one podcast episode inside the reader (spec 053 §7) — the show's cover
 * picture, the episode title and description, and the browser's own audio player under them.
 * Playing to the end records that the episode was finished.
 *
 * Some feeds link an episode's web page instead of its audio file. That link cannot be played,
 * so the player says so where the controls would have been and leaves the header's 在浏览器打开
 * as the way onward; the cover, title and description stay where they are.
 * Main exports: DiscoveryPodcastPlayer.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useState } from "react";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryReaderFallback } from "./DiscoveryReaderFallback";

const UNPLAYABLE_LINE = "这一集没能在这里播放。";

export function DiscoveryPodcastPlayer({ card }: { card: DiscoveryCardRow }) {
  // The audio file when the feed published one. Falling back to the page link rarely plays, but
  // it costs nothing to try and the unplayable state below catches it.
  const audioSource = card.media_url ?? card.url;
  const [unplayable, setUnplayable] = useState(audioSource === null);

  return (
    <div>
      {card.cover_url !== null && (
        <img
          src={card.cover_url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="mx-auto aspect-square w-48 rounded-xl object-cover"
        />
      )}
      <p className="mt-5 font-medium text-lg text-stone-800 leading-snug">{card.title}</p>
      {unplayable || audioSource === null ? (
        <DiscoveryReaderFallback line={UNPLAYABLE_LINE} className="mt-5" />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: podcast feeds ship no caption track
        <audio
          controls={true}
          preload="none"
          src={audioSource}
          onError={() => setUnplayable(true)}
          onEnded={() => void useDiscoveryStore.getState().recordFinish(card.id, card.topic_label)}
          className="mt-4 w-full"
        />
      )}
      {card.hook.length > 0 && (
        <p className="mt-6 text-[15px] text-stone-600 leading-relaxed">{card.hook}</p>
      )}
    </div>
  );
}
