/**
 * Purpose: the rail's card for the island the learner is inside — shown at the island level
 * while no kingdom is under the pointer, where the rail used to stand empty. It names the
 * place the map is currently framing (the rail shows what the map points at, and inside an
 * island the map points at that island) and carries the rename action, which needs a
 * resting place the pointer can reach: hover cards vanish as the pointer crosses the sea.
 * Main exports: CurrentIslandCard.
 */
import type { IslandModel } from "@breadcrumb/feature-map";
import { useTranslation } from "react-i18next";
import { placeKeyOf } from "../../lib/map/placeNames";
import { PlaceNameEditor } from "./PlaceNameEditor";

export function CurrentIslandCard({ island }: { island: IslandModel }) {
  const { t } = useTranslation("palace");
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-xs text-stone-400">{t("map.kindIsland")}</p>
      <div className="mt-0.5">
        <PlaceNameEditor
          key={island.nodeId}
          nodeId={placeKeyOf(island.nodeId)}
          name={island.label}
          nameClassName="text-base font-semibold text-stone-700"
        />
      </div>
      <p className="mt-1 text-sm text-stone-500">
        {t("map.memberCount", { count: island.memberNodeIds.length })}
      </p>
    </div>
  );
}
