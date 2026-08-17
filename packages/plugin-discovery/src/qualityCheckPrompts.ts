/**
 * Purpose: the discovery feed's batch quality-check LLM contract (spec 053 §5) — one prompt
 * per fetched batch that reads title + summary only and rates how much real substance each
 * item promises, plus the Zod schema that validates the strict-JSON response. The score only
 * ever demotes an item in ranking; nothing is hidden because of it (spec 053 §5's
 * transparency rule), so a missing or dropped id is harmless — the caller treats it as
 * "unrated" rather than "bad".
 * Main exports: QualityCheckItem, QUALITY_CHECK_BATCH_CAP, qualityCheckResponseSchema,
 * QualityCheckResponse, buildQualityCheckMessages.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

/** One fetched candidate as the quality check sees it: nothing but its identity and the two
 * fields every channel adapter can fill (spec 053 §1's item contract). */
export interface QualityCheckItem {
  id: string;
  title: string;
  summary: string;
}

/** At most this many items go into one call — a fetched batch is a few dozen items, and one
 * flash-level call per batch is the entire LLM budget this feature is allowed (spec 053 §5).
 * Items past the cap are simply left unrated. */
export const QUALITY_CHECK_BATCH_CAP = 50;

/** Summaries are clipped to this many characters before being sent: full article bodies do
 * not make the "is there anything here" judgment better, they just cost tokens. */
const SUMMARY_CHARS_CAP = 300;
/** Titles are short by nature; this only guards against a pathological feed entry. */
const TITLE_CHARS_CAP = 200;

export const qualityCheckResponseSchema = z.object({
  /** One entry per rated item. The model may return fewer entries than it was given (and may
   * echo an id that no longer matches anything) — both are tolerated by the caller. */
  scores: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        /** 0 = the title and summary promise nothing checkable, 1 = they promise concrete,
         * verifiable content. */
        substance: z.number().min(0).max(1),
      }),
    )
    .max(QUALITY_CHECK_BATCH_CAP),
});

export type QualityCheckResponse = z.infer<typeof qualityCheckResponseSchema>;

const SYSTEM_PROMPT = `你在给一批外部内容做初筛：只看标题和摘要，判断这一条承诺的东西里有没有实质内容。严格只返回 JSON，不要输出任何多余文字：
{"scores":[{"id":"条目的 id","substance":0.0}]}

substance 是 0 到 1 之间的小数：
- 接近 1：标题和摘要给出了具体的事实、数据、做法、经历或论证方向，读者能预期读到可检验的内容
- 0.5 上下：说得清楚但很单薄，或者看不出会展开到什么程度
- 接近 0：只有情绪、悬念、口号、纯广告，或者是自动生成的堆砌；摘要读完仍然不知道在讲什么

判断纪律：
- 只判断"有没有东西"，不判断题材、立场、观点对错、来源大小、文笔好坏；任何领域、任何观点都用同一把尺子
- 条目可能是任何语言（中文、英文或其他），语言本身不影响分数
- 摘要缺失或极短时，只按标题判断，并给偏中间的分数，不要因为信息少就打低分
- 每个输入条目返回一条，id 原样抄回；不要新增条目，不要改写标题`;

function clip(text: string, cap: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > cap ? `${trimmed.slice(0, cap)}…` : trimmed;
}

function formatItem(item: QualityCheckItem): string {
  const summary = clip(item.summary, SUMMARY_CHARS_CAP);
  return [
    `id: ${item.id}`,
    `标题：${clip(item.title, TITLE_CHARS_CAP)}`,
    `摘要：${summary.length > 0 ? summary : "（无摘要）"}`,
  ].join("\n");
}

/** Assembles the batch quality-check call's two messages. Items past QUALITY_CHECK_BATCH_CAP
 * are dropped rather than split into a second call — one batch, one call. */
export function buildQualityCheckMessages(items: readonly QualityCheckItem[]): ChatMessage[] {
  const batch = items.slice(0, QUALITY_CHECK_BATCH_CAP);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `以下是 ${batch.length} 个条目，逐条打分：\n\n${batch.map(formatItem).join("\n\n")}`,
    },
  ];
}
