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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { requestDrawerFor } from "../shell/drawerRequests";
import { cardPosition, type SpotlightPlace } from "./spotlightPlacement";
import { useSpotlightPosition } from "./useSpotlightPosition";

export interface TourStep {
  /** Matches a `data-tour` attribute on the element to point at. Omit for a centred step. */
  target?: string;
  /** Which view must be open for the target to exist. */
  view?: "chat" | "map" | "vocab" | "discovery" | "settings";
  /** Locale key suffix under `onboarding.tour.` — `<id>Title` and `<id>Body`. */
  id: string;
  /** Which side of the target to put the card on. Falls back when it would go off-screen. */
  place?: SpotlightPlace;
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

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Put the app on the right view first; the element cannot be measured until it exists.
  useEffect(() => {
    if (step?.view !== undefined) onNavigate(step.view);
  }, [step?.view, onNavigate]);

  // On a stacked screen the sidebar is a drawer: a step pointing into it needs it open, and
  // every other step needs it out of the way.
  useEffect(() => {
    requestDrawerFor(step?.target);
  }, [step?.target]);

  const rect = useSpotlightPosition(step?.target);

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
