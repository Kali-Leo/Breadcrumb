/**
 * Purpose: the downloaded language packs, each with its remove action — the list only exists
 * once something has been downloaded (the bundled pair is not a download and is never
 * listed). Removing the pair in use quietly swaps the weave back to the bundled pair and says
 * so in one line, until the learner picks a pair again.
 * Main exports: DiglotInstalledPacks.
 */
import { languageNameOf } from "@breadcrumb/core-i18n";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { removeDiglotPair } from "../../lib/diglot/diglotSettingsPersistence";
import { BUNDLED_PAIR_ID, catalogPackFor } from "../../lib/diglot/languagePacks";
import { useDiglotStore } from "../../stores/diglotStore";

const BUNDLED = { source: languageNameOf("zh"), target: languageNameOf("en") };

export function DiglotInstalledPacks() {
  const { t } = useTranslation("learning");
  const installedPairs = useDiglotStore((state) => state.installedPairs);
  const currentPairId = useDiglotStore((state) => state.settings.pairId);
  const installingPairId = useDiglotStore((state) => state.installingPairId);
  const [removingPairId, setRemovingPairId] = useState<string | null>(null);
  const [switchedToBundled, setSwitchedToBundled] = useState(false);

  // The "switched back" line lasts until the learner chooses a pair again.
  useEffect(() => {
    if (currentPairId !== BUNDLED_PAIR_ID) setSwitchedToBundled(false);
  }, [currentPairId]);

  const downloaded = installedPairs
    .filter((pairId) => pairId !== BUNDLED_PAIR_ID)
    .map((pairId) => catalogPackFor(pairId))
    .filter((pack) => pack !== null);
  if (downloaded.length === 0 && !switchedToBundled) return null;

  async function remove(pairId: string) {
    setRemovingPairId(pairId);
    try {
      const outcome = await removeDiglotPair(pairId);
      if (outcome.switchedToBundled) setSwitchedToBundled(true);
    } finally {
      setRemovingPairId(null);
    }
  }

  return (
    <div className="space-y-2">
      {downloaded.length > 0 && (
        <div>
          <span>{t("diglot.installedTitle")}</span>
          <p className="text-xs text-stone-400">{t("diglot.installedHint")}</p>
        </div>
      )}
      {downloaded.map((pack) => {
        // Only the language being learned: what it is learned FROM is not a choice here, it
        // is whatever the AI answers in (lib/diglot/diglotPairsForLanguage.ts).
        const names = { target: languageNameOf(pack.targetLang) };
        return (
          <div key={pack.id} className="flex items-center justify-between gap-4">
            <span className="text-sm text-stone-600">{t("diglot.pairOption", names)}</span>
            <button
              type="button"
              aria-label={t("diglot.removePackAria", names)}
              disabled={removingPairId !== null || installingPairId !== null}
              onClick={() => void remove(pack.id)}
              className="shrink-0 rounded-xl border border-stone-200 px-3 py-1.5 text-xs text-stone-500 hover:border-amber-400 disabled:opacity-50 coarse:min-h-11"
            >
              {t("diglot.removePack")}
            </button>
          </div>
        );
      })}
      {switchedToBundled && (
        <p className="text-xs text-stone-500">{t("diglot.removedCurrentPack", BUNDLED)}</p>
      )}
    </div>
  );
}
