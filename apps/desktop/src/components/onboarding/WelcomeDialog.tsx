/**
 * Purpose: the first thing a newcomer sees — one screen, and a fork.
 *
 * One screen, not a carousel: nobody reads the third panel of a welcome carousel, and this
 * app's actual explanation is the app. What the screen is really for is the choice underneath
 * it — look at a worked example, or start empty — because "show it working first" is what
 * every tool with a learning curve settles on, and because being handed an empty map and told
 * it will fill up eventually is not an introduction.
 *
 * Main exports: WelcomeDialog.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface WelcomeDialogProps {
  /** Install the demo learner, then walk the full tour over it. */
  onTryDemo(): Promise<void>;
  /** Straight to the shorter tour, on the learner's own empty app. */
  onStartClean(): void;
  onSkip(): void;
}

export function WelcomeDialog({ onTryDemo, onStartClean, onSkip }: WelcomeDialogProps) {
  const { t } = useTranslation("onboarding");
  const [installing, setInstalling] = useState(false);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-900/40 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
        <p className="text-3xl">🍞</p>
        <h1 className="mt-2 font-semibold text-2xl text-stone-700">{t("welcome.title")}</h1>
        <p className="mt-2 text-stone-600 leading-relaxed">{t("welcome.body")}</p>

        <ul className="mt-4 space-y-1.5 text-sm text-stone-500">
          <li>{t("welcome.point1")}</li>
          <li>{t("welcome.point2")}</li>
          <li>{t("welcome.point3")}</li>
        </ul>

        <div className="mt-6 space-y-2">
          <button
            type="button"
            disabled={installing}
            onClick={() => {
              setInstalling(true);
              void onTryDemo().finally(() => setInstalling(false));
            }}
            className="w-full rounded-xl bg-amber-500 px-5 py-3 text-white transition-colors hover:bg-amber-600 disabled:opacity-70 coarse:min-h-11"
          >
            {installing ? t("welcome.installing") : t("welcome.tryDemo")}
          </button>
          <p className="text-center text-stone-400 text-xs">{t("welcome.demoNote")}</p>

          <button
            type="button"
            disabled={installing}
            onClick={onStartClean}
            className="w-full rounded-xl border border-stone-200 px-5 py-2.5 text-sm text-stone-600 transition-colors hover:bg-stone-50 coarse:min-h-11"
          >
            {t("welcome.startClean")}
          </button>
        </div>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4 w-full text-center text-sm text-stone-400 underline coarse:min-h-11"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}
