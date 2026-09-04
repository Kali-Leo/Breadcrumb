/**
 * Purpose: what one call of each metered LLM purpose costs, in tokens, so the spending page
 * can tell a learner what a feature will actually cost them before they switch it on rather
 * than saying "a small charge each time".
 *
 * Every number here was MEASURED, not guessed: apps/desktop/src/lib/billing/purposeUsage.measure.ts
 * runs the real prompt builders over a fixed realistic scenario, and purposeUsage.test.ts
 * re-runs it on every test run, so a prompt change that moves the cost fails the build
 * instead of quietly making this table a lie.
 *
 * Together with modelCatalogue.ts this is the whole cost model: a model's rates times a
 * purpose's token profile is the estimate. Adding a model touches only the model catalogue;
 * changing a prompt touches only this table's measured row.
 *
 * The fixture scenario every row was measured in: 学了约三个月的学习者：知识树 80 个节点，一轮
 * 学习模式问答（提问 ~40 字，回答 ~600 字）。The spending page quotes it to the learner from
 * settings:billing.measurementScenario, translated per language — never from here, or an
 * English interface would print a Chinese sentence in the middle of a paragraph.
 *
 * Main exports: PurposeCadence, PurposeUsage, PURPOSE_USAGE, PURPOSE_CADENCE,
 * estimatePurposeCostMicros.
 */
import type { ModelRates } from "./modelCatalogue";
import { calculateCostMicros } from "./pricing";

/** How often a purpose fires, in the unit the learner counts in. */
export type PurposeCadence =
  /** Once per question-and-answer exchange. */
  | "per-round"
  /** Once per message the learner sends. */
  | "per-message"
  /** Once per assistant answer produced. */
  | "per-answer"
  /** Once when the learner does the thing, and not otherwise. */
  | "on-demand"
  /** Once per item, then cached forever against that item. */
  | "per-item-once"
  /** At most once a calendar day, and only on a day that had learning in it. */
  | "per-day";

export interface PurposeUsage {
  /** Prompt tokens one call sends, from the real builder over the fixture scenario. */
  inputTokens: number;
  /** Completion tokens a typical reply comes back with — a realistic sample, not the
   * schema's ceiling, because costing every call at its cap would overstate the bill. */
  outputTokens: number;
  cadence: PurposeCadence;
}

export const MEASURED_AT = "2026-08-31";

/**
 * Measured token profiles. Purposes absent from this table are ones whose prompts are built
 * inside Tauri-coupled modules and have not been measured yet — the spending page says so
 * rather than showing a number nobody stands behind.
 *
 * Note on `chat`: its prompt is the whole conversation so far, so its input grows with the
 * conversation. The figure is a mid-length exchange (six prior turns). It is also the purpose
 * that benefits most from prefix caching, since that history is an identical prefix every
 * round — the real bill is typically well under this estimate.
 */
export const PURPOSE_USAGE: Readonly<Record<string, PurposeUsage>> = {
  chat: { inputTokens: 1331, outputTokens: 324, cadence: "per-round" },
  "knowledge-tree": { inputTokens: 1335, outputTokens: 64, cadence: "per-round" },
  interest: { inputTokens: 897, outputTokens: 80, cadence: "per-round" },
  "knowledge-edges": { inputTokens: 945, outputTokens: 278, cadence: "per-round" },
  "self-report-mapping": { inputTokens: 524, outputTokens: 46, cadence: "on-demand" },
  "goal-planning": { inputTokens: 661, outputTokens: 424, cadence: "on-demand" },
  factcheck: { inputTokens: 557, outputTokens: 76, cadence: "on-demand" },
  "compare-align": { inputTokens: 515, outputTokens: 213, cadence: "per-item-once" },
  "map-naming": { inputTokens: 161, outputTokens: 32, cadence: "per-item-once" },
  "term-marking": { inputTokens: 570, outputTokens: 22, cadence: "per-answer" },
  "diglot-weave": { inputTokens: 398, outputTokens: 86, cadence: "per-message" },
  "focus-explain": { inputTokens: 395, outputTokens: 223, cadence: "on-demand" },
  "trail-summary": { inputTokens: 220, outputTokens: 26, cadence: "per-day" },
};

/**
 * Cadence for purposes whose prompts live in Tauri-coupled modules, so PURPOSE_USAGE has no
 * measured row for them. Cadence is not a measurement — it is what the feature does — so it
 * can be stated from the call site while the token profile still waits for a harness. With
 * one of these plus enough recorded calls of its own, the spending page can price the feature
 * from the learner's ledger instead of saying it has never been measured.
 *
 * Kept out of PURPOSE_USAGE on purpose: that table's contract is "every number here was
 * measured", and purposeUsage.test.ts enforces it.
 */
export const PURPOSE_CADENCE: Readonly<Record<string, PurposeCadence>> = {
  // The settings page's 测试连接 button: one deliberately tiny request (max_tokens: 1) that
  // only runs when the learner presses it. It costs a rounding error, but it is a real billed
  // call, so it is metered like every other. (lib/billing/connectionTest.ts.)
  "connection-test": "on-demand",
  // The learner asks for a comparison to be built and one proposal call runs; nothing fires
  // on its own. (compareBuildActions.runProposalPipeline — same shape as goal-planning.)
  "compare-profile": "on-demand",
  // The companion's own reply to a message — the companion-side twin of `chat`, billed once
  // per exchange. (chatSendRound.ts picks this purpose when the conversation is a companion.)
  "companion-chat": "per-round",
  // Every finished companion exchange is condensed into one scored observation; the
  // occasional reflection rides on top of that same round.
  // (companionMemoryActions.recordCompanionMemoryForFinishedRound.)
  "companion-memory": "per-round",
  // The reflect pass runs on each teach-back round; the one-off script generation when a
  // teach-back starts is the smaller half. (companionTeachBackPrompt.ts, companionActions.ts.)
  "companion-script": "per-round",
};

/** What one call of this purpose costs at the given rates, or undefined when the purpose has
 * no measured profile — in which case the caller must say "not measured", never show a zero. */
export function estimatePurposeCostMicros(purpose: string, rates: ModelRates): number | undefined {
  const usage = PURPOSE_USAGE[purpose];
  if (usage === undefined) return undefined;
  return calculateCostMicros(
    { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    rates,
  );
}
