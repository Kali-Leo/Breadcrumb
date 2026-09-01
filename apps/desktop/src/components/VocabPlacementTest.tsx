/**
 * Purpose: the two-minute vocabulary check (Leo 2026-09-01). Thirty words from the pack, four
 * possible meanings each, no timer and no score shown — its only job is to tell the weave
 * where to start introducing words, so an advanced learner is not walked through "water" and
 * "book" for a fortnight. Always skippable, and skipping is the same as starting at zero.
 * Main exports: VocabPlacementTest.
 */
import { buildVocabTest, type VocabTestItem } from "@breadcrumb/plugin-diglot-weave";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDiglotStore } from "../stores/diglotStore";

export function VocabPlacementTest({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(["learning", "common"]);
  const loaded = useDiglotStore((state) => state.loaded);
  const finishPlacementTest = useDiglotStore((state) => state.finishPlacementTest);
  const items = useMemo<VocabTestItem[]>(
    () => (loaded === null ? [] : buildVocabTest(loaded)),
    [loaded],
  );
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  if (items.length === 0) {
    onClose();
    return null;
  }

  const index = answers.length;
  const item = items[index];

  function answer(choice: number | null): void {
    const next = [...answers, choice];
    if (next.length === items.length) {
      void finishPlacementTest(items, next);
      onClose();
      return;
    }
    setAnswers(next);
  }

  if (item === undefined) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-stone-700">{t("learning:diglot.placementTitle")}</h4>
        <span className="text-xs text-stone-400">
          {t("learning:diglot.placementProgress", { done: index + 1, total: items.length })}
        </span>
      </div>
      <p className="text-[15px] text-stone-600">
        {t("learning:diglot.placementQuestion", { word: item.target })}
      </p>
      <div className="grid gap-2">
        {item.options.map((option, optionIndex) => (
          <button
            key={option}
            type="button"
            onClick={() => answer(optionIndex)}
            className="rounded-xl border border-stone-200 px-4 py-2 text-start text-stone-700 hover:border-amber-400"
          >
            {option}
          </button>
        ))}
        <button
          type="button"
          onClick={() => answer(null)}
          className="rounded-xl px-4 py-2 text-start text-sm text-stone-400 hover:text-stone-600"
        >
          {t("learning:diglot.placementDontKnow")}
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-stone-400 hover:text-stone-600"
      >
        {t("learning:diglot.placementSkip")}
      </button>
    </div>
  );
}
