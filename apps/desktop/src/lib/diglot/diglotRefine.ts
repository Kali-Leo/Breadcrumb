/**
 * Purpose: the metered LLM refinement call for the diglot weave (spec 033 T13) — one
 * small chatJson call per woven message: in-context disambiguation + one phrase weave.
 * Fails soft: any error logs to ai_failures and returns the T1 patches unchanged.
 * Side effects: LLM call, metering row (purpose "diglot-weave").
 * Main exports: refineWeavePatches.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  applyLlmRefinement,
  buildLlmRefineMessages,
  type LoadedLanguagePack,
  llmRefineResponseSchema,
  type ReplacementPatch,
} from "@breadcrumb/feature-diglot-weave";
import type { ApiConfig } from "../../stores/settingsStore";
import { recordFailedCallUsage, recordMeteredCall } from "../billing/metering";
import { recordAiFailure } from "../platform/failureLog";
import { llmConfigFrom } from "../platform/llmConfig";

export async function refineWeavePatches(
  apiConfig: ApiConfig,
  loaded: LoadedLanguagePack,
  content: string,
  patches: readonly ReplacementPatch[],
): Promise<ReplacementPatch[]> {
  const wordPatches = patches.filter((patch) => patch.kind === "word");
  if (wordPatches.length === 0) return [...patches];
  try {
    const config = llmConfigFrom(apiConfig);
    const { parsed, usage } = await chatJson(
      config,
      buildLlmRefineMessages({
        content,
        sourceLang: loaded.pack.sourceLang,
        targetLang: loaded.pack.targetLang,
        replacements: wordPatches.map((patch) => ({
          lemma: patch.lemma,
          surface: patch.original,
          target: patch.replacement,
        })),
      }),
      llmRefineResponseSchema,
    );
    await recordMeteredCall({
      purpose: "diglot-weave",
      model: config.model,
      conversationId: null,
      usage,
    });
    return applyLlmRefinement(content, patches, parsed).patches;
  } catch (error) {
    void recordAiFailure("diglot-weave", error);
    void recordFailedCallUsage(error, {
      purpose: "diglot-weave",
      model: apiConfig.model,
      conversationId: null,
    });
    return [...patches];
  }
}
