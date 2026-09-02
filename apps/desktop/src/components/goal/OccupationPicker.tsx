/**
 * Purpose: the occupation-directory input inside the comparison section (spec 023) —
 * offline, instant candidate lookup with plain "你是指" confirmation; picking a candidate
 * builds that occupation's comparison profile.
 * Main exports: OccupationPicker.
 */
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type OccupationHit, searchOccupations } from "../../lib/compare/occupationActions";
import { useCompareStore } from "../../stores/compareStore";

export function OccupationPicker() {
  const { t } = useTranslation("palace");
  const createOccupation = useCompareStore((state) => state.createOccupation);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OccupationHit[]>([]);
  const latestQuery = useRef("");
  return (
    <div className="space-y-1">
      <input
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          latestQuery.current = next;
          // The directory loads on first keystroke; a slow load must not overwrite the hits
          // of a query the user has since typed past.
          void searchOccupations(next).then((found) => {
            setHits((current) => (latestQuery.current === next ? found : current));
          });
        }}
        placeholder={t("compare.searchPlaceholder")}
        className="w-full rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
      />
      {hits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-stone-400">{t("compare.didYouMean")}</span>
          {hits.map((hit) => (
            <button
              key={hit.code}
              type="button"
              onClick={() => {
                setQuery("");
                setHits([]);
                void createOccupation(hit.code);
              }}
              className="rounded border border-amber-300 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
            >
              {hit.title}（{hit.code}）
              {hit.matchedAlt !== null && ` · ${t("compare.alsoCalled", { name: hit.matchedAlt })}`}
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && hits.length === 0 && (
        <p className="text-stone-400">{t("compare.notFound")}</p>
      )}
    </div>
  );
}
