/**
 * Purpose: the knowledge-state half of companion prompt assembly — Reflect-Respond over the
 * stored teach-back knowledge state, both for a dedicated teach session and for a live
 * teach-back episode inside the companion's own chat. Split out of companionChatPrompt.ts
 * purely to keep that file under the file-size ceiling; the persona/identity half and the
 * per-round aggregator stay there.
 * Side effects: may write companion_knowledge_state.
 * Main exports: buildCompanionTeachBackIfActive, buildCompanionTeachSystemMessages.
 */

import type { ConversationRow } from "@breadcrumb/core-db";
import { parseJsonColumn } from "@breadcrumb/core-db";
import type { ChatMessage } from "@breadcrumb/core-llm";
import { chatJson } from "@breadcrumb/core-llm";
import {
  applyReflection,
  buildReflectUserMessage,
  buildStudentSystemPrompt,
  type KnowledgeState,
  KnowledgeStateSchema,
  REFLECT_PROMPT,
  ReflectResultSchema,
} from "@breadcrumb/feature-companion";
import type { ApiConfig } from "../../stores/settingsStore";
import { recordMeteredCall } from "../billing/metering";
import { getRepos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { llmConfigFrom } from "../platform/llmConfig";
import { nowIso } from "../platform/time";
import { getCompanionCardById } from "./companionActions";
import { buildTeachSystemPrompt, teachTopicFromTitle } from "./teachActions";

/** How long a companion conversation's knowledge state keeps the chat in teach-back mode
 * after its last update. Reflection refreshes the timestamp every round, so an active
 * teach-back keeps extending; after this much quiet the companion returns to ordinary chat
 * (the invitation flow can start a fresh episode any time). */
const TEACH_EPISODE_IDLE_HOURS = 6;

/** kind 'companion' with a live teach-back: the same Reflect-Respond student mode, or null
 * when there is no fresh knowledge state (the caller then builds the plain chat prompt). */
export async function buildCompanionTeachBackIfActive(
  conversation: ConversationRow,
  userContent: string,
  apiConfig: ApiConfig,
  companionScriptEnabled: boolean,
): Promise<ChatMessage[] | null> {
  const companionId = conversation.companion_id;
  if (companionId === null || !companionScriptEnabled) return null;
  const card = getCompanionCardById(companionId);
  if (card === undefined) return null;
  const repos = await getRepos();
  const stateRow = await repos.companionKnowledgeState.getByConversation(conversation.id);
  if (stateRow === null) return null;
  const idleHours = (Date.parse(nowIso()) - Date.parse(stateRow.updated_at)) / 3_600_000;
  if (idleHours > TEACH_EPISODE_IDLE_HOURS) return null;
  const state = parseJsonColumn(KnowledgeStateSchema, stateRow.state_json);
  if (state === null) return null; // an unreadable state is no live episode, not a thrown chat
  return reflectAndBuildStudentMessage(conversation, card, state, userContent, apiConfig);
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
  const state = parseJsonColumn(KnowledgeStateSchema, stateRow.state_json);
  if (state === null) return fallback(); // corrupt state degrades to the generic teach prompt
  return reflectAndBuildStudentMessage(conversation, card, state, userContent, apiConfig);
}

/** The shared Reflect-Respond core: merge this round's explanation into the stored state,
 * then constrain the student's reply to that state. */
async function reflectAndBuildStudentMessage(
  conversation: ConversationRow,
  card: NonNullable<ReturnType<typeof getCompanionCardById>>,
  storedState: KnowledgeState,
  userContent: string,
  apiConfig: ApiConfig,
): Promise<ChatMessage[]> {
  const repos = await getRepos();
  let state = storedState;
  try {
    const config = llmConfigFrom(apiConfig);
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
