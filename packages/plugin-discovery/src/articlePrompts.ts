/**
 * Purpose: the discovery feed's article LLM contract (spec 051 §2) — prompt assembly for
 * lazily generating one card's full Markdown body on first open. Free-text output, no JSON
 * schema (the card body itself is plain user-visible Markdown, cached verbatim).
 * Main exports: ArticleCardInput, buildArticleMessages.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";

export interface ArticleCardInput {
  title: string;
  hook: string;
  topicLabel: string;
}

const SYSTEM_PROMPT = `你是一个知识科普作者，为一张知识卡片撰写完整正文，面向完全不了解背景的陌生人。
要求：
- 用 Markdown 格式，可以使用标题分段
- 字数约 600-900 字
- 先给出具体例子或场景，再展开原理，不要一上来就是抽象定义
- 语气平实但要写得引人入胜；不使用夸赞词，不连续堆砌感叹号（全文最多偶尔用一个，多数句子用句号）
- 结尾用一句话指向一个自然的下一个问题，引发好奇，但不使用"快去了解""赶紧收藏"这类号召式压力语句
- 只输出正文本身，不要输出 JSON、不要用代码块包裹全文`;

export function buildArticleMessages(card: ArticleCardInput): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `请为这张知识卡片撰写正文：\n标题：${card.title}\n钩子：${card.hook}\n主题：${card.topicLabel}`,
    },
  ];
}
