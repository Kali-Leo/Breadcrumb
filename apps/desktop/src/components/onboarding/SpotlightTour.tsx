/**
 * Purpose: the guided tour's spotlight — it dims the app, cuts a hole around one real element,
 * and anchors a short explanation beside it.
 *
 * Deliberately pointing at the running app rather than at pictures of it. A newcomer who has
 * been walked through the actual map, with actual islands on it, knows where the map is; a
 * newcomer who read three screens of prose knows nothing. The hole is a genuine gap in the
 * overlay, so the highlighted control stays clickable and a step can ask someone to do the
 * thing rather than watch it.
 *
 * Four dimming panels rather than an SVG mask: the gap between them has no element over it at
 * all, so hit-testing works without pointer-events games, and each panel is a plain rectangle
 * the compositor can animate.
 *
 * Main exports: SpotlightTour, TourStep.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface TourStep {
  /** Matches a `data-tour` attribute on the element to point at. Omit for a centred step. */
  target?: string;
  /** Which view must be open for the target to exist. */
  view?: "chat" | "map" | "vocab" | "discovery" | "settings";
  /** Locale key suffix under `onboarding.tour.` — `<id>Title` and `<id>Body`. */
  id: string;
  /** Which side of the target to put the card on. Falls back when it would go off-screen. */
  place?: "top" | "bottom" | "start" | "end";
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room between the highlighted element and the hole's edge. */
const PADDING = 8;
/** The card's fixed width — narrow enough to sit beside a sidebar button. */
const CARD_WIDTH = 320;
/** The target may not exist the instant a view is switched to — the map mounts a Pixi canvas
 * and generates terrain first. Poll rather than guessing one delay: a single timeout is either
 * too short on a slow machine or a needless wait on a fast one. */
const POLL_MS = 120;
const POLL_LIMIT = 24;

function measure(target: string | undefined): Rect | null {
  if (target === undefined) return null;
  const element = document.querySelector(`[data-tour="${target}"]`);
  if (element === null) return null;
  const box = element.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return {
    top: box.top - PADDING,
    left: box.left - PADDING,
    width: box.width + PADDING * 2,
    height: box.height + PADDING * 2,
  };
}

/** Where the card goes: beside the hole if it fits, otherwise wherever it does. */
function cardPosition(rect: Rect | null, place: TourStep["place"]): React.CSSProperties {
  if (rect === null) {
    return { top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: CARD_WIDTH };
  }
  const gap = 14;
  const { innerWidth, innerHeight } = window;
  const preferred = place ?? "bottom";

  if (preferred === "end" && rect.left + rect.width + gap + CARD_WIDTH < innerWidth) {
    return {
      top: Math.min(rect.top, innerHeight - 260),
      left: rect.left + rect.width + gap,
      width: CARD_WIDTH,
    };
  }
  if (preferred === "start" && rect.left - gap - CARD_WIDTH > 0) {
    return {
      top: Math.min(rect.top, innerHeight - 260),
      left: rect.left - gap - CARD_WIDTH,
      width: CARD_WIDTH,
    };
  }
  if (preferred === "top" && rect.top - gap > 220) {
    return {
      top: rect.top - gap - 200,
      left: Math.min(Math.max(rect.left, gap), innerWidth - CARD_WIDTH - gap),
      width: CARD_WIDTH,
    };
  }
  // Bottom, and the fallback for everything that did not fit.
  const below = rect.top + rect.height + gap;
  return {
    top: below + 220 < innerHeight ? below : Math.max(gap, rect.top - gap - 200),
    left: Math.min(Math.max(rect.left, gap), innerWidth - CARD_WIDTH - gap),
    width: CARD_WIDTH,
  };
}

interface SpotlightTourProps {
  steps: readonly TourStep[];
  /** Switches the app to the view a step needs before it is measured. */
  onNavigate(view: NonNullable<TourStep["view"]>): void;
  onFinish(): void;
}

export function SpotlightTour({ steps, onNavigate, onFinish }: SpotlightTourProps) {
  const { t } = useTranslation("onboarding");
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const settleTimer = useRef<number | null>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Put the app on the right view first; the element cannot be measured until it exists.
  useEffect(() => {
    if (step?.view !== undefined) onNavigate(step.view);
  }, [step?.view, onNavigate]);

  const remeasure = useCallback(() => setRect(measure(step?.target)), [step?.target]);

  useLayoutEffect(() => {
    setRect(null);
    let attempts = 0;
    const tick = () => {
      const found = measure(step?.target);
      setRect(found);
      attempts += 1;
      // Stop as soon as it is there. Giving up leaves the card centred and the step still
      // readable — a view that never rendered (no WebGL for the map, say) must not take the
      // tour down with it.
      if (found === null && attempts < POLL_LIMIT) {
        settleTimer.current = window.setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    };
  }, [step?.target]);

  useEffect(() => {
    window.addEventListener("resize", remeasure);
    return () => window.removeEventListener("resize", remeasure);
  }, [remeasure]);

  // Escape leaves. A tour nobody can get out of is worse than no tour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFinish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFinish]);

  if (step === undefined) return null;

  const dim = "fixed bg-stone-900/55 transition-all duration-200";
  const panels: React.CSSProperties[] =
    rect === null
      ? [{ inset: 0 }]
      : [
          { top: 0, left: 0, right: 0, height: Math.max(0, rect.top) },
          { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
          {
            top: rect.top,
            left: rect.left + rect.width,
            right: 0,
            height: rect.height,
          },
          { top: rect.top + rect.height, left: 0, right: 0, bottom: 0 },
        ];

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {panels.map((style, panelIndex) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: four fixed panels, order is the identity
          key={panelIndex}
          className={`${dim} pointer-events-auto`}
          style={style}
          onClick={() => undefined}
          aria-hidden
        />
      ))}

      {rect !== null && (
        <div
          className="fixed rounded-xl ring-2 ring-amber-400 transition-all duration-200"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden
        />
      )}

      <div
        role="dialog"
        aria-label={t("tour.label")}
        className="pointer-events-auto fixed rounded-2xl bg-white p-4 shadow-2xl"
        style={cardPosition(rect, step.place)}
      >
        <p className="font-medium text-stone-700">{t(`tour.${step.id}Title` as never)}</p>
        <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">
          {t(`tour.${step.id}Body` as never)}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <span className="text-stone-400 text-xs tabular-nums">
            {index + 1}/{steps.length}
          </span>
          {index > 0 && (
            <button
              type="button"
              onClick={() => setIndex(index - 1)}
              className="rounded-lg px-2.5 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
            >
              {t("back")}
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? onFinish() : setIndex(index + 1))}
            className="ms-auto rounded-lg bg-amber-500 px-4 py-1.5 text-sm text-white transition-colors hover:bg-amber-600"
          >
            {isLast ? t("tour.finish") : t("next")}
          </button>
          <button type="button" onClick={onFinish} className="text-stone-400 text-xs underline">
            {t("tour.exit")}
          </button>
        </div>
      </div>
    </div>
  );
}
