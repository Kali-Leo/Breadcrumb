/**
 * Purpose: the discovery feed's card-batch LLM contract (spec 051 §5) — prompt assembly for
 * generating 12 knowledge cards at once, and the Zod schema that validates the strict-JSON
 * response before anything downstream touches it.
 * Main exports: CardBatchPromptInput, GeneratedCard, cardBatchSchema, buildCardBatchMessages.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import { z } from "zod";

export interface CardBatchPromptInput {
  /** User's top interest topics (positive-centroid neighborhood) — roughly half the batch. */
  exploitTopics: string[];
  /** Thompson-sampled explore topics — roughly a quarter of the batch. */
  exploreTopics: string[];
  /** Knowledge-graph neighbor topics — roughly a quarter of the batch. */
  graphNeighborTopics: string[];
  /** Recently shown titles, newest first — avoid repeating or near-duplicating these. */
  recentTitles: string[];
  /** Concepts the user already has in their knowledge tree — avoid re-teaching these. */
  knownConcepts: string[];
  /** Topics the user explicitly rejected ("不感兴趣") — the batch must avoid them entirely. */
  dislikedTopics: string[];
  /** True for the empty-history cold-start batch: ignores every topic list above and asks
   * for maximum cross-domain diversity instead. */
  starter: boolean;
}

export const cardBatchSchema = z.object({
  cards: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(24),
        hook: z.string().trim().min(1).max(40),
        topicLabel: z.string().trim().min(1).max(30),
      }),
    )
    .min(1)
    .max(12),
});

export type CardBatchResult = z.infer<typeof cardBatchSchema>;
export type GeneratedCard = CardBatchResult["cards"][number];

const SYSTEM_PROMPT = `你是一个知识卡片编辑，为学习者生成一批可点开阅读的知识卡片。严格按以下 JSON 结构返回，不要输出任何多余文字：
{"cards":[{"title":"标题","hook":"一句话钩子","topicLabel":"所属主题"}]}

规则：
- 必须恰好返回 12 张卡片
- title：不超过24个字，禁止标题党式夸张用语，禁止使用感叹号
- hook：一句平实的话，不超过40字，让完全不了解背景的陌生人也能看懂在说什么，不使用夸张或煽动语气
- topicLabel：一个简短的名词短语，标出这张卡片所属的主题
- 语气：平实陈述，不使用夸赞词，不制造紧迫感或焦虑`;

function formatList(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "（无）";
}

/** Assembles the card-batch prompt. In starter mode, the topic-distribution section is
 * replaced with a cross-domain-diversity instruction and exploit/explore/graphNeighbor topics
 * are never mentioned — but recentTitles and knownConcepts are always included, since those
 * dedup/avoid constraints apply regardless of how new the user is. */
export function buildCardBatchMessages(input: CardBatchPromptInput): ChatMessage[] {
  const sections: string[] = [];

  if (input.starter) {
    sections.push(
      "这是一个全新用户，还没有任何兴趣或已掌握记录。忽略主题分布要求，让这批卡片尽量跨领域多样化" +
        "（科学、历史、艺术、日常生活、技术等都要覆盖），用于观察用户会对哪些领域感兴趣。",
    );
  } else {
    sections.push(
      [
        "本批卡片按以下主题来源大致分配数量：",
        `- 兴趣头部主题（约占一半）：\n${formatList(input.exploitTopics)}`,
        `- 探索主题（约占四分之一）：\n${formatList(input.exploreTopics)}`,
        `- 知识图谱邻域主题（约占四分之一）：\n${formatList(input.graphNeighborTopics)}`,
      ].join("\n"),
    );
  }

  sections.push(`近期已出现过的标题，避免重复或高度相似：\n${formatList(input.recentTitles)}`);
  sections.push(`用户已掌握的概念，避免重新讲解：\n${formatList(input.knownConcepts)}`);
  if (input.dislikedTopics.length > 0) {
    sections.push(`用户明确表示不感兴趣的主题，完全避开：\n${formatList(input.dislikedTopics)}`);
  }

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: sections.join("\n\n") },
  ];
}
