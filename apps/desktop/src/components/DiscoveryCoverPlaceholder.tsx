/**
 * Purpose: what fills a card's picture area when there is no picture (spec 054 §(b)). A source
 * that ships no cover art, a host that answers nothing, and 省流量模式 all end up here.
 *
 * The area keeps its full 16:9 size on purpose. Letting it collapse is what made the feed look
 * ragged: a row of cards where one starts with a picture and its neighbour starts with a title has
 * no shared line for the eye to follow, and M3 asks for thumbnails at identical sizes "even if the
 * original photos have different aspect ratios".
 *
 * One quiet tone for all five kinds, not one tone each. The kind is already said by the icon here
 * and by the corner mark on top of it; painting five background colours into a grid of forty cards
 * would turn the page into noise, which is the trade-off spec 054 §(d) settles against colour.
 * Main exports: DiscoveryCoverPlaceholder.
 */
import type { DiscoveryCardKind } from "@breadcrumb/core-db";
import { DiscoveryKindIcon } from "./DiscoveryKindIcon";

export function DiscoveryCoverPlaceholder({ kind }: { kind: DiscoveryCardKind | null }) {
  return (
    <div
      data-testid="discovery-cover-placeholder"
      className="flex size-full items-center justify-center bg-stone-100"
    >
      <DiscoveryKindIcon kind={kind} className="size-8 text-stone-300" decorative={true} />
    </div>
  );
}
