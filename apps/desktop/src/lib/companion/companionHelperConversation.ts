/**
 * Purpose: the daily helper character's own conversation lifecycle (spec 050 §9) — its
 * locally-composed invitation and thanks messages, creating its teach conversation, and
 * appending the goodbye once its concept is confirmed. Split out of companionActions.ts
 * purely to keep that file under the file-size ceiling; the fixed cast's card lookup,
 * chat opening, script seeding and system prompt stay there.
 * Side effects: DB writes on startHelperConversation / appendHelperThanks.
 * Main exports: helperInvitation, helperThanks, startHelperConversation, appendHelperThanks.
 */
import i18next from "i18next";
import { asStoredText } from "../../i18n/storedText";
import { newestLeafId } from "../chat/messageTree";
import { getRepos } from "../platform/db";
import { newId, nowIso } from "../platform/time";
import { teachConversationTitle } from "./teachActions";

/** The helper's own chat messages, composed locally with zero LLM calls and written into the
 * conversation — so, like the teach opener, they are rendered here at creation time rather
 * than at display time, and go through asStoredText because they become database rows and
 * part of every prompt built from that conversation. */
export function helperInvitation(topic: string): string {
  return asStoredText(i18next.t("chat:companion.helperInvitation", { topic }));
}

export function helperThanks(topic: string): string {
  return asStoredText(i18next.t("chat:companion.helperThanks", { topic }));
}

/** Creates a daily helper's conversation (spec 050 §9): kind 'teach' so the whole proven
 * teach-back pipeline (student prompt from the title's topic, quality judgment, metering)
 * applies untouched; companion_id links it to its roster row. The opener is the helper's
 * plain ask-for-help message. Returns the existing conversation when one already exists. */
export async function startHelperConversation(helperId: string, topic: string): Promise<string> {
  const repos = await getRepos();
  const existing = await repos.conversations.findLatestByCompanion(helperId, "teach");
  if (existing !== null) return existing.id;
  const conversationId = newId();
  const createdAt = nowIso();
  await repos.conversations.create({
    id: conversationId,
    title: teachConversationTitle(topic),
    created_at: createdAt,
    updated_at: createdAt,
    kind: "teach",
    companion_id: helperId,
  });
  await repos.messages.append({
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content: helperInvitation(topic),
    created_at: createdAt,
    teaching_mode: null,
    parent_id: null,
  });
  return conversationId;
}

/** The helper's goodbye once its concept is confirmed (or the day's help is done) — after
 * this the roster row resolves and the character leaves (spec 050 §9). */
export async function appendHelperThanks(conversationId: string, topic: string): Promise<void> {
  const repos = await getRepos();
  const allMessages = await repos.messages.listByConversation(conversationId);
  const thanks = {
    id: newId(),
    conversation_id: conversationId,
    role: "assistant" as const,
    content: helperThanks(topic),
    created_at: nowIso(),
    teaching_mode: null,
    parent_id: newestLeafId(allMessages),
  };
  await repos.messages.append(thanks);
  await repos.conversations.touch(conversationId, thanks.created_at);
  const { useChatStore } = await import("../../stores/chatStore");
  useChatStore.getState().noteExternalMessage(conversationId, thanks);
}
