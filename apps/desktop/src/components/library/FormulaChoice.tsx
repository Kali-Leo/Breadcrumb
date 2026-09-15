/**
 * Purpose: the one choice the import offers — whether formulas on scanned pages are read into
 * LaTeX. It is a choice rather than a default because it is the one recognition step with a
 * real cost: a 230 MB download on first use, desktop edition only. The line says the cost and
 * nothing about models; a reader ticks it when their books have formulas and leaves it alone
 * otherwise. Nothing is downloaded by ticking — the next scanned page with a formula on it
 * fetches the model, network switch permitting, the way every other model arrives.
 * Main exports: FormulaChoice.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FORMULA_MODEL_MB,
  formulaRecognitionAvailable,
  formulaRecognitionEnabled,
  setFormulaRecognitionEnabled,
} from "../../lib/library/formulaSetting";

export function FormulaChoice() {
  const { t } = useTranslation("library");
  const [enabled, setEnabled] = useState(formulaRecognitionEnabled);
  if (!formulaRecognitionAvailable()) return null;
  return (
    <label className="flex items-start gap-2 text-sm text-stone-600">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          setFormulaRecognitionEnabled(event.target.checked);
          setEnabled(event.target.checked);
        }}
        className="mt-1 accent-amber-500"
        data-choice="formulas"
      />
      <span>
        {t("formulas.label")}
        <span className="ml-2 text-stone-400 text-xs">
          {t("formulas.download", { mb: FORMULA_MODEL_MB })}
        </span>
      </span>
    </label>
  );
}
