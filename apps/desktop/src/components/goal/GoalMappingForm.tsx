/**
 * Purpose: goal-mapping form (spec 047; ex lab) — types a free-text goal, calls the
 * goal-mapping LLM, and persists the full result (all existing + all suggested nodes)
 * immediately. No checkbox calibration step: a learner who hasn't studied the material
 * can't judge what belongs, so domain judgment stays the system's job (spec 012 §2).
 * Main exports: GoalMappingForm.
 */
import { useState } from "react";
import { usePlannerStore } from "../../stores/plannerStore";

const inputClass =
  "flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400";
const buttonClass =
  "rounded bg-amber-500 px-2 py-1 text-xs text-white transition-colors hover:bg-amber-600";

interface GoalMappingFormProps {
  goalText: string;
  onGoalTextChange(text: string): void;
}

export function GoalMappingForm({ goalText, onGoalTextChange }: GoalMappingFormProps) {
  const mapGoalText = usePlannerStore((state) => state.mapGoalText);
  const createGoal = usePlannerStore((state) => state.createGoal);

  const [hint, setHint] = useState("");

  async function runMapping() {
    const trimmedTitle = goalText.trim();
    if (trimmedTitle.length === 0) return;
    setHint("拆解中…");
    const mapping = await mapGoalText(trimmedTitle);
    if (mapping === null) {
      setHint("这次没能拆解,稍后再试。若一直如此,可以去设置看看 AI 服务是否配置好了。");
      return;
    }
    await createGoal(trimmedTitle, mapping);
    const total = mapping.existing.length + mapping.suggested.length;
    setHint(`已按目标自动圈定 ${total} 个知识点（其中 ${mapping.suggested.length} 个是新方向）`);
    onGoalTextChange("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <input
          value={goalText}
          onChange={(event) => onGoalTextChange(event.target.value)}
          placeholder="比如：通过考研数学"
          className={inputClass}
        />
        <button type="button" onClick={() => void runMapping()} className={buttonClass}>
          拆解目标
        </button>
      </div>
      {hint !== "" && <p className="text-stone-400">{hint}</p>}
    </div>
  );
}
