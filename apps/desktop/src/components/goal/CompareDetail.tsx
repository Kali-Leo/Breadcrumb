/**
 * Purpose: the comparison tree's detail panel (spec 023/026/029; re-homed and de-scored by
 * spec 047) — pure experience leaves carry a done checkbox and an AI helper entry (the 0-10
 * self-score strip was retired per Leo's ruling: no score concept on screen; the binary
 * done still writes through the same practice-score machinery internally); hub leaves
 * (entities) are unscored with a 线索 line and on-demand decomposition; knowledge leaves
 * show their match and evidence; branch nodes report what still awaits a closer look. Also
 * hosts the experimental build form.
 * Main exports: CompareNodeDetail, ExperimentalBuildForm.
 */
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { useState } from "react";
import { useCompareStore } from "../../stores/compareStore";
import { useSettingsStore } from "../../stores/settingsStore";

function ClueLine({ node }: { node: OverlapNode }) {
  if (node.match === null) return null;
  return <p className="text-stone-400">线索：你的地图里有「{node.match.nodeLabel}」</p>;
}

function ExperienceDetail({ node }: { node: OverlapNode }) {
  const scoreByItemId = useCompareStore((state) => state.scoreByItemId);
  const setPracticeScore = useCompareStore((state) => state.setPracticeScore);
  const discussPractice = useCompareStore((state) => state.discussPractice);
  const score = scoreByItemId.get(node.key) ?? null;
  const done = score === 10;
  return (
    <div className="space-y-1.5">
      <p className="text-stone-600">{node.sourceRef}</p>
      <button
        type="button"
        onClick={() => void setPracticeScore(node.key, done ? 0 : 10)}
        className={`rounded px-2 py-0.5 transition-colors ${
          done ? "bg-amber-500 text-white" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
        }`}
      >
        {done ? "✓ 已完成" : "勾选为完成"}
      </button>
      <ClueLine node={node} />
      <button
        type="button"
        onClick={() => void discussPractice(node)}
        className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
      >
        想深入的话，和 AI 聊聊这里
      </button>
    </div>
  );
}

function HubDetail({ node }: { node: OverlapNode }) {
  const buildEnabled = useSettingsStore((state) => state.featureSwitches.compareProfileBuild);
  const decomposingHub = useCompareStore((state) => state.decomposingHub);
  const decomposeHub = useCompareStore((state) => state.decomposeHub);
  return (
    <div className="space-y-1.5">
      <p className="text-stone-500">这是一整片领域，先细分成具体知识点，才看得清重合</p>
      <ClueLine node={node} />
      <p className="text-stone-400">佐证：{node.sourceRef}</p>
      {buildEnabled ? (
        <button
          type="button"
          disabled={decomposingHub}
          onClick={() => void decomposeHub(node)}
          className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
        >
          {decomposingHub ? "正在细分…" : "细分这片领域（会逐条核对资料来源）"}
        </button>
      ) : (
        <p className="text-stone-400">想细分它？去设置里开启「对比画像构建（实验功能）」</p>
      )}
    </div>
  );
}

function countStubs(node: OverlapNode): number {
  if (node.isLeaf) return node.kind === "hub" || node.kind === "tool" ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countStubs(child), 0);
}

export function CompareNodeDetail({ node }: { node: OverlapNode }) {
  const stubCount = node.isLeaf ? 0 : countStubs(node);
  return (
    <div className="space-y-1 rounded border border-stone-200 bg-stone-50 px-2 py-1.5">
      <p className="font-medium text-stone-700">
        {node.label}
        {node.isLeaf && (node.kind === "hub" || node.kind === "tool") ? (
          <span className="ml-2 text-stone-400">待细分</span>
        ) : (
          <span className="ml-2 text-stone-400">
            重合{" "}
            {Number.isInteger(node.matchedLeafCount)
              ? node.matchedLeafCount
              : node.matchedLeafCount.toFixed(1)}
            /{node.leafCount}
          </span>
        )}
      </p>
      {node.isLeaf && node.kind === "practice" ? (
        <ExperienceDetail node={node} />
      ) : node.isLeaf && (node.kind === "hub" || node.kind === "tool") ? (
        <HubDetail node={node} />
      ) : (
        <>
          {node.isLeaf &&
            (node.match !== null ? (
              node.match.via === "semantic" ? (
                <p className="text-stone-500">
                  对应你学过的「{node.match.nodeLabel}」：{node.match.matchedText}
                </p>
              ) : (
                <p className="text-stone-500">
                  对上了你的「{node.match.nodeLabel}」
                  {node.match.via === "alias" && `（经由资料里的「${node.match.matchedText}」）`}
                </p>
              )
            ) : (
              <p className="text-stone-400">还没对上你的知识点</p>
            ))}
          {stubCount > 0 && (
            <p className="text-stone-400">还有 {stubCount} 片领域可以细分——点开对应节点即可</p>
          )}
          <p className="text-stone-400">佐证：{node.sourceRef}</p>
        </>
      )}
    </div>
  );
}

export function ExperimentalBuildForm() {
  const buildEnabled = useSettingsStore((state) => state.featureSwitches.compareProfileBuild);
  const building = useCompareStore((state) => state.building);
  const buildNote = useCompareStore((state) => state.buildNote);
  const buildFromTopic = useCompareStore((state) => state.buildFromTopic);
  const [topic, setTopic] = useState("");

  if (!buildEnabled) {
    return (
      <p className="text-stone-400">
        想对比职业名录之外的对象？去设置里开启「对比画像构建（实验功能）」
      </p>
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
          placeholder="职业名录之外的自由主题"
          className="flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
        />
        <button
          type="button"
          disabled={building || topic.trim().length === 0}
          onClick={() => void buildFromTopic(topic.trim())}
          className="rounded bg-amber-500 px-2 py-1 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          检索构建
        </button>
      </div>
      <p className="text-stone-400">构建要逐条核对资料来源，预计需要几分钟</p>
      {buildNote !== null && <p className="text-stone-500">{buildNote}</p>}
    </div>
  );
}
