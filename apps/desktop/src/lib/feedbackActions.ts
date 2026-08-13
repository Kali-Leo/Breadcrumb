/**
 * Purpose: the 🪞 feedback lab's one interactive side effect — turning a reunion invite into
 * a real chat, zero LLM calls at creation time (spec 035 #4, "最小重启").
 * Main exports: startReunionSession.
 */
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

/** Creates an empty kind='chat' conversation titled after the concept and returns its id —
 * no system prompt, no opening message; the learner picks up the conversation themselves. */
export async function startReunionSession(conceptTitle: string): Promise<string> {
  const repos = await getRepos();
  const conversationId = newId();
  const createdAt = nowIso();
  await repos.conversations.create({
    id: conversationId,
    title: `重逢:${conceptTitle}`,
    created_at: createdAt,
    updated_at: createdAt,
    kind: "chat",
  });
  return conversationId;
}
