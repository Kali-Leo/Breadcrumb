/**
 * Purpose: the teach-back experiment (spec 034) — copy, the student-role system prompt,
 * review-candidate picking, and session creation. The opener is composed locally (zero
 * LLM calls); mastery signals free-ride the existing knowledge-tree pipeline.
 * Side effects: DB writes on startTeachSession.
 * Main exports: TEACH_COPY, buildTeachSystemPrompt, pickTeachCandidates, startTeachSession.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

/** All user-visible teach-back strings in one place (plain statements only). */
export const TEACH_COPY = {
  sectionTitle: "回讲(实验)",
  sectionHint: "给一位初学者讲讲你学过的东西。讲出来这件事本身,就是最扎实的复习。",
  freeTopicPlaceholder: "或者自选一个主题",
  startButton: "开讲",
  recentTitle: "最近的回讲",
  /** The student's fixed opener — composed locally, no LLM call (spec 034 验收 1). */
  opener: (topic: string) =>
    `我正在学「${topic}」,还没真正弄懂。可以请你用自己的话给我讲讲吗?从它是什么讲起就好。`,
} as const;

/** Student-role system prompt: one positive instruction block (tone contract 2026-08-02). */
export function buildTeachSystemPrompt(topic: string): string {
  return (
    `你是一位认真的初学者,正在向学习者请教「${topic}」。你确实不熟悉这个主题,` +
    "由对方来讲解。语气平实,一次只问一个具体的问题;哪里没听懂或觉得有跳步,就直说;" +
    "多问「为什么」和「如果…会怎样」,把讲解往原理上引;不评判、不夸赞、不替对方下结论。" +
    "当你觉得听懂了,用自己的话把理解复述一遍,并说明还有哪里不确定。保持简短。"
  );
}

/** Lowest-retention known nodes first — the ones a teach-back helps most. */
export function pickTeachCandidates(
  nodes: readonly KnowledgeNodeRow[],
  retentionByNode: ReadonlyMap<string, number>,
  limit: number,
): KnowledgeNodeRow[] {
  return nodes
    .filter((node) => retentionByNode.has(node.id))
    .sort(
      (a, b) =>
        (retentionByNode.get(a.id) ?? 0) - (retentionByNode.get(b.id) ?? 0) ||
        a.label.localeCompare(b.label),
    )
    .slice(0, limit);
}

/** Creates a teach conversation with the student's local opener; returns its id. */
export async function startTeachSession(topic: string): Promise<string> {
  const repos = await getRepos();
  const conversationId = newId();
  const createdAt = nowIso();
  await repos.conversations.create({
    id: conversationId,
    title: `回讲·${topic}`,
    created_at: createdAt,
    updated_at: createdAt,
    kind: "teach",
  });
  await repos.messages.append({
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content: TEACH_COPY.opener(topic),
    created_at: createdAt,
    teaching_mode: null,
    parent_id: null,
  });
  return conversationId;
}

/** The teach topic lives in the title (`回讲·<topic>`) — zero-schema by design. */
export function teachTopicFromTitle(title: string): string {
  return title.startsWith("回讲·") ? title.slice(3) : title;
}
