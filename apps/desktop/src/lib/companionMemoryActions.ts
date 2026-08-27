/**
 * Purpose: companion memory-stream orchestration (spec 037) — condenses one finished chat round
 * into an observation, scores its importance (metered), and triggers a reflection once the
 * accumulated importance since the last reflection crosses the threshold. Called from
 * companionStore's chat:responseFinished subscription; never throws (memory must never break
 * chat) — failures degrade silently via recordAiFailure.
 * Main exports: recordCompanionMemoryForFinishedRound.
 */
import { chatJson } from "@breadcrumb/core-llm";
import {
  buildImportanceUserMessage,
  buildObservationContent,
  buildReflectionUserMessage,
  IMPORTANCE_PROMPT,
  ImportanceResultSchema,
  REFLECTION_PROMPT,
  ReflectionResultSchema,
  shouldReflect,
} from "@breadcrumb/plugin-companion";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { llmConfigFrom } from "./llmConfig";
import { recordMeteredCall } from "./metering";
import { newId, nowIso } from "./time";

/** Reflections are already a distilled, high-level insight — worth remembering, but not so
 * heavy that a couple of ordinary observations retrigger reflection right away (threshold 25,
 * observations score 1-10). Fixed rather than LLM-scored to keep reflection zero-extra-cost. */
const REFLECTION_IMPORTANCE = 8;
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

async function lastReflectionCreatedAt(companionId: string): Promise<string> {
  const repos = await getRepos();
  const memories = await repos.companionMemories.listByCompanion(companionId);
  const reflections = memories.filter((memory) => memory.kind === "reflection");
  return reflections.at(-1)?.created_at ?? EPOCH_ISO;
}

/** Writes one observation memory for a finished companion-chat round, then reflects if the
 * accumulated importance since the last reflection has crossed the threshold. No-op when the
 * memory switch, network, or API config aren't all in place, or the conversation isn't a
 * companion chat. */
export async function recordCompanionMemoryForFinishedRound(conversationId: string): Promise<void> {
  const settings = useSettingsStore.getState();
  if (
    !settings.featureSwitches.companionMemory ||
    !settings.networkEnabled ||
    !settings.apiConfig
  ) {
    return;
  }
  const repos = await getRepos();
  const conversation = await repos.conversations.getById(conversationId);
  if (
    conversation === null ||
    conversation.kind !== "companion" ||
    conversation.companion_id === null
  ) {
    return;
  }
  const companionId = conversation.companion_id;

  const messages = await repos.messages.listByConversation(conversationId);
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (lastUser === undefined || lastAssistant === undefined) return;

  try {
    const config = llmConfigFrom(settings.apiConfig);
    const observationContent = buildObservationContent(lastUser.content, lastAssistant.content);
    const { parsed: importanceResult, usage: importanceUsage } = await chatJson(
      config,
      [
        { role: "system", content: IMPORTANCE_PROMPT },
        { role: "user", content: buildImportanceUserMessage(observationContent) },
      ],
      ImportanceResultSchema,
    );
    await recordMeteredCall({
      purpose: "companion-memory",
      model: config.model,
      conversationId,
      usage: importanceUsage,
    });
    const observedAt = nowIso();
    await repos.companionMemories.insert({
      id: newId(),
      companion_id: companionId,
      kind: "observation",
      content: observationContent,
      importance: importanceResult.importance,
      created_at: observedAt,
      last_accessed_at: observedAt,
    });

    const sinceIso = await lastReflectionCreatedAt(companionId);
    const importanceSum = await repos.companionMemories.sumImportanceSince(companionId, sinceIso);
    if (!shouldReflect(importanceSum)) return;

    const allMemories = await repos.companionMemories.listByCompanion(companionId);
    const sinceMs = Date.parse(sinceIso);
    const observationsSince = allMemories.filter(
      (memory) => memory.kind === "observation" && Date.parse(memory.created_at) >= sinceMs,
    );
    const { parsed: reflectionResult, usage: reflectionUsage } = await chatJson(
      config,
      [
        { role: "system", content: REFLECTION_PROMPT },
        { role: "user", content: buildReflectionUserMessage(observationsSince) },
      ],
      ReflectionResultSchema,
    );
    await recordMeteredCall({
      purpose: "companion-memory",
      model: config.model,
      conversationId,
      usage: reflectionUsage,
    });
    const reflectedAt = nowIso();
    for (const insight of reflectionResult.insights) {
      await repos.companionMemories.insert({
        id: newId(),
        companion_id: companionId,
        kind: "reflection",
        content: insight,
        importance: REFLECTION_IMPORTANCE,
        created_at: reflectedAt,
        last_accessed_at: reflectedAt,
      });
    }
  } catch (error) {
    await recordAiFailure("companion-memory", error);
  }
}
