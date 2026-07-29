/**
 * Purpose: headless trail logic — day boundaries, and the gentle daily-summary contract.
 * Tone rule (product principle 1): summaries only celebrate what WAS learned; they never
 * mention gaps, streaks or "you haven't...". Main exports: localDayRange, localDateString,
 * trailSummarySchema, buildTrailSummaryMessages.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

/** "2026-07-29" for the local calendar day containing the given date. */
export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** [startIso, endIso) covering the local calendar day offset by dayOffset (0=today, -1=yesterday). */
export function localDayRange(now: Date, dayOffset: number): { fromIso: string; toIso: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + dayOffset);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { fromIso: start.toISOString(), toIso: end.toISOString() };
}

export const trailSummarySchema = z.object({
  /** One warm sentence, <= 60 chars, celebrating what was learned. */
  summary: z.string().min(1).max(120),
});

const SYSTEM_PROMPT = `你是一个温柔的学习见证者。根据学习者昨天学到的知识点列表，写一句 40 字以内的中文总结，
像朋友一样为他们高兴。只赞美已完成的（"你搞懂了…还理清了…"），绝对禁止提及未完成、天数、频率或任何施压内容。
以 JSON 返回：{"summary":"..."}`;

export function buildTrailSummaryMessages(nodes: readonly KnowledgeNodeRow[]): ChatMessage[] {
  const nodeList = nodes.map((node) => `- ${node.label}：${node.summary}`).join("\n");
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `昨天学到的知识点：\n${nodeList}` },
  ];
}
