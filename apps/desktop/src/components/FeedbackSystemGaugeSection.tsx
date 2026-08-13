/**
 * Purpose: the 🪞 feedback lab's "系统仪表" section — FSRS true-retention target vs. the
 * last-30-day measured rate; the only section allowed a percentage, and it evaluates the
 * scheduling system, never the learner (spec 035 #6).
 * Main exports: FeedbackSystemGaugeSection.
 */
import { FEEDBACK_COPY, gaugeLine, type SystemGaugeResult } from "@breadcrumb/plugin-feedback";
import { useFeedbackStore } from "../stores/feedbackStore";

/** How far under target still counts as "normal" before the copy switches to
 * "calibrating" — 5 percentage points, per spec 035's design decision. */
const NORMAL_TOLERANCE_PP = 5;

/** Weighted average of the node-side and word-side measured retention by sample size;
 * null when neither side has enough samples to publish (systemGauge.ts's own bar). */
function combineMeasuredRetention(gauge: SystemGaugeResult): number | null {
  const parts: Array<{ value: number; weight: number }> = [];
  if (gauge.nodeMeasured !== null)
    parts.push({ value: gauge.nodeMeasured, weight: gauge.nodeSampleSize });
  if (gauge.wordMeasured !== null)
    parts.push({ value: gauge.wordMeasured, weight: gauge.wordSampleSize });
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  return parts.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight;
}

export function FeedbackSystemGaugeSection() {
  const gauge = useFeedbackStore((state) => state.systemGauge);
  const measured = gauge === null ? null : combineMeasuredRetention(gauge);

  return (
    <section className="rounded border border-stone-200 bg-white p-3">
      <h3 className="font-semibold text-stone-600">{FEEDBACK_COPY.gaugeTitle}</h3>
      <p className="mt-1 text-stone-400">{FEEDBACK_COPY.gaugeHint}</p>
      {gauge === null || measured === null ? (
        <p className="mt-2 text-stone-500">{FEEDBACK_COPY.gaugeInsufficient}</p>
      ) : (
        <>
          <p className="mt-2 text-stone-700">
            {gaugeLine(Math.round(gauge.targetRetention * 100), Math.round(measured * 100))}
          </p>
          <p className="mt-1 text-stone-500">
            {Math.round(measured * 100) >=
            Math.round(gauge.targetRetention * 100) - NORMAL_TOLERANCE_PP
              ? FEEDBACK_COPY.gaugeNormal
              : FEEDBACK_COPY.gaugeCalibrating}
          </p>
        </>
      )}
      <p className="mt-2 text-[10px] text-stone-400">{FEEDBACK_COPY.gaugeBasis}</p>
    </section>
  );
}
