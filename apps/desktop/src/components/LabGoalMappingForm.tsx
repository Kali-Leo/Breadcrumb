/**
 * Purpose: lab-panel goal-mapping form — types a free-text goal, calls the goal-mapping LLM,
 * then lets the learner checkbox-calibrate which existing/suggested nodes actually belong to
 * the goal before anything is saved. Sibling of LabGoalSection to keep that file small.
 * Main exports: LabGoalMappingForm.
 */
import type { GoalMappingResult } from "@breadcrumb/plugin-planner";
import { useState } from "react";
import { usePlannerStore } from "../stores/plannerStore";

const inputClass =
  "flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400";
const buttonClass =
  "rounded bg-amber-500 px-2 py-1 text-xs text-white transition-colors hover:bg-amber-600";

interface LabGoalMappingFormProps {
  goalText: string;
  onGoalTextChange(text: string): void;
}

export function LabGoalMappingForm({ goalText, onGoalTextChange }: LabGoalMappingFormProps) {
  const mapGoalText = usePlannerStore((state) => state.mapGoalText);
  const createGoal = usePlannerStore((state) => state.createGoal);

  const [mapping, setMapping] = useState<GoalMappingResult | null>(null);
  const [checkedExisting, setCheckedExisting] = useState<Set<string>>(new Set());
  const [checkedSuggested, setCheckedSuggested] = useState<Set<number>>(new Set());
  const [hint, setHint] = useState("");

  async function runMapping() {
    if (goalText.trim().length === 0) return;
    setHint("拆解中…");
    const result = await mapGoalText(goalText.trim());
    if (result === null) {
      setHint("这次没能拆解——检查一下网络或 API 设置，或者稍后再试");
      return;
    }
    setHint("");
    setMapping(result);
    setCheckedExisting(new Set(result.existing));
    setCheckedSuggested(new Set(result.suggested.map((_, index) => index)));
  }

  async function confirmGoal() {
    if (mapping === null) return;
    const suggested = mapping.suggested.filter((_, index) => checkedSuggested.has(index));
    await createGoal(goalText.trim(), [...checkedExisting], suggested);
    setMapping(null);
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

      {mapping !== null && (
        <div className="space-y-1 rounded border border-stone-200 p-2">
          <p className="text-stone-500">勾选你想放进这个目标的知识点：</p>
          {mapping.existing.map((label) => (
            <label key={label} className="block">
              <input
                type="checkbox"
                checked={checkedExisting.has(label)}
                onChange={(event) => {
                  const next = new Set(checkedExisting);
                  if (event.target.checked) next.add(label);
                  else next.delete(label);
                  setCheckedExisting(next);
                }}
              />{" "}
              {label}
            </label>
          ))}
          {mapping.suggested.map((node, index) => (
            <label key={node.label} className="block text-amber-700">
              <input
                type="checkbox"
                checked={checkedSuggested.has(index)}
                onChange={(event) => {
                  const next = new Set(checkedSuggested);
                  if (event.target.checked) next.add(index);
                  else next.delete(index);
                  setCheckedSuggested(next);
                }}
              />{" "}
              {node.label}（新）— {node.summary}
            </label>
          ))}
          <button type="button" onClick={() => void confirmGoal()} className={buttonClass}>
            保存目标
          </button>
        </div>
      )}
    </div>
  );
}
