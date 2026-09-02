/**
 * Purpose: headless trail logic — day boundaries, and the plain daily-summary contract. The
 * day boundaries come from @breadcrumb/core-time (2026-09-02): the trail's "yesterday" and
 * the feedback heatmap's cells must cut the calendar at the same instant, and until now that
 * agreement was three byte-identical private copies of the same six lines.
 * Tone rule (product principle 1, 2026-08-02): summaries only state what WAS learned, as
 * fact, without praise or exclamation; they never mention gaps, streaks or "you haven't...".
 * Main exports: localDayRange, localDateString, trailSummarySchema, buildTrailSummaryMessages.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { shiftLocalDays, startOfLocalDay, toLocalDateKey } from "@breadcrumb/core-time";
import { z } from "zod";

/** "2026-07-29" for the local calendar day containing the given date. */
export { toLocalDateKey as localDateString };

/** [startIso, endIso) covering the local calendar day offset by dayOffset (0=today, -1=yesterday). */
export function localDayRange(now: Date, dayOffset: number): { fromIso: string; toIso: string } {
  const start = shiftLocalDays(startOfLocalDay(now), dayOffset);
  const end = shiftLocalDays(start, 1);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

export const trailSummarySchema = z.object({
  /** One plain, factual sentence, <= 60 chars, stating what was learned — no praise. */
  summary: z.string().min(1).max(120),
});

const SYSTEM_PROMPT = `你是一个学习记录者。根据学习者昨天学到的知识点列表，用一句 40 字以内的平实中文陈述昨天学到了什么
（如"昨天你搞懂了X，理清了Y与Z的关系"）。只陈述事实、不评价；绝对禁止提及未完成、天数、频率或任何施压内容。
以 JSON 返回：{"summary":"..."}`;

export function buildTrailSummaryMessages(nodes: readonly KnowledgeNodeRow[]): ChatMessage[] {
  const nodeList = nodes.map((node) => `- ${node.label}：${node.summary}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `昨天学到的知识点：\n${nodeList}` },
  ];
}
