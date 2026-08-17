/**
 * Purpose: the reading pane for an external page (spec 053 §7) — fetches the page and keeps only
 * its text (lib/articleExtraction), then renders it through the same Markdown component chat
 * messages use. While it loads, the feed's quiet skeleton stands in. When the page cannot be read
 * here, one plain line and the browser. The marker after the last line records that the item was
 * read through.
 * Main exports: DiscoveryArticleBody.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { type ArticleExtraction, extractArticleAt } from "../lib/articleExtraction";
import { useSettingsStore } from "../stores/settingsStore";
import { DiscoveryFinishSentinel } from "./DiscoveryFinishSentinel";
import { DiscoveryReaderFallback } from "./DiscoveryReaderFallback";
import { MarkdownContent } from "./MarkdownContent";

const UNREADABLE_LINE = "这篇文章没能在这里显示。";
const OFFLINE_LINE = "打开这篇文章需要联网。";

type LoadState = { phase: "loading" } | { phase: "done"; result: ArticleExtraction };

function ArticleSkeleton() {
  return (
    <div className="space-y-3">
      {["a", "b", "c", "d", "e", "f"].map((key) => (
        <div key={key} className="h-4 animate-pulse rounded bg-stone-200/70 last:w-2/3" />
      ))}
    </div>
  );
}

export function DiscoveryArticleBody({ card }: { card: DiscoveryCardRow }) {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const networkEnabled = useSettingsStore((settings) => settings.networkEnabled);

  useEffect(() => {
    if (card.url === null || !networkEnabled) {
      setState({ phase: "done", result: { kind: "failed" } });
      return;
    }
    let current = true;
    setState({ phase: "loading" });
    void extractArticleAt(card.url).then((result) => {
      if (current) setState({ phase: "done", result });
    });
    return () => {
      current = false;
    };
  }, [card.url, networkEnabled]);

  if (state.phase === "loading") return <ArticleSkeleton />;
  if (state.result.kind === "failed") {
    return (
      <DiscoveryReaderFallback
        line={networkEnabled ? UNREADABLE_LINE : OFFLINE_LINE}
        url={card.url}
      />
    );
  }

  return (
    <>
      <MarkdownContent source={state.result.markdown} />
      <DiscoveryFinishSentinel card={card} />
    </>
  );
}
