/**
 * Purpose: the "对比树" section inside the goal view (spec 023/025/026; re-homed by spec
 * 047) — the 教材/真人 toggle (occupation default), occupation-directory input with
 * candidate confirmation (offline, instant), profile chips, the tree, the detail panel,
 * and 一键生成目标 with its plain confirm copy. This module only compares.
 * Main exports: CompareSection.
 */
import type { OverlapNode } from "@breadcrumb/feature-compare";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompareStore } from "../../stores/compareStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { CompareNodeDetail, ExperimentalBuildForm } from "./CompareDetail";
import { CompareTreeView } from "./CompareTreeView";
import { GoalFromProfile } from "./GoalFromProfile";
import { OccupationPicker } from "./OccupationPicker";

function findNode(roots: readonly OverlapNode[], key: string): OverlapNode | null {
  for (const root of roots) {
    if (root.key === key) return root;
    const found = findNode(root.children, key);
    if (found !== null) return found;
  }
  return null;
}

export function CompareSection() {
  const { t } = useTranslation("palace");
  const compareCategory = useSettingsStore((state) => state.compareCategory);
  const setCompareCategory = useSettingsStore((state) => state.setCompareCategory);
  const profiles = useCompareStore((state) => state.profiles);
  const selectedProfileId = useCompareStore((state) => state.selectedProfileId);
  const tree = useCompareStore((state) => state.tree);
  const expandedKeys = useCompareStore((state) => state.expandedKeys);
  const detailKey = useCompareStore((state) => state.detailKey);
  const loading = useCompareStore((state) => state.loading);
  const aligning = useCompareStore((state) => state.aligning);
  const load = useCompareStore((state) => state.load);
  const selectProfile = useCompareStore((state) => state.selectProfile);
  const toggleExpanded = useCompareStore((state) => state.toggleExpanded);
  const selectDetail = useCompareStore((state) => state.selectDetail);

  useEffect(() => {
    void load();
  }, [load]);

  const shownProfiles = profiles.filter((profile) => profile.category === compareCategory);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedVisible = selectedProfile !== null && selectedProfile.category === compareCategory;
  const detailNode =
    selectedVisible && tree !== null && detailKey !== null ? findNode([tree], detailKey) : null;

  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-stone-600">{t("compare.title")}</h3>
      <p className="text-sm text-stone-500">{t("compare.intro")}</p>
      <div className="flex overflow-hidden rounded-full border border-stone-200 self-start w-fit">
        {(
          [
            ["occupation", t("compare.categoryOccupation")],
            ["curriculum", t("compare.categoryCurriculum")],
          ] as const
        ).map(([category, label]) => (
          <button
            key={category}
            type="button"
            onClick={() => void setCompareCategory(category)}
            className={`px-3 py-0.5 transition-colors coarse:inline-flex coarse:min-h-11 coarse:items-center ${
              compareCategory === category
                ? "bg-amber-500 text-white"
                : "bg-white text-stone-500 hover:bg-stone-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {compareCategory === "occupation" && <OccupationPicker />}
      {shownProfiles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {shownProfiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() => void selectProfile(profile.id)}
              // Built comparisons can carry a title as long as the sentence someone typed;
              // with a mouse the chip truncates and keeps the whole title in its tooltip. A
              // tooltip is unreachable with a finger, so on a touch screen the chip wraps and
              // shows the whole title rather than hiding half of it behind a gesture nobody
              // has.
              title={profile.title}
              className={`max-w-56 truncate rounded px-2 py-1 coarse:inline-flex coarse:min-h-11 coarse:max-w-full coarse:items-center coarse:whitespace-normal coarse:text-start ${
                profile.id === selectedProfileId
                  ? "bg-amber-100 text-stone-700"
                  : "bg-stone-100 text-stone-500"
              }`}
            >
              {profile.title}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <ul className="space-y-1" aria-label={t("compare.loadingAria")}>
          {[0, 1, 2].map((index) => (
            <li key={index} className="h-7 animate-pulse rounded bg-stone-100" />
          ))}
        </ul>
      ) : (
        selectedVisible &&
        tree !== null && (
          <CompareTreeView
            root={tree}
            expandedKeys={expandedKeys}
            detailKey={detailKey}
            onToggle={toggleExpanded}
            onSelectDetail={selectDetail}
          />
        )
      )}
      {aligning && <p className="text-stone-400">{t("compare.aligning")}</p>}
      {detailNode !== null && <CompareNodeDetail node={detailNode} />}
      {selectedVisible && selectedProfile !== null && (
        <p className="text-[11px] text-stone-400">
          {t("compare.sourceNote", { source: selectedProfile.source_note })}
        </p>
      )}
      {selectedVisible && <GoalFromProfile />}
      <ExperimentalBuildForm />
    </section>
  );
}
