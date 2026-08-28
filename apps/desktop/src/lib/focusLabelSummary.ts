/**
 * Purpose: an optional LLM short name for one focus station's label (spec 042 §4 legibility
 * fix) — a raw label longer than 10 characters gets asked for a Chinese short name (<=6
 * characters) so the subway map's truncated text stays readable; a short-enough label or any
 * failure both return null so the caller keeps the raw label unchanged.
 * Side effects: one metered LLM call, billed under the "focus-explain" purpose (reused — this
 * is that station's own explanation request's sibling, not a separate spend line) and one
 * ai_failures row on error.
 * Main exports: summarizeFocusLabel.
 */
import { chatJson } from "@breadcrumb/core-llm";
import { z } from "zod";
import type { ApiConfig } from "../stores/settingsStore";
import { recordAiFailure } from "./failureLog";
import { llmConfigFrom } from "./llmConfig";
import { recordFailedCallUsage, recordMeteredCall } from "./metering";

/** Labels this short already fit the map; asking the model would spend tokens for no visible
 * change. */
const RAW_LABEL_SHORT_ENOUGH = 10;
const shortNameSchema = z.object({ short: z.string() });

export async function summarizeFocusLabel(
  rawLabel: string,
  apiConfig: ApiConfig,
  conversationId: string,
): Promise<string | null> {
  if (rawLabel.length <= RAW_LABEL_SHORT_ENOUGH) return null;
  try {
    const config = llmConfigFrom(apiConfig);
    const { parsed, usage } = await chatJson(
      config,
      [
        {
          role: "user" as const,
          content: `为这段文字起一个不超过 6 个字的中文短名，只输出 JSON：${rawLabel}`,
        },
      ],
      shortNameSchema,
    );
    await recordMeteredCall({
      purpose: "focus-explain",
      model: config.model,
      conversationId,
      usage,
    });
    const short = parsed.short.trim();
    return short.length > 0 ? short : null;
  } catch (error) {
    void recordAiFailure("focus-explain", error);
    void recordFailedCallUsage(error, {
      purpose: "focus-explain",
      model: apiConfig.model,
      conversationId,
    });
    return null;
  }
}
