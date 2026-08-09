/**
 * Purpose: lab-panel "对比树" section (spec 023) — pick an evidence-backed real-world
 * profile, read the overlap tree (roots first, click to expand), inspect any node's
 * source and match details, and (behind its own switch) run the experimental search-build
 * with its plain time warning and token-cost line. Standalone module, mode-independent.
 * Main exports: LabCompareSection.
 */
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { useEffect, useState } from "react";
import { useCompareStore } from "../stores/compareStore";
import { useSettingsStore } from "../stores/settingsStore";
import { CompareTreeView } from "./CompareTreeView";

function findNode(roots: readonly OverlapNode[], key: string): OverlapNode | null {
  for (const root of roots) {
    if (root.key === key) return root;
    const found = findNode(root.children, key);
    if (found !== null) return found;
  }
  return null;
}

function NodeDetail({ node }: { node: OverlapNode }) {
  return (
    <div className="space-y-1 rounded border border-stone-200 bg-stone-50 px-2 py-1.5">
      <p className="font-medium text-stone-700">
        {node.label}
        <span className="ml-2 text-stone-400">
          重合 {node.matchedLeafCount}/{node.leafCount}
        </span>
      </p>
      {node.isLeaf &&
        (node.match !== null ? (
          <p className="text-stone-500">
            对上了你的「{node.match.nodeLabel}」
            {node.match.via === "alias" && `（经由资料里的「${node.match.matchedText}」）`}
          </p>
        ) : (
          <p className="text-stone-400">还没对上你的知识点</p>
        ))}
      <p className="text-stone-400">佐证：{node.sourceRef}</p>
    </div>
  );
}

function ExperimentalBuildForm() {
  const buildEnabled = useSettingsStore((state) => state.featureSwitches.compareProfileBuild);
  const building = useCompareStore((state) => state.building);
  const buildNote = useCompareStore((state) => state.buildNote);
  const buildFromTopic = useCompareStore((state) => state.buildFromTopic);
  const [topic, setTopic] = useState("");

  if (!buildEnabled) {
    return (
      <p className="text-stone-400">想对比别的对象？去设置里开启「对比画像构建（实验功能）」</p>
    );
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500">
          实验功能
        </span>
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="比如：数据分析师"
          className="flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
        />
        <button
          type="button"
          disabled={building || topic.trim().length === 0}
          onClick={() => void buildFromTopic(topic.trim())}
          className="rounded bg-amber-500 px-2 py-1 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {building ? "构建中…" : "检索构建"}
        </button>
      </div>
      <p className="text-stone-400">构建要逐条核验资料来源，预计需要几分钟</p>
      {buildNote !== null && <p className="text-stone-500">{buildNote}</p>}
    </div>
  );
}

export function LabCompareSection() {
  const labPanelEnabled = useSettingsStore((state) => state.featureSwitches.labPanel);
  const profiles = useCompareStore((state) => state.profiles);
  const selectedProfileId = useCompareStore((state) => state.selectedProfileId);
  const tree = useCompareStore((state) => state.tree);
  const expandedKeys = useCompareStore((state) => state.expandedKeys);
  const detailKey = useCompareStore((state) => state.detailKey);
  const loading = useCompareStore((state) => state.loading);
  const load = useCompareStore((state) => state.load);
  const selectProfile = useCompareStore((state) => state.selectProfile);
  const toggleExpanded = useCompareStore((state) => state.toggleExpanded);
  const selectDetail = useCompareStore((state) => state.selectDetail);

  useEffect(() => {
    if (labPanelEnabled) void load();
  }, [labPanelEnabled, load]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const detailNode = tree !== null && detailKey !== null ? findNode([tree], detailKey) : null;

  return (
    <details className="rounded border border-stone-200" open>
      <summary className="cursor-pointer px-2 py-1 font-semibold text-stone-600">对比树</summary>
      <div className="space-y-2 border-t border-stone-100 px-2 py-1.5">
        {profiles.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profiles.map((profile) => (
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
        {detailNode !== null && <NodeDetail node={detailNode} />}
        {selectedProfile !== null && (
          <p className="text-[11px] text-stone-400">资料出处：{selectedProfile.source_note}</p>
        )}
        <ExperimentalBuildForm />
      </div>
    </details>
  );
}
