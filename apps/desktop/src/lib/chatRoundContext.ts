/**
 * Purpose: non-companion send-round helpers split out of chatStore.ts to keep sendMessage
 * under the file-size cap — lazy 'chat' conversation creation, the anchored-node system
 * line, and the learner-context injection (spec 038 §2.3). No companion-specific logic here.
 * Main exports: ensureChatConversationId, buildAnchoredNodeSystemMessage,
 * buildLearnerContextSystemMessage.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import {
  detectConfusion,
  formatLearnerContextMessage,
  type LearnerContext,
} from "@breadcrumb/core-teaching";
import { aggregateStyles } from "@breadcrumb/plugin-interest";
import { getRepos, type Repos } from "./db";
import { newId, nowIso } from "./time";

/** Returns `existingId` unchanged, or creates a new plain 'chat' conversation and returns its
 * id — companion/teach sessions are always pre-created elsewhere and never hit this path. */
export async function ensureChatConversationId(
  repos: Pick<Repos, "conversations">,
  existingId: string | null,
  content: string,
): Promise<string> {
  if (existingId !== null) return existingId;
  const conversationId = newId();
  const title = content.length > 20 ? `${content.slice(0, 20)}…` : content;
  const createdAt = nowIso();
  await repos.conversations.create({
    id: conversationId,
    title,
    created_at: createdAt,
    updated_at: createdAt,
    kind: "chat",
  });
  return conversationId;
}

/** The currently anchored knowledge node's steering line, or null — dynamic-imports
 * knowledgeStore to avoid a static cycle with chatStore (which imports this module). */
export async function buildAnchoredNodeSystemMessage(): Promise<ChatMessage | null> {
  const { useKnowledgeStore } = await import("../stores/knowledgeStore");
  const knowledge = useKnowledgeStore.getState();
  const anchoredNode = knowledge.nodes.find((node) => node.id === knowledge.anchoredNodeId);
  if (!anchoredNode) return null;
  return {
    role: "system",
    content: `学习者当前锚定的知识点：「${anchoredNode.label}」（${anchoredNode.summary}）。请围绕这个知识点展开回答。`,
  };
}

/** Styles seen only once are noise, not a preference. */
const MIN_STYLE_COUNT = 2;

/** The learner-context system line for this round (spec 038 §2.3): anchored-node retention
 * stance + explanation-style preferences + same-round confusion downshift. Returns null when
 * there is nothing worth injecting. Any data-layer hiccup degrades to a partial (or absent)
 * context rather than blocking the send. */
export async function buildLearnerContextSystemMessage(
  userContent: string,
): Promise<ChatMessage | null> {
  const context: LearnerContext = { confusionDetected: detectConfusion(userContent) };
  try {
    const { useKnowledgeStore } = await import("../stores/knowledgeStore");
    const knowledge = useKnowledgeStore.getState();
    const anchoredNode = knowledge.nodes.find((node) => node.id === knowledge.anchoredNodeId);
    const repos = await getRepos();
    if (anchoredNode) {
      const { useMemoryStore } = await import("../stores/memoryStore");
      const retention = useMemoryStore.getState().retentionByNode.get(anchoredNode.id);
      if (retention !== undefined) {
        context.anchoredNodeLabel = anchoredNode.label;
        context.retention = retention;
        const claims = await repos.masteryClaims.listAll();
        context.hasPrincipledMastery = claims.some(
          (claim) => claim.node_id === anchoredNode.id && claim.level === "taught_principled",
        );
      }
    }
    const signals = await repos.interestSignals.listAll();
    context.preferredStyles = aggregateStyles(signals)
      .filter((ranking) => ranking.count >= MIN_STYLE_COUNT)
      .map((ranking) => ranking.style);
  } catch {
    // Partial context is fine; confusion detection above never throws.
  }
  const content = formatLearnerContextMessage(context);
  return content === null ? null : { role: "system", content };
}
