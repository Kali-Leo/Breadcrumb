/**
 * Purpose: the optional vocabulary calibration flow (spec 033 增补) — a yes/no word grid
 * sampled across frequency bands; self-report only, no grading, skippable and repeatable.
 * The result sets where new-word introduction starts.
 * Main exports: DiglotCalibration.
 */
import {
  type CalibrationWord,
  DIGLOT_UI_COPY,
  estimateCalibration,
  sampleCalibrationWords,
} from "@breadcrumb/plugin-diglot-weave";
import { useMemo, useState } from "react";
import { useDiglotStore } from "../stores/diglotStore";

const BANDS = 8;
const PER_BAND = 5;

export function DiglotCalibration() {
  const loaded = useDiglotStore((state) => state.loaded);
  const settings = useDiglotStore((state) => state.settings);
  const saveSettings = useDiglotStore((state) => state.saveSettings);
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());

  const samples = useMemo<CalibrationWord[]>(
    () => (loaded === null ? [] : sampleCalibrationWords(loaded, BANDS, PER_BAND)),
    [loaded],
  );

  if (loaded === null) return null;

  const finish = async () => {
    const answers = samples.map((sample) => ({ ...sample, known: known.has(sample.lemma) }));
    const result = estimateCalibration(answers, loaded.introductionQueue.length);
    await saveSettings({
      introductionRankFloor: result.introductionRankFloor,
      estimatedVocabulary: result.estimatedKnownCount,
    });
    setOpen(false);
    setKnown(new Set());
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm">{DIGLOT_UI_COPY.calibrationTitle}</span>
          {settings.estimatedVocabulary !== null && (
            <p className="text-stone-400 text-xs">
              估计已认识约 {settings.estimatedVocabulary} 个常用词 · 新词从第{" "}
              {settings.introductionRankFloor + 1} 位开始引入
            </p>
          )}
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded bg-stone-100 px-2 py-1 text-stone-600 text-xs hover:bg-stone-200"
          >
            {settings.estimatedVocabulary === null
              ? DIGLOT_UI_COPY.calibrationTitle
              : DIGLOT_UI_COPY.calibrationRedo}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-2 rounded-xl border border-stone-200 p-3">
          <p className="text-stone-500 text-xs">{DIGLOT_UI_COPY.calibrationHint}</p>
          <div className="flex flex-wrap gap-1.5">
            {samples.map((sample) => {
              const isKnown = known.has(sample.lemma);
              return (
                <button
                  key={sample.lemma}
                  type="button"
                  onClick={() => {
                    const next = new Set(known);
                    if (isKnown) next.delete(sample.lemma);
                    else next.add(sample.lemma);
                    setKnown(next);
                  }}
                  className={`rounded-lg px-2 py-1 text-sm ${
                    isKnown
                      ? "bg-amber-100 text-stone-800"
                      : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                  }`}
                >
                  {sample.target}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void finish()}
              className="rounded bg-amber-100 px-3 py-1 text-stone-700 text-xs hover:bg-amber-200"
            >
              {DIGLOT_UI_COPY.calibrationDone}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setKnown(new Set());
              }}
              className="rounded bg-stone-100 px-3 py-1 text-stone-500 text-xs hover:bg-stone-200"
            >
              {DIGLOT_UI_COPY.calibrationSkip}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
