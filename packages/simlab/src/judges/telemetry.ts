/**
 * Purpose: the tripwire hooks threaded through the journey runner — a per-purpose call
 * ledger (feeds zod-failure-rate), a pressure-lexicon scan callback fired on every
 * user-visible generated string (tutor replies, trail summaries), and a teaching-discipline
 * check callback fired on every tutor reply. Optional everywhere so T3's runner works
 * standalone without any judges wiring; the CLI assembles one per run.
 * Main exports: RunTelemetry, PressureHitSample.
 */
import type { CallLedger } from "./callLedger";
import type { TeachingDisciplineResult } from "./teachingDiscipline";

export interface PressureHitSample {
  source: "tutor" | "trail-summary";
  day: number;
  conversationId?: string;
  round?: number;
  text: string;
  hits: string[];
}

export interface RunTelemetry {
  ledger: CallLedger;
  pressureLexicon: readonly string[];
  onPressureHit(sample: PressureHitSample): void;
  /** Fired once per tutor reply with that single reply's discipline check (spec 038 §2.6) —
   * the caller accumulates totalReplies/multiQuestionReplies/overlongReplies across the run. */
  onTeachingDisciplineCheck(result: TeachingDisciplineResult): void;
}
