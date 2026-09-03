/**
 * Purpose: the small card that stays after the tour ends, listing the few things worth doing
 * first — and, when the demo is installed, the button that takes it away again.
 *
 * A tour tells someone what exists; it does not get them to do anything. The checklist is
 * what carries a newcomer from "I have seen it" to "I have used it", which is the only
 * transition that matters. Each item ticks itself off from real state, so it is a mirror of
 * what has happened rather than a set of chores — nothing here counts down, scolds, or shows
 * a percentage.
 *
 * It dismisses permanently and can be brought back from settings.
 *
 * The demo module is reached through import(), for the reason OnboardingHost gives.
 *
 * Main exports: OnboardingChecklist.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRepos } from "../../lib/platform/db";
import { useInputMode } from "../../lib/platform/inputMode";
import { useSettingsStore } from "../../stores/settingsStore";

interface ChecklistState {
  connected: boolean;
  asked: boolean;
  sawMap: boolean;
  demoInstalled: boolean;
}

interface OnboardingChecklistProps {
  onOpenSettings(): void;
  onOpenMap(): void;
  /** Runs the tour again. The primary action here, not a footnote: landing on this card
   * usually means the tour was skipped or interrupted, and the person has not actually seen
   * anything yet. */
  onReplayTour(): void;
  onDismiss(): void;
  /** True once the learner has opened the map at least once this session. */
  sawMap: boolean;
}

export function OnboardingChecklist({
  onOpenSettings,
  onOpenMap,
  onReplayTour,
  onDismiss,
  sawMap,
}: OnboardingChecklistProps) {
  const { t } = useTranslation("onboarding");
  const apiConfig = useSettingsStore((state) => state.apiConfig);
  const [state, setState] = useState<ChecklistState>({
    connected: false,
    asked: false,
    sawMap: false,
    demoInstalled: false,
  });
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { hasDemoData } = await import("../../lib/platform/demoData");
      const repos = await getRepos();
      const conversations = await repos.conversations.listRecentFirst();
      // Demo conversations do not count as having asked anything — the point of the item is
      // that the learner has talked to it themselves.
      const own = conversations.filter((conversation) => !conversation.id.startsWith("demo-"));
      setState({
        connected: apiConfig !== null && apiConfig.apiKey.length > 0,
        asked: own.length > 0,
        sawMap,
        demoInstalled: await hasDemoData(),
      });
    })();
  }, [apiConfig, sawMap]);

  const items = [
    { done: state.connected, label: t("checklist.connect"), action: onOpenSettings },
    { done: state.asked, label: t("checklist.ask"), action: null },
    { done: state.sawMap, label: t("checklist.map"), action: onOpenMap },
  ];

  // On touch the card would sit over the map's hints or the context panel (2026-09-03
  // walkthrough), so there it starts as a pill and only opens when asked; a mouse layout
  // keeps the open card, unchanged.
  const coarse = useInputMode() === "coarse";
  const [expanded, setExpanded] = useState(false);
  if (coarse && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="absolute start-3 bottom-[calc(var(--composer-height,0px)+0.75rem)] z-30 flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 text-sm text-stone-700 shadow-lg"
      >
        {t("checklist.title")}
        <span aria-hidden>▸</span>
      </button>
    );
  }

  return (
    // Bottom-end corner of the content — which on a small or touch screen is the send button,
    // so there it moves up above the composer (ChatView publishes --composer-height).
    <div className="absolute end-3 bottom-3 z-30 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-stone-200 bg-white p-4 shadow-lg coarse:end-auto coarse:start-3 coarse:bottom-[calc(var(--composer-height,0px)+0.75rem)] stacked:bottom-[calc(var(--composer-height,0px)+0.75rem)]">
      <div className="flex items-start justify-between gap-2">
        {coarse ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded
            className="flex min-h-11 items-center gap-2 font-medium text-sm text-stone-700"
          >
            {t("checklist.title")}
            <span aria-hidden>▾</span>
          </button>
        ) : (
          <p className="font-medium text-sm text-stone-700">{t("checklist.title")}</p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("checklist.dismiss")}
          className="rounded px-1.5 text-stone-400 hover:bg-stone-100 coarse:flex coarse:min-h-11 coarse:min-w-11 coarse:items-center coarse:justify-center"
        >
          ✕
        </button>
      </div>

      <button
        type="button"
        onClick={onReplayTour}
        className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm text-white transition-colors hover:bg-amber-600 coarse:min-h-11"
      >
        {t("checklist.takeTour")}
      </button>
      <p className="mt-1.5 text-stone-400 text-xs">{t("checklist.tourNote")}</p>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span
              className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] ${
                item.done
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "border-stone-300 text-transparent"
              }`}
              aria-hidden
            >
              ✓
            </span>
            {item.action !== null && !item.done ? (
              <button
                type="button"
                onClick={item.action}
                className="text-start text-stone-600 underline decoration-stone-300 hover:text-stone-800 coarse:inline-flex coarse:min-h-11 coarse:items-center"
              >
                {item.label}
              </button>
            ) : (
              <span className={item.done ? "text-stone-400 line-through" : "text-stone-600"}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ul>

      {state.demoInstalled && (
        <div className="mt-3 border-stone-100 border-t pt-3">
          <p className="text-stone-500 text-xs">{t("checklist.demoNote")}</p>
          <button
            type="button"
            disabled={removing}
            onClick={() => {
              setRemoving(true);
              void import("../../lib/platform/demoData")
                .then((module) => module.removeDemoData())
                .then(() => window.location.reload())
                .finally(() => setRemoving(false));
            }}
            className="mt-1.5 text-amber-700 text-xs underline disabled:opacity-60 coarse:inline-flex coarse:min-h-11 coarse:items-center"
          >
            {removing ? t("checklist.removingDemo") : t("checklist.removeDemo")}
          </button>
        </div>
      )}
    </div>
  );
}
