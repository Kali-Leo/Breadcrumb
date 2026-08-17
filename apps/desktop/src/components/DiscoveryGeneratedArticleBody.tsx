/**
 * Purpose: the reading pane for the retired self-generated cards (spec 051 §2) still sitting in
 * older pools — streams the body on first open, caches it forever after, and renders it through
 * the same Markdown component chat messages use. External cards never come through here; this
 * path retires with the rest of the self-generated pipeline.
 * Main exports: DiscoveryGeneratedArticleBody.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useState } from "react";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { DiscoveryFinishSentinel } from "./DiscoveryFinishSentinel";
import { MarkdownContent } from "./MarkdownContent";

export function DiscoveryGeneratedArticleBody({ card }: { card: DiscoveryCardRow }) {
  const [bodyMd, setBodyMd] = useState<string | null>(card.body_md);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Keyed on card.id only — this effect owns one card's stream lifecycle and must run exactly
  // once per card, not on every local state update it causes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reruns only when a different card opens
  useEffect(() => {
    if (card.body_md !== null) return;
    setStreamingText("");
    void useDiscoveryStore
      .getState()
      .streamArticle(card.id, (delta) => setStreamingText((prev) => `${prev ?? ""}${delta}`))
      .then((result) => {
        setStreamingText(null);
        if (result.ok) setBodyMd(result.bodyMd);
        else setErrorText(result.reason);
      });
  }, [card.id]);

  return (
    <>
      {bodyMd !== null && <MarkdownContent source={bodyMd} />}
      {bodyMd === null && streamingText !== null && (
        <MarkdownContent source={streamingText.length > 0 ? streamingText : "…"} />
      )}
      {errorText !== null && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
          {errorText}
        </p>
      )}
      {bodyMd !== null && <DiscoveryFinishSentinel card={card} />}
    </>
  );
}
