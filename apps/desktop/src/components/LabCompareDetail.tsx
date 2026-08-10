/**
 * Purpose: the comparison tree's detail panel (spec 023/026) — knowledge/tool leaves show
 * their match and evidence; practice leaves show the verbatim task text with the learner's
 * tri-state self-attestation (做过/部分/还没 — never AI-verified) and the entry into the
 * saved-but-sidebar-hidden practice discussion. Also hosts the experimental build form.
 * Main exports: CompareNodeDetail, ExperimentalBuildForm.
 */
import type { PracticeStatus } from "@breadcrumb/core-db";
import type { OverlapNode } from "@breadcrumb/plugin-compare";
import { useState } from "react";
import { useCompareStore } from "../stores/compareStore";
import { useSettingsStore } from "../stores/settingsStore";

const PRACTICE_CHOICES: { status: PracticeStatus; label: string }[] = [
  { status: "done", label: "做过" },
  { status: "partial", label: "部分做过" },
  { status: "not_yet", label: "还没做过" },
];

function PracticeDetail({ node }: { node: OverlapNode }) {
  const attestationByItemId = useCompareStore((state) => state.attestationByItemId);
  const setPracticeStatus = useCompareStore((state) => state.setPracticeStatus);
  const discussPractice = useCompareStore((state) => state.discussPractice);
  const current = attestationByItemId.get(node.key) ?? "not_yet";
  return (
    <div className="space-y-1.5">
      <p className="text-stone-600">{node.sourceRef}</p>
      <div className="flex items-center gap-1">
        {PRACTICE_CHOICES.map((choice) => (
          <button
            key={choice.status}
            type="button"
            onClick={() => void setPracticeStatus(node.key, choice.status)}
            className={`rounded px-2 py-0.5 transition-colors ${
              current === choice.status
                ? "bg-amber-500 text-white"
                : "bg-stone-100 text-stone-500 hover:bg-stone-200"
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {current !== "done" && (
        <button
          type="button"
          onClick={() => void discussPractice(node)}
          className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
        >
          和 AI 探讨怎么完成
        </button>
      )}
    </div>
  );
}

export function CompareNodeDetail({ node }: { node: OverlapNode }) {
  return (
    <div className="space-y-1 rounded border border-stone-200 bg-stone-50 px-2 py-1.5">
      <p className="font-medium text-stone-700">
        {node.label}
        <span className="ml-2 text-stone-400">
          重合{" "}
          {Number.isInteger(node.matchedLeafCount)
            ? node.matchedLeafCount
            : node.matchedLeafCount.toFixed(1)}
          /{node.leafCount}
        </span>
      </p>
      {node.isLeaf && node.kind === "practice" ? (
        <PracticeDetail node={node} />
      ) : (
        <>
          {node.isLeaf &&
            (node.match !== null ? (
              node.match.via === "semantic" ? (
                <p className="text-stone-500">
                  语义对齐到你的「{node.match.nodeLabel}」：{node.match.matchedText}
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
      <p className="text-stone-400">构建要逐条核验资料来源，预计需要几分钟</p>
      {buildNote !== null && <p className="text-stone-500">{buildNote}</p>}
    </div>
  );
}
