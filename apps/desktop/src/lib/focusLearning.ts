/**
 * Purpose: opening a learning session from a recommendation (spec 050 §2) — the invitation
 * leads straight into focus mode where the AI starts explaining the concept, instead of an
 * empty chat asking the learner what to talk about. A quiet anchor conversation is created
 * to receive the focus exit record; when the focus-explain switch is off, falls back to a
 * context-seeded chat.
 * Main exports: startLearningForConcept.
 */

import { getRepos } from "./db";
import { startFrontierSession } from "./frontierActions";
import { newId, nowIso } from "./time";

interface StartLearningResult {
  /** "focus" opened the overlay in place; "chat" asks the caller to navigate to the id. */
  mode: "focus" | "chat";
  conversationId: string;
}

export async function startLearningForConcept(
  label: string,
  litPrerequisiteLabels: readonly string[],
  focusExplainEnabled: boolean,
): Promise<StartLearningResult> {
  if (!focusExplainEnabled) {
    return {
      mode: "chat",
      conversationId: await startFrontierSession(label, litPrerequisiteLabels),
    };
  }
  const repos = await getRepos();
  const conversationId = newId();
  const createdAt = nowIso();
  await repos.conversations.create({
    id: conversationId,
    title: label,
    created_at: createdAt,
    updated_at: createdAt,
    kind: "chat",
  });
  const { useChatStore } = await import("../stores/chatStore");
  await useChatStore.getState().loadFromDatabase();
  const { useFocusStore } = await import("../stores/focusStore");
  await useFocusStore.getState().startFromWord(conversationId, label, "", null);
  return { mode: "focus", conversationId };
}
