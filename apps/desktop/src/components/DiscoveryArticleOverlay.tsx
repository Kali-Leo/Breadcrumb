/**
 * Purpose: full-screen overlay for one discovery card's article (spec 051 §2) — marks the
 * card opened once, streams its body on first open (lazily generated, cached forever after),
 * renders it through the same markdown pipeline chat messages use, and records dwell time
 * from open to close. Close via the header button or Esc (follows FocusOverlay's
 * defaultPrevented-respecting pattern).
 * Main exports: DiscoveryArticleOverlay.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef, useState } from "react";
import { useDiscoveryStore } from "../stores/discoveryStore";
import { MarkdownContent } from "./MarkdownContent";

interface DiscoveryArticleOverlayProps {
  card: DiscoveryCardRow;
  onClose(): void;
}

export function DiscoveryArticleOverlay({ card, onClose }: DiscoveryArticleOverlayProps) {
  const [bodyMd, setBodyMd] = useState<string | null>(card.body_md);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const openedAtRef = useRef<number>(Date.now());

  // Keyed on card.id only — this effect owns one card's open/stream/dwell lifecycle and must
  // run exactly once per card, not on every local state update it causes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reruns only when a different card opens
  useEffect(() => {
    openedAtRef.current = Date.now();
    void useDiscoveryStore.getState().openCard(card.id);
    if (card.body_md === null) {
      setStreamingText("");
      void useDiscoveryStore
        .getState()
        .streamArticle(card.id, (delta) => setStreamingText((prev) => `${prev ?? ""}${delta}`))
        .then((result) => {
          setStreamingText(null);
          if (result.ok) setBodyMd(result.bodyMd);
          else setErrorText(result.reason);
        });
    }
    return () => {
      const dwellMs = Date.now() - openedAtRef.current;
      void useDiscoveryStore.getState().recordDwell(card.id, card.topic_label, dwellMs);
    };
  }, [card.id]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-stone-50">
      <div className="flex shrink-0 items-center justify-between border-stone-200 border-b px-6 py-3">
        <span className="font-semibold text-stone-800">{card.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
        >
          关闭
        </button>
      </div>
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-6">
        {bodyMd !== null && <MarkdownContent source={bodyMd} />}
        {bodyMd === null && streamingText !== null && (
          <MarkdownContent source={streamingText.length > 0 ? streamingText : "…"} />
        )}
        {errorText !== null && (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-center text-sm text-stone-600">
            {errorText}
          </p>
        )}
      </div>
    </div>
  );
}
