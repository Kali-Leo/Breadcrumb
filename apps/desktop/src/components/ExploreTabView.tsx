/**
 * Purpose: 探索 tab body — the station map (spec 040 §3) as the main body, plus the 收线
 * button that opens the exploration atlas's text detail.
 * Main exports: ExploreTabView.
 */
import { EXPLORE_UI_COPY } from "@breadcrumb/plugin-explore";
import { StationMap } from "./StationMap";

interface ExploreTabViewProps {
  conversationId: string | null;
  onOpenAtlas: () => void;
}

export function ExploreTabView({ conversationId, onOpenAtlas }: ExploreTabViewProps) {
  return (
    <div className="flex flex-col gap-2">
      <StationMap />
      {conversationId !== null && (
        <button
          type="button"
          onClick={onOpenAtlas}
          className="mx-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-700 transition-colors hover:bg-amber-100"
        >
          {EXPLORE_UI_COPY.atlasEntryButton}
        </button>
      )}
    </div>
  );
}
