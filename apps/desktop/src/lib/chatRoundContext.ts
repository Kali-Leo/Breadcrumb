/**
 * Purpose: non-companion send-round helpers split out of chatStore.ts to keep sendMessage
 * under the file-size cap — lazy 'chat' conversation creation, the anchored-node system
 * line, the learner-context injection (spec 038 §2.3), and the silent focus-session context
 * line (Leo 2026-08-14 revision to spec 042 §5). No companion-specific logic here.
 * Main exports: ensureChatConversationId, buildAnchoredNodeSystemMessage,
 * buildLearnerContextSystemMessage, buildFocusContextSystemMessage.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import {
  detectConfusion,
  formatLearnerContextMessage,
  type LearnerContext,
} from "@breadcrumb/core-teaching";
import { buildFocusContextLine } from "@breadcrumb/plugin-explore";
import { aggregateStyles } from "@breadcrumb/plugin-interest";
import { getRepos, type Repos } from "./db";
import { newId, nowIso } from "./time";
import { computeInitialTitle } from "./trailNaming";

/** Returns `existingId` unchanged, or creates a new plain 'chat' conversation and returns its
 * id — companion/teach sessions are always pre-created elsewhere and never hit this path. */
export async function ensureChatConversationId(
  repos: Pick<Repos, "conversations">,
  existingId: string | null,
  content: string,
): Promise<string> {
  if (existingId !== null) return existingId;
  const conversationId = newId();
  const title = computeInitialTitle(content);
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

/** Most recent focus sessions the silent context line quotes (Leo 2026-08-14 revision to spec
 * 042 §5) — enough to remind the model without dumping the learner's whole exploration history
 * into every round. */
const MAX_FOCUS_CONTEXT_SESSIONS = 3;
/** Stations per session line, matching buildFocusContextLine's own default — named here so the
 * cap is visible next to the session cap it pairs with. */
const MAX_FOCUS_CONTEXT_STATIONS = 6;

/** The silent focus-session context line for this round (Leo 2026-08-14 revision to spec 042
 * §5: a session's exit no longer writes a message into the conversation, so the model needs
 * another way to know what the learner already explored). Reads this conversation's most
 * recent ≤3 focus sessions that have at least one answered station, oldest of the three first,
 * one line each via buildFocusContextLine. Returns null when there is nothing to quote. */
export async function buildFocusContextSystemMessage(
  conversationId: string,
): Promise<ChatMessage | null> {
  const repos = await getRepos();
  const sessions = await repos.focusSessions.listByConversation(conversationId);
  const lines: string[] = [];
  // listByConversation is oldest-first; walk newest-first so recency wins under the cap, then
  // reverse back to chronological order below.
  for (let i = sessions.length - 1; i >= 0 && lines.length < MAX_FOCUS_CONTEXT_SESSIONS; i -= 1) {
    const session = sessions[i];
    if (session === undefined) continue;
    const nodes = await repos.focusNodes.listBySession(session.id);
    if (!nodes.some((node) => node.answer_text.length > 0)) continue;
    lines.push(
      buildFocusContextLine(
        session.root_label,
        nodes.map((node) => ({
          id: node.id,
          parentId: node.parent_id,
          kind: node.kind,
          label: node.label,
        })),
        MAX_FOCUS_CONTEXT_STATIONS,
      ),
    );
  }
  if (lines.length === 0) return null;
  lines.reverse();
  return {
    role: "system",
    content: `学习者此前在本对话里的专注探索（供你衔接，不必复述）：\n${lines.join("\n")}`,
  };
}
