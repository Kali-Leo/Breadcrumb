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
import { useTranslation } from "react-i18next";
import { useCompareStore } from "../../stores/compareStore";
import { useSettingsStore } from "../../stores/settingsStore";

function ClueLine({ node }: { node: OverlapNode }) {
  const { t } = useTranslation("palace");
  if (node.match === null) return null;
  return (
    <p className="text-stone-400">{t("compare.hintInMap", { label: node.match.nodeLabel })}</p>
  );
}

function ExperienceDetail({ node }: { node: OverlapNode }) {
  const { t } = useTranslation("palace");
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
        {done ? t("compare.markedDone") : t("compare.markDone")}
      </button>
      <ClueLine node={node} />
      <button
        type="button"
        onClick={() => void discussPractice(node)}
        className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50"
      >
        {t("compare.discuss")}
      </button>
    </div>
  );
}

function HubDetail({ node }: { node: OverlapNode }) {
  const { t } = useTranslation("palace");
  const buildEnabled = useSettingsStore((state) => state.featureSwitches.compareProfileBuild);
  const decomposingHub = useCompareStore((state) => state.decomposingHub);
  const decomposeHub = useCompareStore((state) => state.decomposeHub);
  return (
    <div className="space-y-1.5">
      <p className="text-stone-500">{t("compare.hubHint")}</p>
      <ClueLine node={node} />
      <p className="text-stone-400">{t("compare.evidence", { ref: node.sourceRef })}</p>
      {buildEnabled ? (
        <button
          type="button"
          disabled={decomposingHub}
          onClick={() => void decomposeHub(node)}
          className="rounded border border-amber-400 px-2 py-0.5 text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
        >
          {decomposingHub ? t("compare.decomposing") : t("compare.decompose")}
        </button>
      ) : (
        <p className="text-stone-400">{t("compare.enableExperiment")}</p>
      )}
    </div>
  );
}

function countStubs(node: OverlapNode): number {
  if (node.isLeaf) return node.kind === "hub" || node.kind === "tool" ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countStubs(child), 0);
}

export function CompareNodeDetail({ node }: { node: OverlapNode }) {
  const { t } = useTranslation("palace");
  const stubCount = node.isLeaf ? 0 : countStubs(node);
  return (
    <div className="space-y-1 rounded border border-stone-200 bg-stone-50 px-2 py-1.5">
      <p className="font-medium text-stone-700">
        {node.label}
        {node.isLeaf && (node.kind === "hub" || node.kind === "tool") ? (
          <span className="ms-2 text-stone-400">{t("compare.notDecomposed")}</span>
        ) : (
          <span className="ms-2 text-stone-400">
            {t("compare.overlap")}{" "}
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
                  {t("compare.matchedVia", {
                    label: node.match.nodeLabel,
                    text: node.match.matchedText,
                  })}
                </p>
              ) : (
                <p className="text-stone-500">
                  {t("compare.matched", { label: node.match.nodeLabel })}
                  {node.match.via === "alias" &&
                    t("compare.viaAlias", { text: node.match.matchedText })}
                </p>
              )
            ) : (
              <p className="text-stone-400">{t("compare.noMatch")}</p>
            ))}
          {stubCount > 0 && (
            <p className="text-stone-400">{t("compare.moreHubs", { count: stubCount })}</p>
          )}
          <p className="text-stone-400">{t("compare.evidence", { ref: node.sourceRef })}</p>
        </>
      )}
    </div>
  );
}

export function ExperimentalBuildForm() {
  const { t } = useTranslation("palace");
  const buildEnabled = useSettingsStore((state) => state.featureSwitches.compareProfileBuild);
  const building = useCompareStore((state) => state.building);
  const buildNote = useCompareStore((state) => state.buildNote);
  const buildFromTopic = useCompareStore((state) => state.buildFromTopic);
  const [topic, setTopic] = useState("");

  if (!buildEnabled) {
    return <p className="text-stone-400">{t("compare.customIntro")}</p>;
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <span className="rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500">
          {t("compare.experimental")}
        </span>
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder={t("compare.customPlaceholder")}
          className="flex-1 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
        />
        <button
          type="button"
          disabled={building || topic.trim().length === 0}
          onClick={() => void buildFromTopic(topic.trim())}
          className="rounded bg-amber-500 px-2 py-1 text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          {t("compare.generate")}
        </button>
      </div>
      <p className="text-stone-400">{t("compare.customNote")}</p>
      {buildNote !== null && <p className="text-stone-500">{buildNote}</p>}
    </div>
  );
}
