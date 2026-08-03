/**
 * Purpose: lab-panel collapsed section listing existing-node pairs the embedding-similarity
 * scan suspects are the same concept under different labels (spec 015 T4) — read-only, no
 * merge action; historical duplicate nodes carry real mastery/edge history so merging stays
 * a manual, future action (see specs/backlog.md).
 * Main exports: LabSynonymSuspectsSection.
 */
import {
  findSuspectSynonymPairs,
  type SuspectSynonymPair,
  SYNONYM_SIMILARITY_THRESHOLD,
} from "@breadcrumb/plugin-knowledge-tree";
import { useEffect, useState } from "react";
import { getRepos } from "../lib/db";

export function LabSynonymSuspectsSection() {
  const [pairs, setPairs] = useState<SuspectSynonymPair[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const repos = await getRepos();
        const [nodes, embeddings, aliases] = await Promise.all([
          repos.knowledgeNodes.listAll(),
          repos.nodeEmbeddings.listAll(),
          repos.nodeAliases.listAll(),
        ]);
        const aliasNodeIdByLabel = new Map(
          aliases.map((alias) => [alias.alias_label, alias.node_id]),
        );
        const suspects = findSuspectSynonymPairs(
          nodes,
          embeddings,
          aliasNodeIdByLabel,
          SYNONYM_SIMILARITY_THRESHOLD,
        );
        if (!cancelled) setPairs(suspects);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <details className="rounded border border-stone-200">
      <summary className="cursor-pointer px-2 py-1 font-semibold text-stone-600">
        疑似同义节点对
      </summary>
      <div className="border-t border-stone-100 px-2 py-1">
        <p className="mb-1 text-stone-400">
          只读展示，不做自动合并——存量节点可能已有掌握度/关系历史
        </p>
        {!loaded ? (
          <p className="text-stone-400">加载中…</p>
        ) : pairs.length === 0 ? (
          <p className="text-stone-400">暂时没有发现疑似同义的节点对</p>
        ) : (
          <ul className="space-y-1">
            {pairs.map((pair) => (
              <li key={`${pair.nodeAId}-${pair.nodeBId}`} className="text-stone-500">
                <span className="text-stone-400">{Math.round(pair.similarity * 100)}%</span>{" "}
                <span className="font-medium">{pair.nodeALabel}</span>
                <span className="text-stone-400"> ↔ </span>
                <span className="font-medium">{pair.nodeBLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
