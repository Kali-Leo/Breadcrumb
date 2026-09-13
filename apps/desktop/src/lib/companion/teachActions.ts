/**
 * Purpose: the teach-back experiment — copy, the student-role system prompt,
 * review-candidate picking, and session creation. The opener is composed locally (zero
 * LLM calls); mastery signals free-ride the existing knowledge-tree pipeline.
 * Side effects: DB writes on startTeachSession.
 * Main exports: teachOpener, teachConversationTitle, buildTeachSystemPrompt,
 * pickTeachCandidates, startTeachSession.
 */

import type { KnowledgeNodeRow } from "@breadcrumb/core-db";
import { compareStable } from "@breadcrumb/core-text";
import i18next from "i18next";
import { asStoredText } from "../../i18n/storedText";
import { getRepos } from "../platform/db";
import { newId, nowIso } from "../platform/time";

/** The teach-back wording lives in learning.json under teach.*; "回讲" was ruled unreadable
 * jargon and the user-facing family is "换你讲". The opener is composed
 * locally with no LLM call and written into the conversation, so it is
 * rendered here rather than at display time. */
export function teachOpener(topic: string): string {
  return asStoredText(i18next.t("learning:teach.opener", { topic }));
}

/** The title a teach conversation is stored under. Exported because two entry points create
 * one, and because a stored title has to be one string, spelled one way. */
export function teachConversationTitle(topic: string): string {
  return asStoredText(i18next.t("learning:teach.conversationTitle", { topic }));
}

/** Student-role system prompt, in written register. The identity sentence says once that the
 * student does not know the topic; nothing here describes the shape of a reply. */
export function buildTeachSystemPrompt(topic: string): string {
  return (
    `你是一位初学者,正在向学习者请教「${topic}」,你尚未掌握这个主题。语气平实,` +
    "一次只问一个具体的问题;没有听懂或觉得有跳步就直说;多问为什么与条件改变会如何," +
    "把讲解引向原理;不评判、不夸赞、不替对方下结论。" +
    "听懂后用自己的话复述一遍,并说出仍不确定之处。保持简短。"
  );
}

/** Highest review worth first — expected FSRS gain of retrieving this concept now, plus
 * rescue for the long overdue (feature-memory/reviewPriority.ts). Not lowest retention first:
 * an almost-forgotten concept has the least to gain and the least chance of being retold. */
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
        compareStable(a.label, b.label),
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
