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
 * Main exports: OnboardingChecklist.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getRepos } from "../../lib/db";
import { hasDemoData, removeDemoData } from "../../lib/demoData";
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
  onDismiss(): void;
  /** True once the learner has opened the map at least once this session. */
  sawMap: boolean;
}

export function OnboardingChecklist({
  onOpenSettings,
  onOpenMap,
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

  return (
    <div className="absolute end-3 bottom-3 z-30 w-72 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm text-stone-700">{t("checklist.title")}</p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("checklist.dismiss")}
          className="rounded px-1.5 text-stone-400 hover:bg-stone-100"
        >
          ✕
        </button>
      </div>

      <ul className="mt-3 space-y-2">
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
                className="text-start text-stone-600 underline decoration-stone-300 hover:text-stone-800"
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
              void removeDemoData()
                .then(() => window.location.reload())
                .finally(() => setRemoving(false));
            }}
            className="mt-1.5 text-amber-700 text-xs underline disabled:opacity-60"
          >
            {removing ? t("checklist.removingDemo") : t("checklist.removeDemo")}
          </button>
        </div>
      )}
    </div>
  );
}
