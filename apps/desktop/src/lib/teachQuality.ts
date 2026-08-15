/**
 * Purpose: teach-back explanation quality → mastery evidence (vision/09 #2). After each
 * round in a teach conversation, one metered call judges the learner's explanation
 * (principled / surface / flawed, Chi's distinction); principled and surface land as
 * high-weight mastery claims on the topic's node. Fails soft into ai_failures.
 * Side effect on import: subscribes to chat:responseFinished.
 * Main exports: judgeTeachRound (exported for reuse; subscription wires it).
 */
import { chatJson } from "@breadcrumb/core-llm";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { z } from "zod";
import { appEventBus, useChatStore } from "../stores/chatStore";
import { useKnowledgeStore } from "../stores/knowledgeStore";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { recordMeteredCall } from "./metering";
import { teachTopicFromTitle } from "./teachActions";
import { newId, nowIso } from "./time";

const verdictSchema = z.object({
  /** principled = explains why/how with the underlying idea; surface = correct retelling;
   * flawed = contains a real error or misconception. */
  grade: z.enum(["principled", "surface", "flawed"]),
  reason: z.string().max(200),
});

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
    topic = (JSON.parse(stateRow.state_json) as { topic?: string }).topic ?? "";
    if (topic === "") return;
  } else {
    return;
  }
  const node = useKnowledgeStore.getState().nodes.find((n) => n.label === topic);
  if (node === undefined) return;
  const explanation = [...useChatStore.getState().messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  if (explanation === undefined || explanation.trim().length < 20) return;

  try {
    const config = { ...settings.apiConfig, fetchImpl: tauriFetch };
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
    if (parsed.grade === "flawed") return; // no positive evidence; the student's follow-up probes it
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
  }
}

// One judgment per completed teach round — silent, metered, switchable.
appEventBus.on("chat:responseFinished", ({ conversationId }) => {
  void judgeTeachRound(conversationId);
});
