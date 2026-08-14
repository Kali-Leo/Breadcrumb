/**
 * Purpose: the 🪞 feedback lab's one interactive side effect — turning a reunion invite into
 * a real chat, zero LLM calls at creation time (spec 035 #4, "最小重启").
 * Main exports: startReunionSession.
 */
import { REUNION_TITLE_PREFIX } from "@breadcrumb/core-teaching";
import { reunionOpener } from "@breadcrumb/plugin-feedback";
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

/** Creates a kind='chat' conversation titled after the concept, seeded with a local opener
 * so both the learner and the model know which concept this reunion is about (same context
 * pattern as teach-back and practice discussions); returns its id. */
export async function startReunionSession(conceptTitle: string): Promise<string> {
  const repos = await getRepos();
  const conversationId = newId();
  const createdAt = nowIso();
  await repos.conversations.create({
    id: conversationId,
    title: `${REUNION_TITLE_PREFIX}${conceptTitle}`,
    created_at: createdAt,
    updated_at: createdAt,
    kind: "chat",
  });
  await repos.messages.append({
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content: reunionOpener(conceptTitle),
    created_at: createdAt,
    teaching_mode: null,
    parent_id: null,
  });
  return conversationId;
}
