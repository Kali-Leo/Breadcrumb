/**
 * Purpose: the opening slides — one per core feature, each a picture with a title and a
 * sentence or two, ending on a slide that starts the app. What the general shape of the
 * product is, before any one page tries to explain itself.
 *
 * Pictures rather than screenshots: a screenshot is in one language, and there are eleven.
 * Left and right on the keyboard, a swipe on a finger, the dots and the two buttons all move
 * between slides; leaving is possible from every one of them. Seen once, never again unless
 * asked for from settings.
 * Main exports: WelcomeSlides.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SLIDE_IDS, SLIDE_ILLUSTRATIONS } from "./illustrations";

interface WelcomeSlidesProps {
  /** Install the example learner, then hand over the same way the plain finish does. */
  onTryDemo(): Promise<void>;
  /** Slides over — mark them seen and open the chat page. */
  onDone(): void;
}

/** A horizontal drag shorter than this is a tap, not a swipe. */
const SWIPE_PX = 40;
const LAST = SLIDE_IDS.length - 1;

const GHOST_BUTTON =
  "rounded-xl border border-stone-200 px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-60 coarse:min-h-11";
const PRIMARY_BUTTON =
  "rounded-xl bg-amber-500 px-5 py-2 text-sm text-white transition-colors hover:bg-amber-600 disabled:opacity-70 coarse:min-h-11";

export function WelcomeSlides({ onTryDemo, onDone }: WelcomeSlidesProps) {
  const { t } = useTranslation("onboarding");
  const [index, setIndex] = useState(0);
  const [installing, setInstalling] = useState(false);
  const dragStart = useRef<number | null>(null);
  const slide = SLIDE_IDS[index] ?? "chat";
  const Picture = SLIDE_ILLUSTRATIONS[slide];
  const rightToLeft = document.documentElement.dir === "rtl";

  const go = useCallback(
    (delta: number) => setIndex((current) => Math.min(LAST, Math.max(0, current + delta))),
    [],
  );
  // "Forward" follows the reading direction: the arrow that points where the text goes on.
  const forward = rightToLeft ? -1 : 1;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(forward);
      else if (event.key === "ArrowLeft") go(-forward);
      else if (event.key === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [forward, go, onDone]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/40 p-4">
      <section
        role="dialog"
        aria-label={t("welcome.label")}
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onPointerDown={(event) => {
          dragStart.current = event.clientX;
        }}
        onPointerUp={(event) => {
          const start = dragStart.current;
          dragStart.current = null;
          if (start === null) return;
          const moved = event.clientX - start;
          if (Math.abs(moved) < SWIPE_PX) return;
          go(moved < 0 ? forward : -forward);
        }}
      >
        <div className="relative aspect-video w-full bg-amber-50">
          {/* Every slide's picture mounts fresh, so a swap is a swap and not a morph. */}
          <Picture key={slide} />
          <button
            type="button"
            onClick={onDone}
            className="absolute end-3 top-3 rounded-lg bg-white/80 px-2.5 py-1 text-stone-500 text-xs hover:bg-white coarse:min-h-11"
          >
            {t("skip")}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-5 pb-2 sm:min-h-28">
          <h1 className="font-semibold text-stone-700 text-xl">
            {t(`welcome.slides.${slide}.title` as never)}
          </h1>
          <p className="mt-2 text-stone-600 leading-relaxed">
            {t(`welcome.slides.${slide}.body` as never)}
          </p>
        </div>

        <div className="flex items-center gap-2 px-6 pt-3 pb-5">
          <div className="flex gap-1.5">
            {SLIDE_IDS.map((id, position) => (
              <button
                key={id}
                type="button"
                aria-label={t(`welcome.slides.${id}.title` as never)}
                aria-current={position === index ? "step" : undefined}
                onClick={() => setIndex(position)}
                className="flex h-6 w-3 items-center justify-center"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all ${
                    position === index ? "w-3 bg-amber-500" : "w-1.5 bg-stone-200"
                  }`}
                />
              </button>
            ))}
          </div>
          <div className="ms-auto flex items-center gap-2">
            {index > 0 && (
              <button type="button" onClick={() => go(-1)} className={GHOST_BUTTON}>
                {t("back")}
              </button>
            )}
            {index < LAST ? (
              <button type="button" onClick={() => go(1)} className={PRIMARY_BUTTON}>
                {t("next")}
              </button>
            ) : (
              <button
                type="button"
                disabled={installing}
                onClick={onDone}
                className={PRIMARY_BUTTON}
              >
                {t("welcome.start")}
              </button>
            )}
          </div>
        </div>

        {index === LAST && (
          <div className="border-stone-100 border-t px-6 py-4">
            <button
              type="button"
              disabled={installing}
              onClick={() => {
                setInstalling(true);
                void onTryDemo().finally(() => setInstalling(false));
              }}
              className={`w-full ${GHOST_BUTTON}`}
            >
              {installing ? t("welcome.installing") : t("welcome.tryDemo")}
            </button>
            <p className="mt-1.5 text-center text-stone-400 text-xs">{t("welcome.demoNote")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
