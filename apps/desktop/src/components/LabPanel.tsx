/**
 * Purpose: the 🧪 lab view — the remaining experimental surfaces awaiting their palace
 * homes (specs 046/047): frontier recommendations, self-report, the goal section, and the
 * comparison tree. Spec 045 retired the mode toggle, node table, teach section, failures
 * list, and the ghost-overlay comparison graph.
 * Main exports: LabPanel.
 */
import { useEffect, useState } from "react";
import { useInterestStore } from "../stores/interestStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { LabCompareSection } from "./LabCompareSection";
import { LabFrontierList } from "./LabFrontierList";
import { LabGoalSection } from "./LabGoalSection";

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
    if (labPanelEnabled) {
      usePlannerStore
        .getState()
        .recompute()
        .catch((error: unknown) => console.warn("planner recompute skipped:", error));
    }
  }, [labPanelEnabled]);

  if (!labPanelEnabled) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-50">
        <p className="text-center text-sm leading-relaxed text-stone-400">
          🧪 实验室面板还没打开
          <br />
          去设置里开启「实验室面板」开关即可使用
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 text-xs">
        <LabFrontierList />
        <SelfReportInput />
        <LabGoalSection />
        <LabCompareSection />
      </div>
    </div>
  );
}
