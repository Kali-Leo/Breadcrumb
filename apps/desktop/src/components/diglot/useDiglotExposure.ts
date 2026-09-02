/**
 * Purpose: the woven message's exposure signal (spec 033) — fires once per run per session
 * after the bubble stays ≥50% visible for about a second, one signal per patch. Deliberately
 * not persisted and not pruned; placement no longer trusts this guard, because a restart
 * replays exposures for old messages: the store re-checks the event log before any exposure
 * counts as first-encounter evidence (audit 2026-08-28 #2d).
 * Main exports: useDiglotExposure.
 */
import { wovenContextSentenceFor } from "@breadcrumb/core-text";
import type { ReplacementPatch } from "@breadcrumb/feature-diglot-weave";
import { type RefObject, useEffect } from "react";

/** Runs whose exposure signals already fired this session — a duplicate-event guard only. */
const exposedMessages = new Set<string>();

export function useDiglotExposure(input: {
  containerRef: RefObject<HTMLSpanElement | null>;
  exposureKey: string;
  messageId: string;
  content: string;
  patches: ReplacementPatch[];
  recordSignal: (
    lemma: string,
    kind: "exposure",
    messageId: string,
    context: string,
    latencyMs: null,
  ) => Promise<void>;
}): void {
  const { containerRef, exposureKey, messageId, content, patches, recordSignal } = input;
  useEffect(() => {
    const element = containerRef.current;
    if (element === null || exposedMessages.has(exposureKey)) return;
    let dwellTimer: number | null = null;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && dwellTimer === null) {
            dwellTimer = window.setTimeout(() => {
              if (exposedMessages.has(exposureKey)) return;
              exposedMessages.add(exposureKey);
              for (const patch of patches) {
                void recordSignal(
                  patch.lemma,
                  "exposure",
                  messageId,
                  wovenContextSentenceFor(content, patches, patch),
                  null,
                );
              }
            }, 1000);
          } else if (!entry.isIntersecting && dwellTimer !== null) {
            window.clearTimeout(dwellTimer);
            dwellTimer = null;
          }
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      if (dwellTimer !== null) window.clearTimeout(dwellTimer);
      observer.disconnect();
    };
  }, [containerRef, exposureKey, messageId, content, patches, recordSignal]);
}
