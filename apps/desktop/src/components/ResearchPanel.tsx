/**
 * Purpose: the 🔬 research task platform full-page view (spec 036) — lists every locally
 * computed research result as a card; results stay visible and deletable even after the
 * feature switch is turned off (only new task execution stops).
 * Main exports: ResearchPanel.
 */
import { RESEARCH_COPY } from "@breadcrumb/plugin-research";
import { useEffect } from "react";
import { useResearchStore } from "../stores/researchStore";
import { useSettingsStore } from "../stores/settingsStore";
import { ResearchResultCard } from "./ResearchResultCard";

export function ResearchPanel() {
  const loaded = useResearchStore((state) => state.loaded);
  const results = useResearchStore((state) => state.results);
  const researchTasksEnabled = useSettingsStore((state) => state.featureSwitches.researchTasks);

  useEffect(() => {
    void useResearchStore.getState().load();
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 text-xs">
        <h2 className="text-sm font-semibold text-stone-700">{RESEARCH_COPY.panelTitle}</h2>
        <p className="text-[11px] text-stone-400">{RESEARCH_COPY.panelIntro}</p>
        {!researchTasksEnabled && (
          <p className="rounded border border-stone-200 bg-white p-2 text-stone-400">
            {RESEARCH_COPY.offNotice}
          </p>
        )}
        {!loaded ? (
          <p className="text-stone-400">{RESEARCH_COPY.loading}</p>
        ) : results.length === 0 ? (
          <div className="rounded border border-stone-200 bg-white p-3">
            <p className="text-stone-600">{RESEARCH_COPY.emptyTitle}</p>
            <p className="mt-1 text-stone-400">{RESEARCH_COPY.emptyHint}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((result) => (
              <ResearchResultCard key={result.id} result={result} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
