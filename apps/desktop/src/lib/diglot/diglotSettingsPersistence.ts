/**
 * Purpose: everything the diglot store does against durable storage — hydrating settings,
 * pack, cards and counters from the database, writing a settings change back (and deciding
 * what that invalidates), switching to another language pair (downloading its pack first),
 * and re-mining the confusion pairs. Split out of stores/diglotStore.ts purely to keep that
 * file under the file-size ceiling; the store's actions are thin delegates to these.
 * Main exports: loadDiglotFromDatabase, saveDiglotSettings, chooseDiglotPair,
 * refreshDiglotConfusions.
 */
import { configureDiglotScheduler, mineConfusionPairs } from "@breadcrumb/feature-diglot-weave";
import { useDiglotStore } from "../../stores/diglotStore";
import { getRepos } from "../platform/db";
import { nowIso } from "../platform/time";
import { wireDailyWordCounterTrigger } from "./diglotDensity";
import { syncDiglotPairToAnswerLanguage, wireAnswerLanguageSync } from "./diglotLanguageSync";
import {
  DEFAULT_DIGLOT_SETTINGS,
  DIGLOT_SETTINGS_KEY,
  type DiglotSettings,
  WEAVE_AFFECTING_SETTING_KEYS,
} from "./diglotSettings";
import { loadCards } from "./diglotSignals";
import { bumpWeaveEpoch } from "./diglotWeaveRun";
import { type PackRemovalOutcome, removePairWith } from "./languagePackRemoval";
import {
  installLanguagePack,
  listInstalledPairs,
  loadPack,
  removeLanguagePack,
} from "./languagePacks";

export async function refreshDiglotConfusions(): Promise<void> {
  const { settings, loaded } = useDiglotStore.getState();
  if (loaded === null) return;
  const repos = await getRepos();
  const guesses = await repos.diglot.listGuesses(settings.pairId);
  useDiglotStore.setState({ confusionByLemma: mineConfusionPairs(guesses, loaded) });
}

/** Picks a pair, downloading its pack first when this machine does not have it yet. A
 * failed download leaves the current pair alone: the learner keeps weaving in the language
 * they already had. */
export async function chooseDiglotPair(pairId: string): Promise<void> {
  const store = useDiglotStore;
  // Their own choice replaces the line explaining the last automatic one.
  store.setState({ pairResetTargetLang: null });
  const before = store.getState().settings;
  if (pairId === before.pairId && before.enabled) return;
  if (!store.getState().installedPairs.includes(pairId)) {
    store.setState({ installingPairId: pairId, installFailedPairId: null });
    try {
      await installLanguagePack(pairId);
      store.setState({ installedPairs: await listInstalledPairs() });
    } catch {
      store.setState({ installingPairId: null, installFailedPairId: pairId });
      return;
    }
    store.setState({ installingPairId: null });
  }
  // Picking a language to learn is also how it gets switched on: the picker is the only
  // thing on screen when the answer language changed out from under the old pair.
  await store.getState().saveSettings({ pairId, enabled: true });
}

/** Removes a downloaded pack; the pair in use is first switched back to the bundled one so
 * the weave never points at a dictionary that is gone. Word states stay. */
export function removeDiglotPair(pairId: string): Promise<PackRemovalOutcome> {
  const store = useDiglotStore;
  return removePairWith(
    {
      currentPairId: () => store.getState().settings.pairId,
      switchPair: async (nextPairId) => {
        // Out of the ready list before the switch, because this pack is about to be deleted
        // and the answer-language correction would otherwise pick it straight back up.
        store.setState({
          installedPairs: store.getState().installedPairs.filter((id) => id !== pairId),
        });
        await store.getState().saveSettings({ pairId: nextPairId });
      },
      removePack: removeLanguagePack,
      listInstalled: listInstalledPairs,
      setInstalled: (installedPairs) => store.setState({ installedPairs }),
    },
    pairId,
  );
}

