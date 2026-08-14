/**
 * Purpose: builds the system-prompt messages for companion-flavored chat and teach-back
 * sessions inside chatStore's send pipeline — memory retrieval, Reflect-Respond, and the
 * companion identity prompt all live here so chatStore.ts stays under the file-size cap.
 * Side effects: touches companion_memories.last_accessed_at; may write companion_knowledge_state.
 * Main exports: buildCompanionChatSystemMessage, buildCompanionTeachSystemMessages.
 */

import type { ConversationKind, ConversationRow } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildReunionSystemLine,
  buildTeachingSystemPrompt,
  isReunionTitle,
  reunionTopicFromTitle,
} from "@breadcrumb/core-teaching";
import {
  applyReflection,
  buildReflectUserMessage,
  buildStudentSystemPrompt,
  KnowledgeStateSchema,
  REFLECT_PROMPT,
  ReflectResultSchema,
  retrieveMemories,
} from "@breadcrumb/plugin-companion";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { ApiConfig } from "../stores/settingsStore";
import {
  buildCompanionChatSystemPrompt,
  COMPANION_DESKTOP_COPY,
  getCompanionCardById,
} from "./companionActions";
import type { Repos } from "./db";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";
import { buildTeachSystemPrompt, teachTopicFromTitle } from "./teachActions";
import { nowIso } from "./time";

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

/** kind 'teach' — with a companion_id, runs Reflect-Respond (merging this round's user
 * explanation into the stored knowledge state) before answering only from that state; without
 * a knowledge state, a disabled script switch, or an unknown card, falls back unchanged to
 * spec-034's generic teach prompt. A reflect-step failure degrades to the pre-round state
 * rather than blocking the reply. */
export async function buildCompanionTeachSystemMessages(
  conversation: ConversationRow,
  userContent: string,
  apiConfig: ApiConfig,
  companionScriptEnabled: boolean,
): Promise<ChatMessage[]> {
  const fallback = (): ChatMessage[] => [
    { role: "system", content: buildTeachSystemPrompt(teachTopicFromTitle(conversation.title)) },
  ];

  const companionId = conversation.companion_id;
  if (companionId === null) return fallback();
  const card = getCompanionCardById(companionId);
  if (card === undefined || !companionScriptEnabled) return fallback();

  const repos = await getRepos();
  const stateRow = await repos.companionKnowledgeState.getByConversation(conversation.id);
  if (stateRow === null) return fallback();

  let state = KnowledgeStateSchema.parse(JSON.parse(stateRow.state_json));
  try {
    const config = { ...apiConfig, fetchImpl: tauriFetch };
    const { parsed, usage } = await chatJson(
      config,
      [
        { role: "system", content: REFLECT_PROMPT },
        { role: "user", content: buildReflectUserMessage(state, userContent) },
      ],
      ReflectResultSchema,
    );
    await recordMeteredCall({
      purpose: "companion-script",
      model: config.model,
      conversationId: conversation.id,
      usage,
    });
    state = applyReflection(state, parsed);
    await repos.companionKnowledgeState.upsert(conversation.id, JSON.stringify(state), nowIso());
  } catch (error) {
    await recordAiFailure("companion-script", error);
  }
  return [{ role: "system", content: buildStudentSystemPrompt(card, state) }];
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
}): Promise<ChatMessage[]> {
  const { repos, activeKind, conversationId, content, apiConfig } = params;
  // Fetched for every kind now: chat needs the title to spot reunion sessions (spec 038 §2.4).
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
    messages.push(
      await buildCompanionChatSystemMessage(row, content, params.companionMemoryEnabled),
    );
  } else {
    messages.push({ role: "system", content: buildTeachingSystemPrompt() });
    if (row !== null && isReunionTitle(row.title)) {
      messages.push({
        role: "system",
        content: buildReunionSystemLine(reunionTopicFromTitle(row.title)),
      });
    }
  }
  if (params.crisisActive) {
    messages.push({ role: "system", content: COMPANION_DESKTOP_COPY.crisisInterruptSystemLine });
  }
  return messages;
}
