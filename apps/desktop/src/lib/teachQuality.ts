/**
 * Purpose: teach-back explanation quality → mastery evidence (vision/09 #2). After each
 * round in a teach conversation, one metered call judges the learner's explanation
 * (principled / surface / flawed, Chi's distinction); principled and surface land as
 * high-weight mastery claims on the topic's node, and every verdict — flawed included — lands
 * as one FSRS-graded sighting. Fails soft into ai_failures.
 * Side effect on import: subscribes to chat:responseFinished.
 * Main exports: judgeTeachRound (exported for reuse; subscription wires it).
 */
import type { NodeSightingGrade } from "@breadcrumb/core-db";
import { parseJsonColumn } from "@breadcrumb/core-db";
import { chatJson } from "@breadcrumb/core-llm";
import { KnowledgeStateSchema } from "@breadcrumb/plugin-companion";
import { z } from "zod";
import { appEventBus, useChatStore } from "../stores/chatStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { llmConfigFrom } from "./llmConfig";
import { recordFailedCallUsage, recordMeteredCall } from "./metering";
import { teachTopicFromTitle } from "./teachActions";
import { newId, nowIso } from "./time";

const verdictSchema = z.object({
  /** principled = explains why/how with the underlying idea; surface = correct retelling;
   * flawed = contains a real error or misconception. */
  grade: z.enum(["principled", "surface", "flawed"]),
  reason: z.string().max(200),
});

type TeachVerdictGrade = z.infer<typeof verdictSchema>["grade"];

/** The verdict is a graded retrieval, so it also becomes one FSRS-rated footprint: explaining
 * the principle is an easy retrieval, a correct retelling an ordinary one, and an explanation
 * containing a real error is a failed one. */
const SIGHTING_GRADE_BY_VERDICT: Record<TeachVerdictGrade, NodeSightingGrade> = {
  principled: "easy",
  surface: "good",
  flawed: "again",
};

/** Judges the learner's latest explanation in a teach-back round and records mastery
 * evidence for the matching node (exact label match; no node → no spend). Covers both
 * dedicated teach conversations and teach-back episodes living inside a companion chat
 * (Leo 2026-08-15) — the latter identified by the conversation's knowledge state. */
export async function judgeTeachRound(conversationId: string): Promise<void> {
  const settings = useSettingsStore.getState();
  if (!settings.featureSwitches.teachQuality || !settings.networkEnabled) return;
  if (settings.apiConfig === null) return;
  const repos = await getRepos();
  const conversation = await repos.conversations.getById(conversationId);
  if (conversation === null) return;
  let topic: string;
  if (conversation.kind === "teach") {
    topic = teachTopicFromTitle(conversation.title);
  } else if (conversation.kind === "companion") {
    const stateRow = await repos.companionKnowledgeState.getByConversation(conversationId);
    if (stateRow === null) return;
    // Same schema companionChatPrompt.ts revives this column with — one column, one shape.
    const state = parseJsonColumn(KnowledgeStateSchema, stateRow.state_json);
    if (state === null) return;
    topic = state.topic;
  } else {
    return;
  }
  const node = useKnowledgeStore.getState().nodes.find((n) => n.label === topic);
  if (node === undefined) return;
  const explanation = [...useChatStore.getState().messagesFor(conversationId)]
    .reverse()
    .find((message) => message.role === "user")?.content;
  if (explanation === undefined || explanation.trim().length < 20) return;

  try {
    const config = llmConfigFrom(settings.apiConfig);
    const { parsed, usage } = await chatJson(
      config,
      [
        {
          role: "system",
          content:
            "你是学习科学里的讲解质量判读器。学习者向一位初学者讲解一个主题,请判断这段讲解:" +
            "principled=讲出了原理/为什么;surface=正确但停留在复述;flawed=含有实质性错误。" +
            '只返回 JSON:{"grade":"principled|surface|flawed","reason":"一句话依据"}',
        },
        { role: "user", content: `主题:${topic}\n\n讲解原文:\n${explanation}` },
      ],
      verdictSchema,
    );
    await recordMeteredCall({
      purpose: "teach-quality",
      model: config.model,
      conversationId,
      usage,
    });
    // A teach-back is a retrieval attempt, so every verdict — flawed included — lands as one
    // graded sighting feeding the FSRS estimate (design audit 2026-08-28, 记忆与遗忘模型 #1).
    await repos.nodeSightings.record({
      id: newId(),
      node_id: node.id,
      conversation_id: conversationId,
      message_id: null,
      created_at: nowIso(),
      origin_node_id: null,
      grade: SIGHTING_GRADE_BY_VERDICT[parsed.grade],
    });
    // A flawed explanation still writes no claim and still emits nothing: the negative signal
    // belongs to the internal estimate only, and the student persona's follow-up is what probes
    // the misconception. The 2026-08-28 audit named this boundary as correct — keep it.
    // (memoryStore's post-round refresh picks the sighting up on its own timer.)
    if (parsed.grade === "flawed") return;
    await repos.masteryClaims.insert({
      id: newId(),
      node_id: node.id,
      level: parsed.grade === "principled" ? "taught_principled" : "taught_surface",
      source: "teach-back",
      created_at: nowIso(),
    });
    appEventBus.emit("mastery:updated", { changedNodeIds: [node.id] });
  } catch (error) {
    void recordAiFailure("teach-quality", error);
    void recordFailedCallUsage(error, {
      purpose: "teach-quality",
      model: settings.apiConfig.model,
      conversationId,
    });
  }
}

// One judgment per completed teach round — silent, metered, switchable.
appEventBus.on("chat:responseFinished", ({ conversationId }) => {
  void judgeTeachRound(conversationId);
});
