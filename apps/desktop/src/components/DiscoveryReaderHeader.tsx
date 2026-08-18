/**
 * Purpose: the top bar of the discovery reader (spec 053 §7) — the item's title, the line naming
 * what it is and where it came from, the 收藏 toggle, a way to open the original page in the
 * browser, and the close button. Present on every kind of item, so the same controls sit in the
 * same place whether the reader is watching, listening or reading.
 * Main exports: DiscoveryReaderHeader.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";
import { sourceAndAuthorLine } from "../lib/discoveryCardPresentation";
import { DiscoveryKindIcon } from "./DiscoveryKindIcon";
import { DiscoverySaveToggle } from "./DiscoverySaveToggle";
import { screenOverlayAutofocusRef } from "./ScreenOverlay";

interface DiscoveryReaderHeaderProps {
  card: DiscoveryCardRow;
  onClose(): void;
}

export function DiscoveryReaderHeader({ card, onClose }: DiscoveryReaderHeaderProps) {
  const sourceLine = sourceAndAuthorLine(card);
  const external = card.source_id !== null;

  return (
    <div className="flex shrink-0 items-start gap-4 border-stone-200 border-b px-6 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-stone-800">{card.title}</p>
        {sourceLine !== null && (
          <span className="mt-0.5 flex items-center gap-1.5 text-sm text-stone-500">
            <DiscoveryKindIcon kind={card.kind} />
            <span className="truncate">{sourceLine}</span>
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {external && <DiscoverySaveToggle card={card} />}
        {card.url !== null && (
          <button
            type="button"
            onClick={() => void openUrl(card.url ?? "")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
          >
            <ExternalLink className="size-4" aria-hidden={true} />
            在浏览器打开
          </button>
        )}
        <button
          type="button"
          // Where the modal dialog puts focus when it opens: nothing in here needs interacting
          // with first, so the way out is the safe landing (MDN's recommendation).
          ref={screenOverlayAutofocusRef}
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
        >
          关闭
        </button>
      </div>
    </div>
  );
}
