/**
 * Purpose: the third zoom level's container (spec 049) — the region header with its
 * relations switch, the subway tree, and the right rail's node card plus region mirror. The
 * view model (planner data, selection, persisted collapse) lives in useKingdomModel; the
 * card's actions in lib/map/kingdomActions.
 * Main exports: KingdomView, KingdomRef.
 */

import { formatDayMonth } from "@breadcrumb/core-i18n";
import { useTranslation } from "react-i18next";
import { goToKingdomOrigin } from "../../../lib/map/kingdomActions";
import { BackArrow } from "../../DirectionalArrow";
import { RegionMirror } from "../RegionMirror";
import { KingdomNodeCard } from "./KingdomNodeCard";
import { KingdomTreeSvg } from "./KingdomTreeSvg";
import { type KingdomRef, useKingdomModel } from "./useKingdomModel";

export type { KingdomRef };

interface KingdomViewProps {
  kingdom: KingdomRef;
  onClose(): void;
}

function plainDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : formatDayMonth(locale, date);
}

export function KingdomView({ kingdom, onClose }: KingdomViewProps) {
  const { t, i18n } = useTranslation("palace");
  const { model, feedbackSources } = useKingdomModel(kingdom);
  const cardNode = model.cardNode;

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2">
          {/* Back sits on the left, icon only — the arrow is the whole vocabulary
              (Leo 2026-08-31 #5); the label survives as the accessible name. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("kingdom.backToIsland")}
            title={t("kingdom.backToIsland")}
            className="rounded-lg px-2 py-1.5 text-stone-500 hover:bg-stone-100"
          >
            <BackArrow />
          </button>
          <h2 className="text-sm font-semibold text-stone-700">{kingdom.label}</h2>
          {model.hasLateralEdges && (
            <label
              className="ms-auto flex items-center gap-1 text-xs text-stone-500"
              title={t("kingdom.relationHint")}
            >
              <input
                type="checkbox"
                checked={model.showAllEdges}
                onChange={(event) => model.setShowAllEdges(event.target.checked)}
              />
              {t("kingdom.showAllRelations")}
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 bg-stone-50">
          <KingdomTreeSvg
            visibleNodes={model.visibleNodes}
            lateralEdges={model.lateralEdges}
            primaryId={model.primaryId}
            pinnedIds={model.pinnedIds}
            selectedId={model.selectedId}
            onSelect={model.setSelectedId}
            onEnter={(nodeId) => void model.enterNode(nodeId)}
            onHover={model.setHoverId}
            onExpandAggregate={model.toggleCollapse}
          />
        </div>
      </div>
      <aside className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-s border-stone-200 bg-stone-50 p-4">
        {model.recommendation.regionDone && (
          <p className="rounded-xl bg-white p-3 text-xs text-stone-500 shadow-sm">
            {t("kingdom.areaDone")}
          </p>
        )}
        {cardNode !== null && (
          <KingdomNodeCard
            node={cardNode}
            isPrimary={cardNode.id === model.primaryId}
            candidate={model.recommendation.primary}
            alternates={model.recommendation.alternates}
            lastSeenDate={
              model.lastSeen === null ? null : plainDate(model.lastSeen.createdAt, i18n.language)
            }
            relations={model.relations}
            opening={model.opening}
            hasChildren={model.cardHasChildren}
            collapsed={model.cardCollapsed}
            onJump={model.setSelectedId}
            onMainAction={() => void model.mainActionFor(cardNode)}
            onToggleCollapse={() => model.toggleCollapse(cardNode.id)}
            onGoToOrigin={model.canGoToOrigin ? () => void goToKingdomOrigin(cardNode.id) : null}
          />
        )}
        {/* Same mirror as the island level (Leo 2026-08-31 #6): the selected concept and
            everything under it, heatmap + trend curves. */}
        {cardNode !== null && (
          <RegionMirror
            title={cardNode.label}
            memberCount={model.cardSubtreeIds.size}
            nodeIds={model.cardSubtreeIds}
            sources={feedbackSources}
          />
        )}
      </aside>
    </div>
  );
}