export async function loadDiglotFromDatabase(): Promise<void> {
  wireDailyWordCounterTrigger();
  const repos = await getRepos();
  const stored = await repos.settings.get<DiglotSettings>(DIGLOT_SETTINGS_KEY);
  const settings = { ...DEFAULT_DIGLOT_SETTINGS, ...stored };
  useDiglotStore.setState({
    settings,
    settingsHydrated: true,
    installedPairs: await listInstalledPairs(),
  });
  // The source half of a pair is not the learner's choice — it has to be the language the AI
  // answers in, or the pack's word list and tokenizer match nothing at all. Correct it before
  // a pack is loaded; when it moves, its own save re-entered this function and did the rest.
  wireAnswerLanguageSync();
  await syncDiglotPairToAnswerLanguage();
  const corrected = useDiglotStore.getState().settings;
  if (corrected.pairId !== settings.pairId || corrected.enabled !== settings.enabled) return;
  if (!settings.enabled) return;
  const loaded = await loadPack(settings.pairId);
  const cardsByLemma = await loadCards(settings.pairId);
  const states = await repos.diglot.listStates(settings.pairId);
  const today = nowIso().slice(0, 10);
  useDiglotStore.setState({
    loaded,
    cardsByLemma,
    newWordsIntroducedToday: states.filter((s) => s.introduced_at.startsWith(today)).length,
    lemmasWithExplicitSignal: new Set(
      await repos.diglot.listLemmasWithExplicitSignal(settings.pairId),
    ),
  });
  void refreshDiglotConfusions();
  // Personal memory model (vision/09 #1): apply fitted parameters, refit in background.
  configureDiglotScheduler(settings.pairId, settings.fsrsParams ?? undefined);
  void (async () => {
    const { maybeFitFsrsParameters } = await import("../platform/fsrsFit");
    const fitted = await maybeFitFsrsParameters(settings.pairId, settings.fsrsFittedReviewCount);
    if (fitted !== null) {
      const nextSettings = {
        ...useDiglotStore.getState().settings,
        fsrsParams: fitted.params,
        fsrsFittedReviewCount: fitted.reviewCount,
      };
      await repos.settings.set(DIGLOT_SETTINGS_KEY, nextSettings, nowIso());
      useDiglotStore.setState({ settings: nextSettings });
    }
  })();
  await repos.diglot.upsertPack({
    id: loaded.pack.id,
    source_lang: loaded.pack.sourceLang,
    target_lang: loaded.pack.targetLang,
    version: loaded.pack.version,
    meta_json: JSON.stringify(loaded.pack.capabilities),
    installed_at: nowIso(),
  });
}

export async function saveDiglotSettings(partial: Partial<DiglotSettings>): Promise<void> {
  const previous = useDiglotStore.getState().settings;
  const settings = { ...previous, ...partial };
  const repos = await getRepos();
  await repos.settings.set(DIGLOT_SETTINGS_KEY, settings, nowIso());
  // Only a change to a WEAVE_AFFECTING_SETTING_KEYS key invalidates woven output — e.g.
  // TTS/piper text fields don't feed patch computation at all, so saving them must not
  // wipe and re-weave (with billed LLM refine calls) every already-rendered message. The
  // epoch bump makes every in-flight weave discard its (old-settings) result.
  const weaveAffected = WEAVE_AFFECTING_SETTING_KEYS.some((key) => previous[key] !== settings[key]);
  if (weaveAffected) {
    bumpWeaveEpoch();
    useDiglotStore.setState({ settings, patchesByMessage: new Map() });
  } else {
    useDiglotStore.setState({ settings });
  }
  // A different pair is a different dictionary, different cards, different everything the
  // weave reads — without this the app kept weaving the old language until the next launch
  // (caught in the 2026-09-01 walkthrough: the pair line said Swahili while the vocabulary
  // check was still asking about English).
  const pairChanged = previous.pairId !== settings.pairId;
  if (settings.enabled && (useDiglotStore.getState().loaded === null || pairChanged)) {
    if (pairChanged) {
      useDiglotStore.setState({
        loaded: null,
        cardsByLemma: new Map(),
        confusionByLemma: new Map(),
      });
    }
    await loadDiglotFromDatabase();
  }
}
