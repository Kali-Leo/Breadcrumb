/**
 * Purpose: writes a finished focus session's exit record into its host conversation (spec 042
 * §5) — reads the session and its stations, renders the local record text, appends it as an
 * assistant message parented onto the conversation's newest leaf, touches the conversation, and
 * backfills the session's entry_message_id so the record card can reopen it later.
 * Main exports: writeFocusEntry.
 */
import type { FocusNodeRow, MessageRow } from "@breadcrumb/core-db";
import { buildFocusRecordText } from "@breadcrumb/plugin-explore";
import { getRepos } from "./db";
import { newestLeafId } from "./messageTree";
import { newId, nowIso } from "./time";

function toRecordNode(node: FocusNodeRow) {
  return { id: node.id, parentId: node.parent_id, kind: node.kind, label: node.label };
}

/** Writes the exit record and returns its new message id, or null when there is nothing to
 * write (the session is gone, or it never grew past its root station). */
export async function writeFocusEntry(sessionId: string): Promise<string | null> {
  const repos = await getRepos();
  const session = await repos.focusSessions.getById(sessionId);
  if (session === null) return null;
  const nodes = await repos.focusNodes.listBySession(sessionId);
  if (nodes.length === 0) return null;

  const recordText = buildFocusRecordText(session.root_label, nodes.map(toRecordNode));
  const existingMessages = await repos.messages.listByConversation(session.conversation_id);
  const createdAt = nowIso();
  const entryMessage: MessageRow = {
    id: newId(),
    conversation_id: session.conversation_id,
    role: "assistant",
    content: recordText,
    created_at: createdAt,
    teaching_mode: null,
    parent_id: newestLeafId(existingMessages),
  };
  await repos.messages.append(entryMessage);
  await repos.conversations.touch(session.conversation_id, createdAt);
  await repos.focusSessions.setEntryMessage(sessionId, entryMessage.id, createdAt);
  return entryMessage.id;
}
