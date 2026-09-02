/**
 * Purpose: companion cast desktop actions (spec 037) — card lookup, opening or continuing a
 * companion chat, the daily helper's own opening message, seeding the teach script for a
 * conversation, and the companion chat system prompt (Leo 2026-08-15: the invitation lives
 * in the chat like any message; replying starts the teach-back there).
 * Side effects: DB writes on openCompanionConversation / startHelperConversation /
 * appendHelperThanks / seedTeachScriptForConversation.
 * Main exports: COMPANION_IDS, COMPANION_DESKTOP_COPY, helperInvitation, helperThanks,
 * getCompanionCardById, openCompanionConversation, startHelperConversation,
 * appendHelperThanks, seedTeachScriptForConversation, buildCompanionChatSystemPrompt.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildScriptUserMessage,
  type CompanionCard,
  initialKnowledgeState,
  loadCompanionCards,
  SCRIPT_PROMPT,
  ScriptResultSchema,
} from "@breadcrumb/feature-companion";
import i18next from "i18next";
import { asStoredText } from "../../i18n/storedText";
import { useSettingsStore } from "../../stores/settingsStore";
import { recordMeteredCall } from "../billing/metering";
import { newestLeafId } from "../chat/messageTree";
import { getRepos } from "../platform/db";
import { recordAiFailure } from "../platform/failureLog";
import { llmConfigFrom } from "../platform/llmConfig";
import { newId, nowIso } from "../platform/time";
import { teachConversationTitle } from "./teachActions";

/** The cast is fixed (spec 037 — three roles, never interchangeable). */
export const COMPANION_IDS = ["shichimi", "pepper", "cumin"] as const;

/** Desktop-only companion prompt text. What the user reads (role tags, the switched-off
 * notice, the dismiss action, the credits line) lives in chat.json under companion.*;
 * what the model reads stays here, authored in Chinese like every other prompt. */
export const COMPANION_DESKTOP_COPY = {
  crisisInterruptSystemLine:
    "学习者提到了伤害自己。放下角色,用一两句平实的话回应:说明你是 AI、帮不上这件事,值得找真的人聊,不展开、不扮演。",
} as const;

let cachedCards: CompanionCard[] | null = null;

function allCompanionCards(): CompanionCard[] {
  cachedCards ??= loadCompanionCards();
  return cachedCards;
}

/** Looks a card up by its lowercased name (e.g. "shichimi") — the id used everywhere else
 * (conversations.companion_id, companion_memories.companion_id, sidebar routing). */
export function getCompanionCardById(companionId: string): CompanionCard | undefined {
  return allCompanionCards().find((card) => card.data.name.toLowerCase() === companionId);
}

/** Opens the companion's most recent 'companion' conversation, creating one with the card's
 * first_mes appended locally (zero LLM) if none exists yet. */
export async function openCompanionConversation(companionId: string): Promise<string> {
  const repos = await getRepos();
  const existing = await repos.conversations.findLatestByCompanion(companionId, "companion");
  if (existing !== null) return existing.id;

  const card = getCompanionCardById(companionId);
  if (card === undefined) throw new Error(`unknown companion id: ${companionId}`);

  const conversationId = newId();
  const createdAt = nowIso();
  await repos.conversations.create({
    id: conversationId,
    title: card.data.name,
    created_at: createdAt,
    updated_at: createdAt,
    kind: "companion",
    companion_id: companionId,
  });
  await repos.messages.append({
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content: card.data.first_mes,
    created_at: createdAt,
    teaching_mode: null,
    parent_id: null,
  });
  return conversationId;
}

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

/** Generates the teach-back script and seeds this conversation's knowledge state (spec 037's
 * script-first machinery, now running inside the companion chat). Silent no-op when the
 * script switch is off / offline / unconfigured; a generation failure is recorded and the
 * teach-back proceeds stateless (plain companion chat). */
export async function seedTeachScriptForConversation(
  conversationId: string,
  topic: string,
  knownNodeLabels: readonly string[],
): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.companionScript || !settings.networkEnabled || !settings.apiConfig)
    return;
  try {
    const repos = await getRepos();
    const config = llmConfigFrom(settings.apiConfig);
    const { parsed, usage } = await chatJson(
      config,
      [
        { role: "system", content: SCRIPT_PROMPT },
        { role: "user", content: buildScriptUserMessage(topic, knownNodeLabels) },
      ],
      ScriptResultSchema,
    );
    await recordMeteredCall({
      purpose: "companion-script",
      model: config.model,
      conversationId,
      usage,
    });
    const state = initialKnowledgeState(topic, parsed);
    await repos.companionKnowledgeState.upsert(conversationId, JSON.stringify(state), nowIso());
  } catch (error) {
    await recordAiFailure("companion-script", error);
  }
}

/** Companion chat system prompt: identity + explicit AI disclosure, the tone contract, then
 * retrieved memories when there are any. One positive-instruction block (tone contract
 * 2026-08-02) — mirrors buildTeachSystemPrompt/buildStudentSystemPrompt's register. */
export function buildCompanionChatSystemPrompt(
  card: CompanionCard,
  retrievedMemories: readonly string[],
): string {
  const { name, description, personality, scenario } = card.data;
  const competenceNote = card.data.extensions.breadcrumb.competenceNote;
  const memoryLine =
    retrievedMemories.length > 0
      ? `你记得关于这位学习者的这些事:${retrievedMemories.join(";")}。`
      : "";
  return (
    `你是 ${name}。${description}${personality}${scenario}你与学习者的水平关系:${competenceNote}。` +
    "你是明示的 AI 学习伙伴,被问起是不是 AI 时如实承认。语气平实,不评判、不夸赞、不施压;" +
    `告别时就平静地告别,不做任何挽留或追问。${memoryLine}`
  ).trim();
}
