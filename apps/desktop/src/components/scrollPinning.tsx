/**
 * Purpose: stick-to-bottom scroll pinning for chat panes (ChatGPT/Discord model) — content
 * growth auto-scrolls only while the user sits near the bottom; scrolling up unpins, and a
 * floating "回到底部" pill re-pins. Shared by the main chat view and the companion popup.
 * Main exports: useScrollPinning, BackToBottomPill.
 */
import { type RefObject, useCallback, useRef, useState } from "react";

/** Within this distance of the bottom the pane still counts as pinned — small scroll
 * jitters (momentum, streaming reflow) must not silently unpin. */
const NEAR_BOTTOM_PX = 40;

export interface ScrollPinning {
  containerRef: RefObject<HTMLDivElement | null>;
  pinned: boolean;
  /** Wire to the scroll container's onScroll — derives pinned from the live position. */
  handleScroll(): void;
  /** Jumps to the bottom and re-pins (instant, so streaming deltas can't outrun it). */
  scrollToBottom(): void;
}

export function useScrollPinning(): ScrollPinning {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    setPinned(
      container.scrollHeight - container.scrollTop - container.clientHeight <= NEAR_BOTTOM_PX,
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container === null) return;
    container.scrollTop = container.scrollHeight;
    setPinned(true);
  }, []);

  return { containerRef, pinned, handleScroll, scrollToBottom };
}

/** The floating re-pin affordance — render inside a `relative` wrapper around the scroll
 * container whenever the pane is unpinned and content may still be arriving below. */
export function BackToBottomPill({ onClick }: { onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-stone-200 bg-white/95 px-3 py-1 text-xs text-stone-600 shadow-md transition-colors hover:bg-amber-50"
    >
      回到底部
    </button>
  );
}
