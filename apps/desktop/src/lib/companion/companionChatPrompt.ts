/**
 * Purpose: builds the system-prompt messages for companion-flavored chat and teach-back
 * sessions inside chatStore's send pipeline — the persona half (memory retrieval plus the
 * companion identity prompt) and the per-round aggregator, so chatStore.ts stays under the
 * file-size cap. The knowledge-state half (Reflect-Respond, both in dedicated teach sessions
 * and live teach-back episodes inside the companion's own chat) lives in
 * companionTeachBackPrompt.ts and is re-exported here.
 * Side effects: touches companion_memories.last_accessed_at; may write companion_knowledge_state.
 * Main exports: buildCompanionChatSystemMessage, buildCompanionTeachBackIfActive,
 * buildCompanionTeachSystemMessages, buildRoundSystemMessages.
 */

import type { ConversationKind, ConversationRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { buildFreeChatSystemPrompt, buildTeachingSystemPrompt } from "@breadcrumb/core-teaching";
import { retrieveMemories } from "@breadcrumb/feature-companion";
import type { ApiConfig } from "../../stores/settingsStore";
import type { Repos } from "../platform/db";
import { getRepos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { nowIso } from "../platform/time";
import {
  buildCompanionChatSystemPrompt,
  COMPANION_DESKTOP_COPY,
  getCompanionCardById,
} from "./companionActions";
import {
  buildCompanionTeachBackIfActive,
  buildCompanionTeachSystemMessages,
} from "./companionTeachBackPrompt";
import { buildTeachSystemPrompt, teachTopicFromTitle } from "./teachActions";

export { buildCompanionTeachBackIfActive, buildCompanionTeachSystemMessages };

/** kind 'companion': card identity + top-5 retrieved memories (when the memory switch is on).
 * A retrieval failure degrades to no memories rather than blocking the chat. */
export async function buildCompanionChatSystemMessage(
  conversation: ConversationRow,
  userContent: string,
  companionMemoryEnabled: boolean,
): Promise<ChatMessage> {
  const companionId = conversation.companion_id;
  if (companionId === null) throw new Error("companion conversation missing companion_id");
  const card = getCompanionCardById(companionId);
  if (card === undefined) throw new Error(`unknown companion id: ${companionId}`);

  let retrievedContents: string[] = [];
  if (companionMemoryEnabled) {
    try {
      const repos = await getRepos();
      const memories = await repos.companionMemories.listByCompanion(companionId);
      const now = nowIso();
      const retrieved = retrieveMemories(memories, userContent, now, 5);
      retrievedContents = retrieved.map((memory) => memory.content);
      await repos.companionMemories.touchLastAccessed(
        retrieved.map((memory) => memory.id),
        now,
      );
    } catch (error) {
      await recordAiFailure("companion-memory", error);
    }
  }
  return { role: "system", content: buildCompanionChatSystemPrompt(card, retrievedContents) };
}

/** Every system message for one send-round, in the order chatStore should unshift them:
 * the kind-appropriate identity/instruction prompt(s), then — only when this round's message
 * fired a crisis detection — the out-of-persona interrupt line. Kept as one aggregator so
 * chatStore.ts's sendMessage stays a thin orchestrator under the file-size cap. */
export async function buildRoundSystemMessages(params: {
  repos: Pick<Repos, "conversations">;
  activeKind: ConversationKind;
  conversationId: string;
  content: string;
  apiConfig: ApiConfig;
  companionScriptEnabled: boolean;
  companionMemoryEnabled: boolean;
  crisisActive: boolean;
  /** The session's 学习模式 state (spec 052) — passed from runtime rather than re-read from
   * the row, so a toggle immediately followed by a send can never race a stale read. */
  studyMode: boolean;
}): Promise<ChatMessage[]> {
  const { repos, activeKind, conversationId, content, apiConfig } = params;
  const row = await repos.conversations.getById(conversationId);

  const messages: ChatMessage[] = [];
  if (activeKind === "teach") {
    const teachMessages: ChatMessage[] = row
      ? await buildCompanionTeachSystemMessages(
          row,
          content,
          apiConfig,
          params.companionScriptEnabled,
        )
      : [{ role: "system", content: buildTeachSystemPrompt(teachTopicFromTitle("")) }];
    messages.push(...teachMessages);
  } else if (activeKind === "companion") {
    if (row === null) throw new Error("companion conversation missing");
    // A live teach-back episode inside her own chat (Leo 2026-08-15) takes precedence;
    // otherwise — no fresh state, script switch off — she is simply herself.
    const teachBackMessages = await buildCompanionTeachBackIfActive(
      row,
      content,
      apiConfig,
      params.companionScriptEnabled,
    );
    if (teachBackMessages !== null) messages.push(...teachBackMessages);
    else
      messages.push(
        await buildCompanionChatSystemMessage(row, content, params.companionMemoryEnabled),
      );
  } else {
    // 学习模式 off (spec 052) means a plain chat round carries no teaching program; practice
    // rounds keep the contract — they exist to practice.
    const freeChat = activeKind === "chat" && !params.studyMode;
    messages.push({
      role: "system",
      content: freeChat ? buildFreeChatSystemPrompt() : buildTeachingSystemPrompt(),
    });
  }
  if (params.crisisActive) {
    messages.push({ role: "system", content: COMPANION_DESKTOP_COPY.crisisInterruptSystemLine });
  }
  return messages;
}
