/**
 * Purpose: two small non-companion send-round helpers split out of chatStore.ts purely to
 * keep sendMessage under the file-size cap — lazily creating a plain 'chat' conversation on
 * first message, and the anchored-knowledge-node system line. No companion-specific logic here.
 * Main exports: ensureChatConversationId, buildAnchoredNodeSystemMessage.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import type { Repos } from "./db";
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
