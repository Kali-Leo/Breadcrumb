/**
 * Purpose: the "对比树" section inside the goal view (spec 023/025/026; re-homed by spec
 * 047) — the 教材/真人 toggle (occupation default), occupation-directory input with
 * candidate confirmation (offline, instant), profile chips, the tree, the detail panel,
 * and 一键生成目标 with its plain confirm copy. This module only compares.
 * Main exports: CompareSection.
 */
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { useEffect, useState } from "react";
import { type OccupationHit, searchOccupations } from "../../lib/occupationActions";
import { useCompareStore } from "../../stores/compareStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { CompareTreeView } from "../CompareTreeView";
import { CompareNodeDetail, ExperimentalBuildForm } from "./CompareDetail";

function findNode(roots: readonly OverlapNode[], key: string): OverlapNode | null {
  for (const root of roots) {
    if (root.key === key) return root;
    const found = findNode(root.children, key);
    if (found !== null) return found;
  }
  return null;
}

function OccupationPicker() {
  const createOccupation = useCompareStore((state) => state.createOccupation);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<OccupationHit[]>([]);
  return (
    <div className="space-y-1">
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHits(searchOccupations(event.target.value));
        }}
        placeholder="输入职业，比如「前端工程师」"
        className="w-full rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
      />
      {hits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-stone-400">你是指：</span>
          {hits.map((hit) => (
            <button
              key={hit.code}
              type="button"
              onClick={() => {
                setQuery("");
                setHits([]);
                void createOccupation(hit.code);
              }}
              className="rounded border border-amber-300 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
            >
              {hit.title}（{hit.code}）{hit.matchedAlt !== null && ` · 又称 ${hit.matchedAlt}`}
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && hits.length === 0 && (
        <p className="text-stone-400">
          职业名录里没找到。换个说法试试，或在下方输入主题，让 AI 生成一份新的对照。
        </p>
      )}
    </div>
  );
}

function GoalFromProfile() {
  const generatingGoal = useCompareStore((state) => state.generatingGoal);
  const goalNote = useCompareStore((state) => state.goalNote);
  const generateGoalFromProfile = useCompareStore((state) => state.generateGoalFromProfile);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="space-y-1">
      {confirming ? (
        <div className="space-y-1 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
          <p className="text-stone-600">
            会按照你的特质与知识基础，转化成适合你的方案；之后随时可以回对比树查看重合比例。
          </p>
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
              生成
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded border border-stone-200 px-2 py-0.5 text-stone-500"
            >
              先不了
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
          {generatingGoal ? "生成中…" : "以此生成学习目标"}
        </button>
      )}
      {goalNote !== null && <p className="text-stone-500">{goalNote}</p>}
    </div>
  );
}

export function CompareSection() {
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
      <h3 className="font-semibold text-stone-600">对比树</h3>
      <p className="text-sm text-stone-500">
        把你学过的内容，和一个职业或一套教材需要的知识放在一起对比，看看已经重合了多少。
      </p>
      <div className="flex overflow-hidden rounded-full border border-stone-200 self-start w-fit">
        {(
          [
            ["occupation", "真实职业"],
            ["curriculum", "教材知识"],
          ] as const
        ).map(([category, label]) => (
          <button
            key={category}
            type="button"
            onClick={() => void setCompareCategory(category)}
            className={`px-3 py-0.5 transition-colors ${
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
              className={`rounded px-2 py-1 ${
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
        <ul className="space-y-1" aria-label="对比树加载中">
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
      {aligning && <p className="text-stone-400">正在对应你学过的内容…</p>}
      {detailNode !== null && <CompareNodeDetail node={detailNode} />}
      {selectedVisible && selectedProfile !== null && (
        <p className="text-[11px] text-stone-400">资料出处：{selectedProfile.source_note}</p>
      )}
      {selectedVisible && <GoalFromProfile />}
      <ExperimentalBuildForm />
    </section>
  );
}
