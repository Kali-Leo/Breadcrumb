/**
 * Purpose: goal-mapping form (spec 047; ex lab) — types a free-text goal, calls the
 * goal-mapping LLM, and persists the full result (all existing + all suggested nodes)
 * immediately. No checkbox calibration step: a learner who hasn't studied the material
 * can't judge what belongs, so domain judgment stays the system's job (spec 012 §2).
 * Main exports: GoalMappingForm.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePlannerStore } from "../../stores/plannerStore";

const inputClass =
  "flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400";
const buttonClass =
  "rounded bg-amber-500 px-2 py-1 text-xs text-white transition-colors hover:bg-amber-600 disabled:opacity-50";

interface GoalMappingFormProps {
  goalText: string;
  onGoalTextChange(text: string): void;
}

export function GoalMappingForm({ goalText, onGoalTextChange }: GoalMappingFormProps) {
  const { t } = useTranslation("palace");
  const mapGoalText = usePlannerStore((state) => state.mapGoalText);
  const createGoal = usePlannerStore((state) => state.createGoal);

  const [hint, setHint] = useState("");
  // Guards double-submit: the LLM call is slow enough that a second click used to create a
  // second goal and spend twice.
  const [busy, setBusy] = useState(false);

  async function runMapping() {
    const trimmedTitle = goalText.trim();
    if (trimmedTitle.length === 0 || busy) return;
    setBusy(true);
    setHint(t("goal.mappingWorking"));
    try {
      const mapping = await mapGoalText(trimmedTitle);
      if (mapping === null) {
        setHint(t("goal.mappingFailed"));
        return;
      }
      await createGoal(trimmedTitle, mapping);
      const total = mapping.existing.length + mapping.suggested.length;
      setHint(t("goal.mappingDone", { total, fresh: mapping.suggested.length }));
      onGoalTextChange("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input
          value={goalText}
          onChange={(event) => onGoalTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runMapping();
            }
          }}
          placeholder={t("goal.mappingPlaceholder")}
          className={inputClass}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runMapping()}
          className={buttonClass}
        >
          {t("goal.mappingSubmit")}
        </button>
      </div>
      {hint !== "" && <p className="text-stone-400">{hint}</p>}
    </div>
  );
}
