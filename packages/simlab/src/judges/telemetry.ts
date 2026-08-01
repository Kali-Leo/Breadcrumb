/**
 * Purpose: the tripwire hooks threaded through the journey runner — a per-purpose call
 * ledger (feeds zod-failure-rate) and a pressure-lexicon scan callback fired on every
 * user-visible generated string (tutor replies, trail summaries). Optional everywhere so T3's
 * runner works standalone without any judges wiring; the CLI assembles one per run.
 * Main exports: RunTelemetry, PressureHitSample.
 */
import type { CallLedger } from "./callLedger";

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
}
