/**
 * Purpose: the one place a weave actually runs — the single-flight guard, the weave epoch
 * that lets a settings change discard in-flight output, the base+refine weave itself, and
 * the persistence of what the placement rules made of one signal. Split out of
 * stores/diglotStore.ts purely to keep that file under the file-size ceiling; it reaches
 * back into the store exactly as it did when it lived below it.
 * Main exports: weaveAndStore, foldPlacement, bumpWeaveEpoch.
 */
import type { DiglotEventKind } from "@breadcrumb/core-db";
import type { LoadedLanguagePack } from "@breadcrumb/feature-diglot-weave";
import type { Card } from "ts-fsrs";
import { useDiglotStore } from "../../stores/diglotStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { getRepos } from "../platform/db";
import { nowIso } from "../platform/time";
import { nextPlacementState } from "./diglotPlacement";
import { refineWeavePatches } from "./diglotRefine";
import { REFINE_HARD_TIMEOUT_MS, refineWithHardTimeout } from "./diglotReveal";
import { DIGLOT_SETTINGS_KEY } from "./diglotSettings";
import { weaveAssistantMessage } from "./diglotWeave";

/** Called by saveSettings when a weave-affecting key changed, so that every weave already in
 * flight (computed against the old settings) throws its result away and starts over, and so
 * that whatever asked for a weave asks again — the epoch lives in the store because a swept
 * patch cache is invisible to a React effect otherwise, and the message stays blank. */
export function bumpWeaveEpoch(): void {
  useDiglotStore.setState({ weaveEpoch: useDiglotStore.getState().weaveEpoch + 1 });
}

/** Persists what the placement rules made of one signal (see lib/diglot/diglotPlacement.ts). */
export async function foldPlacement(input: {
  lemma: string;
  kind: DiglotEventKind;
  messageId: string | null;
  card: Card;
  loaded: LoadedLanguagePack;
}): Promise<void> {
  const { settings, cardsByLemma } = useDiglotStore.getState();
  const placed = await nextPlacementState({
    pairId: settings.pairId,
    state: {
      introductionRankFloor: settings.introductionRankFloor,
      placementStep: settings.placementStep,
    },
    lemma: input.lemma,
    kind: input.kind,
    messageId: input.messageId,
    card: input.card,
    loaded: input.loaded,
    introducedWordCount: cardsByLemma.size,
  });
  if (placed === null) return;
  // Merge onto the settings AS THEY ARE NOW — a concurrent saveSettings between the entry
  // snapshot and this write must not be silently reverted.
  const nextSettings = { ...useDiglotStore.getState().settings, ...placed };
  const repos = await getRepos();
  await repos.settings.set(DIGLOT_SETTINGS_KEY, nextSettings, nowIso());
  useDiglotStore.setState({ settings: nextSettings });
}

/** Message ids with a weave in flight — single-flight guard that stays OUT of
 * patchesByMessage, so subscribers (MessageBubble's blank-until-woven gate, the doors
 * effect) keep seeing `undefined` until the FINAL patches land in one set(). */
const weaveInFlight = new Set<string>();

/** The one weave path (both halves of the timing ruling): base weave always; the metered
 * LLM refine only on the reveal path, raced against its hard timeout — on timeout the base
 * weave lands and, because refine never runs again for a cached message, it is skipped for
 * that message forever. */
export async function weaveAndStore(
  messageId: string,
  displaySource: string,
  refine: boolean,
): Promise<void> {
  if (weaveInFlight.has(messageId)) return;
  if (useDiglotStore.getState().patchesByMessage.has(messageId)) return;
  weaveInFlight.add(messageId);
  try {
    // Loop rather than return: a settings change mid-weave invalidates the result, and
    // returning empty-handed is what left every message on screen blank (2026-09-04). The
    // next round reads the new settings; epochs only change when a person changes a setting.
    while (!(await weaveOnce(messageId, displaySource, refine))) {
      /* weave again against the settings that superseded the last round */
    }
  } finally {
    weaveInFlight.delete(messageId);
  }
}

/** One weave attempt. Returns false when a settings change during it made the result stale
 * (nothing was stored), true when the patches landed or there is nothing to weave. */
async function weaveOnce(
  messageId: string,
  displaySource: string,
  refine: boolean,
): Promise<boolean> {
  const { settings, loaded, cardsByLemma, weaveEpoch } = useDiglotStore.getState();
  if (!settings.enabled || loaded === null) return true;
  const result = await weaveAssistantMessage({
    loaded,
    content: displaySource,
    density: settings.density,
    newWordDailyBase: settings.newWordDailyBase,
    introductionRankFloor: settings.introductionRankFloor,
    cardsByLemma,
    newWordsIntroducedToday: useDiglotStore.getState().newWordsIntroducedToday,
  });
  let patches = result.patches;
  // T13 refinement (metered, own switch): in-context disambiguation + phrase weave.
  const { apiConfig, networkEnabled } = useSettingsStore.getState();
  if (refine && settings.llmRefineEnabled && networkEnabled && apiConfig !== null) {
    const basePatches = patches;
    if (basePatches.length > 0) {
      patches = await refineWithHardTimeout(
        () => refineWeavePatches(apiConfig, loaded, displaySource, basePatches),
        basePatches,
        REFINE_HARD_TIMEOUT_MS,
      );
    }
  }
  // Settings changed underneath (the epoch bump also swept patchesByMessage) — this weave
  // was computed against stale inputs and must not land.
  const state = useDiglotStore.getState();
  if (weaveEpoch !== state.weaveEpoch) return false;
  useDiglotStore.setState({
    patchesByMessage: new Map(state.patchesByMessage).set(messageId, patches),
    newWordsIntroducedToday: state.newWordsIntroducedToday + result.introducedLemmas.length,
  });
  return true;
}
