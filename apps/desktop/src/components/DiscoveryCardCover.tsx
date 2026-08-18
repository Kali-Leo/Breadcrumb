/**
 * Purpose: a discovery card's cover picture (spec 053 §6) — a fixed 16:9 box so a grid of cards
 * keeps its rhythm whatever the picture's real proportions are, loaded only once the card comes
 * near the screen. A picture that never arrives tells the caller so, and the card then falls back
 * to a text-forward layout: a broken-image mark is never shown, and neither is an empty grey box
 * left by a host that answers nothing (the deadline lives in lib/discoveryCoverLoad). 省流量模式
 * (spec 053 §2) takes the same path on purpose — no picture is requested at all, and the card
 * reads as a text card.
 * Main exports: DiscoveryCardCover.
 */
import { useEffect, useRef } from "react";
import { type CoverLoadWatch, watchCoverLoad } from "../lib/discoveryCoverLoad";
import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";

/** How near the screen a card has to come before its picture counts as being fetched. The same
 * neighbourhood the browser's own lazy loading works in, so the deadline starts when the request
 * does rather than when the card is created. */
const COVER_FETCH_MARGIN = "600px";

interface DiscoveryCardCoverProps {
  coverUrl: string;
  /** Alt text: the card's own title, which the card already prints right below the picture, so
   * the picture itself adds nothing for a screen reader and stays out of the reading order. */
  onUnavailable(): void;
}

export function DiscoveryCardCover({ coverUrl, onUnavailable }: DiscoveryCardCoverProps) {
  const dataSaverEnabled = useDiscoveryChannelSettingsStore((state) => state.dataSaverEnabled);
  const imageRef = useRef<HTMLImageElement>(null);
  const watchRef = useRef<CoverLoadWatch | null>(null);

  useEffect(() => {
    if (dataSaverEnabled) onUnavailable();
  }, [dataSaverEnabled, onUnavailable]);

  useEffect(() => {
    const image = imageRef.current;
    if (dataSaverEnabled || image === null) return;
    const watch = watchCoverLoad(onUnavailable);
    watchRef.current = watch;
    // The picture is lazily loaded, so the browser only asks for it once the card comes near the
    // screen; a card further down the feed is not a picture that is late.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        watch.start();
      },
      { rootMargin: COVER_FETCH_MARGIN },
    );
    observer.observe(image);
    return () => {
      observer.disconnect();
      watch.cancel();
      watchRef.current = null;
    };
    // The address is not a dependency: the grid keys a tile by its card's id, so one of these
    // watches one card's one picture for as long as it exists.
  }, [dataSaverEnabled, onUnavailable]);

  if (dataSaverEnabled) return null;

  /** The <img> can settle before the effect that set the watch up has run (a picture already in
   * the cache); with no watch to tell, the verdict goes straight to the card. */
  const settle = (naturalWidth: number): void => {
    const watch = watchRef.current;
    if (watch !== null) watch.loaded(naturalWidth);
    else if (naturalWidth === 0) onUnavailable();
  };

  return (
    <div className="aspect-video w-full overflow-hidden bg-stone-100">
      <img
        ref={imageRef}
        src={coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(event) => settle(event.currentTarget.naturalWidth)}
        onError={() => {
          const watch = watchRef.current;
          if (watch !== null) watch.failed();
          else onUnavailable();
        }}
        className="size-full object-cover"
      />
    </div>
  );
}
