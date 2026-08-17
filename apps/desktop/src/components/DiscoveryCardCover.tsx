/**
 * Purpose: a discovery card's cover picture (spec 053 §6) — a fixed 16:9 box so a grid of cards
 * keeps its rhythm whatever the picture's real proportions are, loaded only once the card comes
 * near the screen. A picture that never arrives tells the caller so, and the card then falls back
 * to a text-forward layout: a broken-image mark is never shown.
 * Main exports: DiscoveryCardCover.
 */

interface DiscoveryCardCoverProps {
  coverUrl: string;
  /** Alt text: the card's own title, which the card already prints right below the picture, so
   * the picture itself adds nothing for a screen reader and stays out of the reading order. */
  onUnavailable(): void;
}

export function DiscoveryCardCover({ coverUrl, onUnavailable }: DiscoveryCardCoverProps) {
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
