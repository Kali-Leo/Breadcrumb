/**
 * Purpose: a discovery card's cover picture (spec 053 §6) — cropped to fill the card's 16:9 box
 * whatever the picture's real proportions are, loaded only once the card comes near the screen. A
 * picture that never arrives tells the caller so, and the card puts its type-toned placeholder in
 * the same box: a broken-image mark is never shown, and neither is the empty grey box left by a
 * host that answers nothing (the deadline lives in lib/discoveryCoverLoad). 省流量模式 (spec 053 §2)
 * takes the same path on purpose — no picture is requested at all.
 * Main exports: DiscoveryCardCover.
 */
import { useCallback, useEffect, useRef } from "react";
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

  /**
   * The caller's callback is kept in a ref and reached through a stable one, so that the effect
   * below depends on the picture and nothing else. It used to list `onUnavailable` itself, and the
   * grid hands a fresh closure down on every render: each render tore the watch down and armed a
   * new eight-second clock, so on a feed that re-renders while the reader scrolls the deadline
   * never arrived at all — 8-second timer set 270 times and cleared 276 times in 25 seconds of
   * sitting still, and the grey boxes it exists to replace stayed on the grid (spec 053 T10c).
   */
  const latestOnUnavailable = useRef(onUnavailable);
  useEffect(() => {
    latestOnUnavailable.current = onUnavailable;
  }, [onUnavailable]);
  const reportUnavailable = useCallback(() => {
    latestOnUnavailable.current();
  }, []);

  useEffect(() => {
    if (dataSaverEnabled) reportUnavailable();
  }, [dataSaverEnabled, reportUnavailable]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: coverUrl is the address the watched <img> fetches, reached through the element
  useEffect(() => {
    const image = imageRef.current;
    if (dataSaverEnabled || image === null) return;
    const watch = watchCoverLoad(reportUnavailable);
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
    // One watch per attempt at one address: a new address is a new attempt and deserves its own
    // clock, and nothing else here may re-arm it — a re-render is not a picture arriving late.
  }, [coverUrl, dataSaverEnabled, reportUnavailable]);

  if (dataSaverEnabled) return null;

  /** The <img> can settle before the effect that set the watch up has run (a picture already in
   * the cache); with no watch to tell, the verdict goes straight to the card. */
  const settle = (naturalWidth: number): void => {
    const watch = watchRef.current;
    if (watch !== null) watch.loaded(naturalWidth);
    else if (naturalWidth === 0) reportUnavailable();
  };

  // The 16:9 box itself belongs to the card (spec 054 §(b)): it is there whether or not a picture
  // ever arrives, and the card's corner mark is positioned against it, so only the picture is
  // drawn here.
  return (
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
        else reportUnavailable();
      }}
      className="size-full object-cover"
    />
  );
}
