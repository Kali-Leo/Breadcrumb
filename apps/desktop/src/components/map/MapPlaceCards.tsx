/**
 * Purpose: the rail's plain cards for a pointed-at place when the mirror modules are off —
 * name and residents for an island or kingdom, a single line for an islet (one node with
 * nothing around it, never a region readout).
 * Main exports: IsletCard, PlaceCards.
 */
import { useTranslation } from "react-i18next";
import type { HoverInfo } from "./mapHover";

const KIND_KEYS = {
  island: "map.kindIsland",
  islet: "map.kindIsland",
  kingdom: "map.kindKingdom",
} as const;

export function IsletCard({ hover }: { hover: HoverInfo }) {
  const { t } = useTranslation("palace");
  return (
    <div className="rounded-xl bg-white p-3 shadow-sm">
      <p className="text-sm text-stone-600">{t("map.unnamedIsle", { label: hover.label })}</p>
      <p className="mt-1.5 text-xs leading-5 text-stone-400">{t("map.unnamedIsleHint")}</p>
    </div>
  );
}

export function PlaceCards({ hover }: { hover: HoverInfo }) {
  const { t } = useTranslation("palace");
  return (
    <>
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="text-xs text-stone-400">{t(KIND_KEYS[hover.kind])}</p>
        <p className="mt-0.5 text-base font-semibold text-stone-700">{hover.label}</p>
        <p className="mt-1 text-sm text-stone-500">
          {t("map.memberCount", { count: hover.memberCount })}
        </p>
      </div>
      <div className="rounded-xl bg-white p-3 shadow-sm">
        <p className="mb-1.5 text-xs font-medium text-stone-600">{t("map.livesHere")}</p>
        <div className="flex flex-wrap gap-1.5">
          {hover.pointLabels.slice(0, 12).map((label) => (
            <span
              key={label}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
            >
              {label}
            </span>
          ))}
          {hover.pointLabels.length > 12 && (
            <span className="px-1 text-xs text-stone-400">
              {t("map.andMore", { count: hover.pointLabels.length - 12 })}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
