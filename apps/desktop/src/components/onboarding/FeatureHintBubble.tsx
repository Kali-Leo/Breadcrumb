/**
 * Purpose: the bubble itself — one sentence beside the element it is about, with a small
 * arrow pointing at that element. Placement is decided from the bubble's real size, so it is
 * kept invisible for the one frame before it has been measured.
 *
 * Nothing in it is clickable and it lets pointer events through: it is a caption, not a
 * dialog, and the element under it must stay exactly as usable as it was. It fades rather than
 * vanishes so a bubble leaving on its own is noticed as leaving, not as a glitch.
 * Main exports: FeatureHintBubble.
 */
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FeatureHintId } from "../../lib/platform/settingsSchema";
import { HINT_PLACEMENT } from "./featureHints";
import {
  BUBBLE_WIDTH_CSS,
  type BubbleLayout,
  type BubbleSize,
  bubbleLayout,
} from "./hintPlacement";
import { useAnchorRect } from "./useAnchorRect";

interface FeatureHintBubbleProps {
  id: FeatureHintId;
  element: Element;
  /** True while the bubble is fading out. */
  leaving: boolean;
  /** The element has left the document, so the bubble has nothing to point at. */
  onLost(): void;
}

const ARROW = 8;

/** The arrow is a rotated square hanging off the edge that faces the element, showing the
 * same two borders as the bubble so the join reads as one shape. */
function arrowStyle(layout: BubbleLayout): CSSProperties {
  const base: CSSProperties = { width: ARROW, height: ARROW, transform: "rotate(45deg)" };
  switch (layout.side) {
    case "top":
      return { ...base, left: layout.arrow - ARROW / 2, bottom: -ARROW / 2 - 1 };
    case "bottom":
      return { ...base, left: layout.arrow - ARROW / 2, top: -ARROW / 2 - 1 };
    case "left":
      return { ...base, top: layout.arrow - ARROW / 2, right: -ARROW / 2 - 1 };
    case "right":
      return { ...base, top: layout.arrow - ARROW / 2, left: -ARROW / 2 - 1 };
  }
}

const ARROW_BORDER: Record<BubbleLayout["side"], string> = {
  top: "border-r border-b",
  bottom: "border-l border-t",
  left: "border-r border-t",
  right: "border-l border-b",
};

export function FeatureHintBubble({ id, element, leaving, onLost }: FeatureHintBubbleProps) {
  const { t } = useTranslation("onboarding");
  const rect = useAnchorRect(element);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<BubbleSize | null>(null);
  const text = t(`hints.${id}` as never);

  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    setSize({ width: node.offsetWidth, height: node.offsetHeight });
  }, []);

  useLayoutEffect(() => {
    if (rect === null) onLost();
  }, [rect, onLost]);

  const layout =
    rect !== null && size !== null ? bubbleLayout(rect, HINT_PLACEMENT[id], size) : null;
  const style: CSSProperties =
    layout === null
      ? { top: 0, left: 0, width: BUBBLE_WIDTH_CSS, visibility: "hidden" }
      : { top: layout.top, left: layout.left, width: BUBBLE_WIDTH_CSS };

  return (
    <div
      ref={ref}
      role="status"
      aria-label={t("hints.label")}
      data-hint-bubble={id}
      style={style}
      className={`pointer-events-none fixed z-50 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm text-stone-700 leading-snug shadow-lg transition-opacity duration-300 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      {text}
      {layout !== null && (
        <span
          aria-hidden
          style={arrowStyle(layout)}
          className={`absolute block border-amber-300 bg-white ${ARROW_BORDER[layout.side]}`}
        />
      )}
    </div>
  );
}
