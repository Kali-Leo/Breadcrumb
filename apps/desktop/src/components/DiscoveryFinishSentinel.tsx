/**
 * Purpose: records that an item was read through (spec 053 §6) — an invisible marker placed after
 * the last line of the text. It fires the first time it scrolls into view and never again, so a
 * reader who scrolls back up does not report finishing twice.
 * Main exports: DiscoveryFinishSentinel.
 */
import type { DiscoveryCardRow } from "@breadcrumb/core-db";
import { useEffect, useRef } from "react";
import { useDiscoveryStore } from "../stores/discoveryStore";

export function DiscoveryFinishSentinel({ card }: { card: DiscoveryCardRow }) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = sentinelRef.current;
    if (element === null) return;
    let recorded = false;
    const observer = new IntersectionObserver((entries) => {
      if (recorded || !entries.some((entry) => entry.isIntersecting)) return;
      recorded = true;
      void useDiscoveryStore.getState().recordFinish(card.id, card.topic_label);
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [card.id, card.topic_label]);

  return <div ref={sentinelRef} className="h-1" />;
}
