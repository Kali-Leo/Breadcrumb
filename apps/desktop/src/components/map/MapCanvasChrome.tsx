/**
 * Purpose: the DOM layered over the map canvas — the 休闲/目标 mode switch at the top-left,
 * the operation hints in the bottom-left corner of the parchment (owner fix 5: on the map
 * itself, never a rail resident), and on a finger-driven screen the always-visible back
 * button once inside an island, since without a mouse wheel there is otherwise no way out
 * (touch-audit 1.3). Hints follow the hand: wheel words for a pointer, tap/pinch words for
 * a finger. With a pointer this renders exactly what it did before the touch work.
 * Main exports: MapCanvasChrome.
 */
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MapLevel } from "./levels";
import { MapModeToggle } from "./MapModeToggle";

interface MapCanvasChromeProps {
  level: MapLevel;
  coarse: boolean;
  onBack(): void;
}

export function MapCanvasChrome({ level, coarse, onBack }: MapCanvasChromeProps) {
  const { t } = useTranslation("palace");
  return (
    <>
      <div
        className={
          coarse
            ? "absolute start-3 top-3 z-10 flex items-center gap-2"
            : "absolute start-3 top-3 z-10"
        }
      >
        {coarse && level.kind === "island" && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("map.backButton")}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white/90 text-stone-600 shadow-sm"
          >
            <ArrowLeft size={22} strokeWidth={1.8} className="rtl:rotate-180" />
          </button>
        )}
        <MapModeToggle />
      </div>
      <div className="pointer-events-none absolute bottom-3 start-3 z-10 rounded bg-stone-100/60 px-2 py-1 text-[11px] leading-4 text-stone-600/75">
        {coarse ? (
          <>
            <p>{t("map.tapHint")}</p>
            <p>{t("map.pinchHint")}</p>
          </>
        ) : (
          <>
            <p>{t("map.zoomInHint")}</p>
            <p>{t("map.zoomOutHint")}</p>
            <p>{t("map.clickNameHint")}</p>
          </>
        )}
      </div>
    </>
  );
}
