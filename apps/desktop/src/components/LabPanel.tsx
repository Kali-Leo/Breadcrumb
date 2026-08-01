/**
 * Purpose: experimental lab panel (spec 012, 🧪 tab) — a temporary, deliberately unpolished
 * surface for validating the planner: node value table, frontier recommendations, a
 * self-report entry point, and the goal/route comparison. Renders null unless the labPanel
 * feature switch is on.
 * Main exports: LabPanel.
 */
import { useEffect, useState } from "react";
import { useInterestStore } from "../stores/interestStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { LabFrontierList } from "./LabFrontierList";
import { LabGoalSection } from "./LabGoalSection";
import { LabNodeTable } from "./LabNodeTable";

function SelfReportInput() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (text.trim().length === 0) return;
    setSubmitting(true);
    try {
      await useInterestStore.getState().selfReportMastery(text.trim());
      await usePlannerStore.getState().recompute();
      setText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-1">
      <h3 className="font-semibold text-stone-600">自报你学过的内容</h3>
      <div className="flex gap-1">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="比如：我学过高中数学"
          className="flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
        />
        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="rounded bg-amber-500 px-2 py-1 text-xs text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {submitting ? "记录中…" : "记录"}
        </button>
      </div>
    </section>
  );
}

export function LabPanel() {
  const labPanelEnabled = useSettingsStore((state) => state.featureSwitches.labPanel);

  useEffect(() => {
    if (labPanelEnabled) void usePlannerStore.getState().recompute();
  }, [labPanelEnabled]);

  if (!labPanelEnabled) return null;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3 text-xs">
      <LabNodeTable />
      <LabFrontierList />
      <SelfReportInput />
      <LabGoalSection />
    </div>
  );
}
