/**
 * Purpose: the reading pane for an external page (spec 053 §7) — asks lib/articleReading for the
 * article's text, which is the text already kept for this card or, the first time, a live
 * extraction that is then kept, and renders it through the same Markdown component chat messages
 * use. While it loads, the feed's quiet skeleton stands in. When the page cannot be read here,
 * one plain line, with the header's 在浏览器打开 as the way onward. The marker after the last
 * line records that the item was read through.
 * Main exports: DiscoveryArticleBody.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { type CardArticle, readCardArticle } from "../lib/articleReading";
import { useSettingsStore } from "../stores/settingsStore";
import { DiscoveryFinishSentinel } from "./DiscoveryFinishSentinel";
import { DiscoveryReaderFallback } from "./DiscoveryReaderFallback";
import { MarkdownContent } from "./MarkdownContent";

const UNREADABLE_LINE = "这篇文章没能在这里显示。";
const OFFLINE_LINE = "打开这篇文章需要联网。";

type LoadState = { phase: "loading" } | { phase: "done"; article: CardArticle };

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
  // Read so that flipping the network switch re-runs this: a card whose text is already kept
  // reads the same either way, and one whose text is not now has a reason to try.
  const networkEnabled = useSettingsStore((settings) => settings.networkEnabled);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on what changes the answer
  useEffect(() => {
    let current = true;
    setState({ phase: "loading" });
    void readCardArticle(card).then((article) => {
      if (current) setState({ phase: "done", article });
    });
    return () => {
      current = false;
    };
  }, [card.id, card.body_md, networkEnabled]);

  if (state.phase === "loading") return <ArticleSkeleton />;
  if (state.article.kind === "unreadable") {
    return (
      <DiscoveryReaderFallback line={state.article.offline ? OFFLINE_LINE : UNREADABLE_LINE} />
    );
  }

  return (
    <>
      <MarkdownContent source={state.article.markdown} />
      <DiscoveryFinishSentinel card={card} />
    </>
  );
}
