/**
 * Purpose: the teach-back experiment (spec 034) — copy, the student-role system prompt,
 * review-candidate picking, and session creation. The opener is composed locally (zero
 * LLM calls); mastery signals free-ride the existing knowledge-tree pipeline.
 * Side effects: DB writes on startTeachSession.
 * Main exports: teachOpener, teachConversationTitle, buildTeachSystemPrompt,
 * pickTeachCandidates, startTeachSession.
 */
import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import i18next from "i18next";
import { asStoredText } from "../i18n/storedText";
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

/** The teach-back wording lives in learning.json under teach.*; "回讲" was ruled unreadable
 * jargon (Leo 2026-08-15) and the user-facing family is "换你讲". The opener is composed
 * locally with no LLM call (spec 034 验收 1) and written into the conversation, so it is
 * rendered here rather than at display time. */
export function teachOpener(topic: string): string {
  return asStoredText(i18next.t("learning:teach.opener", { topic }));
}

/** The title a teach conversation is stored under. Exported because two entry points create
 * one, and because a stored title has to be one string, spelled one way. */
export function teachConversationTitle(topic: string): string {
  return asStoredText(i18next.t("learning:teach.conversationTitle", { topic }));
}

/** Student-role system prompt: one positive instruction block (tone contract 2026-08-02). */
export function buildTeachSystemPrompt(topic: string): string {
  return (
    `你是一位认真的初学者,正在向学习者请教「${topic}」。你确实不熟悉这个主题,` +
    "由对方来讲解。语气平实,一次只问一个具体的问题;哪里没听懂或觉得有跳步,就直说;" +
    "多问「为什么」和「如果…会怎样」,把讲解往原理上引;不评判、不夸赞、不替对方下结论。" +
    "当你觉得听懂了,用自己的话把理解复述一遍,并说明还有哪里不确定。保持简短。"
  );
}

/** Highest review worth first — expected FSRS gain of retrieving this concept now, plus
 * rescue for the long overdue (plugin-memory/reviewPriority.ts). Not lowest retention first:
 * an almost-forgotten concept has the least to gain and the least chance of being retold
 * (design audit 2026-08-28, D2; Leo 2026-09-01 ruled to change it). */
export function pickTeachCandidates(
  nodes: readonly KnowledgeNodeRow[],
  reviewPriorityByNode: ReadonlyMap<string, number>,
  limit: number,
): KnowledgeNodeRow[] {
  return nodes
    .filter((node) => reviewPriorityByNode.has(node.id))
    .sort(
      (a, b) =>
        (reviewPriorityByNode.get(b.id) ?? 0) - (reviewPriorityByNode.get(a.id) ?? 0) ||
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
    title: teachConversationTitle(topic),
    created_at: createdAt,
    updated_at: createdAt,
    kind: "teach",
  });
  await repos.messages.append({
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content: teachOpener(topic),
    created_at: createdAt,
    teaching_mode: null,
    parent_id: null,
  });
  return conversationId;
}

/** The teach topic lives in the title (`换你讲·<topic>`; the retired `回讲·` prefix stays
 * parseable so old conversations keep working) — zero-schema by design. */
export function teachTopicFromTitle(title: string): string {
  // The prefix is written in whatever language was active, so the separator is what we
  // parse — it survives translation, and it still reads the two historical prefixes.
  const separatorIndex = title.indexOf("·");
  return separatorIndex >= 0 ? title.slice(separatorIndex + 1).trim() : title;
}
