/**
 * Purpose: the 🧪 lab view (spec 012) — a temporary, deliberately unpolished full-page
 * surface for validating the planner: node value table, frontier recommendations, a
 * self-report entry point, and the goal/route comparison. It is the debug-grade face of
 * the same engine the memory palace will eventually wear; sits beside it in the sidebar.
 * Main exports: LabPanel.
 */
import { useEffect, useState } from "react";
import { useInterestStore } from "../stores/interestStore";
import { useLabUiStore } from "../stores/labUiStore";
import { usePlannerStore } from "../stores/plannerStore";
import { useSettingsStore } from "../stores/settingsStore";
import { LabFailuresSection } from "./LabFailuresSection";
import { LabFrontierList } from "./LabFrontierList";
import { LabGoalSection } from "./LabGoalSection";
import { LabLadderSection } from "./LabLadderSection";
import { LabModeToggle } from "./LabModeToggle";
import { LabNodeTable } from "./LabNodeTable";
import { GoalOverlayView } from "./overlay/GoalOverlayView";

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
  const overlayOpen = useLabUiStore((state) => state.overlayOpen);

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

  if (overlayOpen) {
    return <GoalOverlayView />;
  }

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 text-xs">
        <p className="text-[11px] text-stone-400">
          🧪
          实验室是知识网络引擎的临时调试界面，数据和交互都是原始形态；它验证过的能力最终会长进记忆宫殿里。
        </p>
        <LabModeToggle />
        <LabNodeTable />
        <LabFrontierList />
        <SelfReportInput />
        <LabGoalSection />
        <LabLadderSection />
        <LabFailuresSection />
      </div>
    </div>
  );
}
