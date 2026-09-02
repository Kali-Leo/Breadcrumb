/**
 * Purpose: 一键生成目标 inside the comparison section (spec 025) — the button, its plain
 * confirm copy (generating a goal rewrites what the palace points at, so it asks first),
 * and the note the store leaves behind.
 * Main exports: GoalFromProfile.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCompareStore } from "../../stores/compareStore";

export function GoalFromProfile() {
  const { t } = useTranslation("palace");
  const generatingGoal = useCompareStore((state) => state.generatingGoal);
  const goalNote = useCompareStore((state) => state.goalNote);
  const generateGoalFromProfile = useCompareStore((state) => state.generateGoalFromProfile);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-1">
      {confirming ? (
        <div className="space-y-1 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
          <p className="text-stone-600">{t("compare.goalNote")}</p>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={generatingGoal}
              onClick={() => {
                setConfirming(false);
                void generateGoalFromProfile();
              }}
              className="rounded bg-amber-500 px-2 py-0.5 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
            >
              {t("compare.generate")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-stone-200 px-2 py-0.5 text-stone-500"
            >
              {t("compare.notNow")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={generatingGoal}
          onClick={() => setConfirming(true)}
          className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
        >
          {generatingGoal ? t("compare.generating") : t("compare.generateGoal")}
        </button>
      )}
      {goalNote !== null && <p className="text-stone-500">{goalNote}</p>}
    </div>
  );
}
