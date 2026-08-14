/**
 * Purpose: renders one conversation's ExplorationAtlas as symbol-annotated structured text
 * (spec 039 §2.4) — first-cut presentation, judged solely by logical clarity, no graphics.
 * Main exports: AtlasView.
 */
import { type ExplorationAtlas, renderAtlasText } from "@breadcrumb/plugin-explore";
import { useEffect, useState } from "react";
import { loadAtlas } from "../lib/atlasData";

const EMPTY_ATLAS: ExplorationAtlas = {
  trail: [],
  structure: [],
  detours: [],
  unusedLinks: [],
  frontier: [],
  staleness: [],
};

interface AtlasViewProps {
  conversationId: string;
  onBack: () => void;
}

export function AtlasView({ conversationId, onBack }: AtlasViewProps) {
  const [atlas, setAtlas] = useState<ExplorationAtlas | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadAtlas(conversationId).then((result) => {
      if (cancelled) return;
      setAtlas(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const text = renderAtlasText(atlas ?? EMPTY_ATLAS);

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={onBack}
        className="border-b border-stone-100 px-3 py-2 text-left text-xs text-stone-500 hover:bg-stone-50"
      >
        ← 回到探索
      </button>
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <p className="px-1 py-6 text-center text-xs text-stone-400">整理中…</p>
        ) : (
          <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-stone-700">
            {text}
          </div>
        )}
      </div>
      <p className="border-t border-stone-100 px-3 py-2 text-[11px] leading-relaxed text-stone-400">
        每一行都来自你的真实足迹与知识关系记录。
      </p>
    </div>
  );
}
