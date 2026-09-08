/**
 * Purpose: the first thing a newcomer sees — three cards that say what the app is, what grows
 * out of using it, and what it keeps or costs. Then it gets out of the way.
 *
 * Three cards rather than one screen because those are three separate things and the third
 * one — where the data lives, what is billed — is the one people most want answered before
 * they type anything. They are pages of one card, not a queue of dialogs, so going back is a
 * click and the whole thing can be left at any point.
 *
 * It ends on the chat page and nothing is pulled along behind it: the per-page notes take
 * over from here, each on the page it describes. The example learner stays on offer at the
 * end, because being handed an empty map and told it fills up eventually is not an
 * introduction.
 *
 * Main exports: WelcomeDialog.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface WelcomeDialogProps {
  /** Install the example learner, then hand over the same way the plain finish does. */
  onTryDemo(): Promise<void>;
  /** Introduction over — mark it seen and open the chat page. */
  onDone(): void;
}

const CARDS = [1, 2, 3] as const;

export function WelcomeDialog({ onTryDemo, onDone }: WelcomeDialogProps) {
  const { t } = useTranslation("onboarding");
  const [card, setCard] = useState(0);
  const [installing, setInstalling] = useState(false);
  const index = CARDS[card] ?? 1;
  const isLast = card === CARDS.length - 1;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/40 p-6">
      <div
        role="dialog"
        aria-label={t("welcome.label")}
        className="flex w-full max-w-lg flex-col rounded-2xl bg-white p-7 shadow-2xl"
      >
        <p className="text-3xl">🍞</p>
        <h1 className="mt-2 font-semibold text-2xl text-stone-700">
          {t(`welcome.card${index}Title` as never)}
        </h1>
        <p className="mt-3 text-stone-600 leading-relaxed">
          {t(`welcome.card${index}Body` as never)}
        </p>

        <div className="mt-6 flex items-center gap-2">
          <div className="flex gap-1.5" aria-hidden>
            {CARDS.map((value, position) => (
              <span
                key={value}
                className={`h-1.5 w-1.5 rounded-full ${
                  position === card ? "bg-amber-500" : "bg-stone-200"
                }`}
              />
            ))}
          </div>
          {card > 0 && (
            <button
              type="button"
              onClick={() => setCard(card - 1)}
              className="rounded-lg px-2.5 py-1.5 text-sm text-stone-500 hover:bg-stone-100 coarse:inline-flex coarse:min-h-11 coarse:items-center"
            >
              {t("back")}
            </button>
          )}
          <button
            type="button"
            disabled={installing}
            onClick={() => (isLast ? onDone() : setCard(card + 1))}
            className="ms-auto rounded-xl bg-amber-500 px-5 py-2.5 text-sm text-white transition-colors hover:bg-amber-600 disabled:opacity-70 coarse:min-h-11"
          >
            {isLast ? t("welcome.start") : t("next")}
          </button>
        </div>

        {isLast && (
          <div className="mt-5 border-stone-100 border-t pt-4">
            <button
              type="button"
              disabled={installing}
              onClick={() => {
                setInstalling(true);
                void onTryDemo().finally(() => setInstalling(false));
              }}
              className="w-full rounded-xl border border-stone-200 px-5 py-2.5 text-sm text-stone-600 transition-colors hover:bg-stone-50 disabled:opacity-70 coarse:min-h-11"
            >
              {installing ? t("welcome.installing") : t("welcome.tryDemo")}
            </button>
            <p className="mt-1.5 text-center text-stone-400 text-xs">{t("welcome.demoNote")}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onDone}
          className="mt-4 w-full text-center text-sm text-stone-400 underline coarse:min-h-11"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}
