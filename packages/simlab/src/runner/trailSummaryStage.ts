/**
 * Purpose: generates one gentle trail summary per virtual day that had new nodes (mirrors the
 * app's daily-summary feature) and scans it against the pressure lexicon — spec 013 T4
 * requires every user-visible text-generation path be scanned, trail summaries included.
 * Main exports: runTrailSummaryStage.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { chatJson, type LlmClientConfig, type TokenUsage } from "@breadcrumb/core-llm";
import { buildTrailSummaryMessages, trailSummarySchema } from "@breadcrumb/plugin-trail";
import { findPressureLexiconHits } from "../judges/pressureLexicon";
import type { RunTelemetry } from "../judges/telemetry";

export interface TrailSummaryStageInput {
  day: number;
  nodesLearnedToday: readonly KnowledgeNodeRow[];
  llmConfig: LlmClientConfig;
  telemetry?: RunTelemetry;
  logStage: (record: Record<string, unknown>) => void;
  recordCall: (model: string, usage: TokenUsage) => void;
}

export async function runTrailSummaryStage(input: TrailSummaryStageInput): Promise<void> {
  if (input.nodesLearnedToday.length === 0) return;
  try {
    const messages = buildTrailSummaryMessages(input.nodesLearnedToday);
    const { parsed, usage } = await chatJson(input.llmConfig, messages, trailSummarySchema);
    input.recordCall(input.llmConfig.model, usage);
    input.telemetry?.ledger.recordSuccess("trail-summary");
    input.logStage({ purpose: "trail-summary", request: messages, response: parsed });

    if (input.telemetry) {
      const hits = findPressureLexiconHits(parsed.summary, input.telemetry.pressureLexicon);
      if (hits.length > 0) {
        input.telemetry.onPressureHit({
          source: "trail-summary",
          day: input.day,
          text: parsed.summary,
          hits,
        });
      }
    }
  } catch (error) {
    input.telemetry?.ledger.recordFailure("trail-summary");
    input.logStage({
      purpose: "trail-summary",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
