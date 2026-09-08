/**
 * Purpose: one page's own short note — what the page is, what it is for, and what it does not
 * do — as a small card in the corner rather than a screen-filling dialog.
 *
 * Deliberately not a modal: the point of these is to be read next to the thing they describe,
 * so the page stays visible and stays usable while the card is up. It sits in the top corner
 * on the far side, the one place none of the six pages puts anything of its own; logical
 * properties, so it moves to the other corner in Arabic without a second rule.
 *
 * Main exports: PageGuideCard.
 */
import { useTranslation } from "react-i18next";
import type { PageGuideId } from "../../lib/platform/settingsSchema";

interface PageGuideCardProps {
  page: PageGuideId;
  onDismiss(): void;
}

export function PageGuideCard({ page, onDismiss }: PageGuideCardProps) {
  const { t } = useTranslation("onboarding");

  return (
    <div
      role="dialog"
      aria-label={t("pageGuide.label")}
      className="absolute end-3 top-3 z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-stone-200 bg-white p-4 shadow-lg"
    >
      <p className="pe-6 font-medium text-stone-700">{t(`pageGuide.${page}.title` as never)}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("pageGuide.gotIt")}
        className="absolute end-2 top-2 rounded px-1.5 text-stone-400 hover:bg-stone-100 coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center"
      >
        ✕
      </button>

      <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">
        {t(`pageGuide.${page}.body` as never)}
      </p>

      <ul className="mt-3 space-y-1.5 text-sm text-stone-500">
        <li className="flex gap-2">
          <span aria-hidden>·</span>
          <span>{t(`pageGuide.${page}.point1` as never)}</span>
        </li>
        <li className="flex gap-2">
          <span aria-hidden>·</span>
          <span>{t(`pageGuide.${page}.point2` as never)}</span>
        </li>
      </ul>

      <p className="mt-3 border-stone-100 border-t pt-3 text-sm text-stone-500 leading-relaxed">
        {t(`pageGuide.${page}.limit` as never)}
      </p>

      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-2 text-sm text-white transition-colors hover:bg-amber-600 coarse:min-h-11"
      >
        {t("pageGuide.gotIt")}
      </button>
    </div>
  );
}
