/**
 * Purpose: turning a frontier candidate into a real chat (spec 047 "从这里继续") — zero LLM
 * calls at creation time, seeded with a local opener so both the learner and the model know
 * why this concept came up (same purposeful-entry pattern as reunion/teach/practice).
 * Main exports: startFrontierSession, frontierOpener.
 */
import i18next from "i18next";
import { asStoredText } from "../i18n/storedText";
import { getRepos } from "./db";
import { newId, nowIso } from "./time";

/** Plain, suggest-only opener: names the concept and (when present) the already-mastered
 * neighbours that make it reachable — never "you should" or "you're behind". Stored text:
 * this becomes a message row and part of the model's context, so it carries no isolates. */
export function frontierOpener(label: string, litPrerequisiteLabels: readonly string[]): string {
  if (litPrerequisiteLabels.length > 0) {
    return asStoredText(
      i18next.t("palace:frontier.openerWithPrereq", {
        label,
        labels: litPrerequisiteLabels.join(i18next.t("common:list.separator")),
      }),
    );
  }
  return asStoredText(i18next.t("palace:frontier.opener", { label }));
}

/** Creates a kind='chat' conversation titled after the concept, seeded with the local
 * opener; returns its id. Navigation and chat-store refresh stay with the caller. */
export async function startFrontierSession(
  label: string,
  litPrerequisiteLabels: readonly string[],
): Promise<string> {
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
  await repos.messages.append({
    id: newId(),
    conversation_id: conversationId,
    role: "assistant",
    content: frontierOpener(label, litPrerequisiteLabels),
    created_at: createdAt,
    teaching_mode: null,
    parent_id: null,
  });
  return conversationId;
}
