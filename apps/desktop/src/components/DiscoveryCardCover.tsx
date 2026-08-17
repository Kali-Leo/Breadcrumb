/**
 * Purpose: a discovery card's cover picture (spec 053 §6) — a fixed 16:9 box so a grid of cards
 * keeps its rhythm whatever the picture's real proportions are, loaded only once the card comes
 * near the screen. A picture that never arrives tells the caller so, and the card then falls back
 * to a text-forward layout: a broken-image mark is never shown. 省流量模式 (spec 053 §2) takes the
 * same path on purpose — no picture is requested at all, and the card reads as a text card.
 * Main exports: DiscoveryCardCover.
 */
import { useEffect } from "react";
import { useDiscoveryChannelSettingsStore } from "../stores/discoveryChannelSettingsStore";

interface DiscoveryCardCoverProps {
  coverUrl: string;
  /** Alt text: the card's own title, which the card already prints right below the picture, so
   * the picture itself adds nothing for a screen reader and stays out of the reading order. */
  onUnavailable(): void;
}

export function DiscoveryCardCover({ coverUrl, onUnavailable }: DiscoveryCardCoverProps) {
  const dataSaverEnabled = useDiscoveryChannelSettingsStore((state) => state.dataSaverEnabled);

  useEffect(() => {
    if (dataSaverEnabled) onUnavailable();
  }, [dataSaverEnabled, onUnavailable]);

  if (dataSaverEnabled) return null;

  return (
    <div className="aspect-video w-full overflow-hidden bg-stone-100">
      <img
        src={coverUrl}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={onUnavailable}
        className="size-full object-cover"
      />
    </div>
  );
}
