/**
 * Purpose: a focus session/station's DB writes plus streamed explanation (spec 042 §1-2) —
 * inserts the row up front (so the map always shows the station, even mid-stream), then streams
 * and persists its answer. Shared by focusStore's actions so each stays a short set()-only body.
 * Main exports: insertFocusSession, insertFocusNode, streamFocusNodeAnswer.
 */
import type { FocusNodeKind, FocusNodeRow, FocusSessionRow } from "@breadcrumb/core-db";
import type { FocusPromptMessage } from "@breadcrumb/plugin-explore";
import type { ApiConfig } from "../stores/settingsStore";
import { getRepos } from "./db";
import { streamFocusAnswer } from "./focusExplain";
import { newId, nowIso } from "./time";

/** Creates a session shell — entry_message_id stays NULL until the exit-record flow (spec
 * 042 §5, a later task) fills it in. */
export async function insertFocusSession(
  conversationId: string,
  rootLabel: string,
): Promise<FocusSessionRow> {
  const createdAt = nowIso();
  const session: FocusSessionRow = {
    id: newId(),
    conversation_id: conversationId,
    entry_message_id: null,
    root_label: rootLabel,
    created_at: createdAt,
    updated_at: createdAt,
  };
  const repos = await getRepos();
  await repos.focusSessions.insert(session);
  return session;
}

/** Inserts a station with an empty answer — callers set() it into view immediately, before the
 * stream that fills answer_text has finished. */
export async function insertFocusNode(input: {
  sessionId: string;
  parentId: string | null;
  kind: FocusNodeKind;
  label: string;
  questionText: string | null;
}): Promise<FocusNodeRow> {
  const node: FocusNodeRow = {
    id: newId(),
    session_id: input.sessionId,
    parent_id: input.parentId,
    kind: input.kind,
    label: input.label,
    question_text: input.questionText,
    answer_text: "",
    created_at: nowIso(),
  };
  const repos = await getRepos();
  await repos.focusNodes.insert(node);
  return node;
}

/** Streams one station's answer and persists it. Throws on failure — the caller (focusStore)
 * owns recordAiFailure and the plain error banner. */
export async function streamFocusNodeAnswer(input: {
  nodeId: string;
  messages: readonly FocusPromptMessage[];
  apiConfig: ApiConfig;
  conversationId: string;
  onDelta: (delta: string) => void;
}): Promise<string> {
  const result = await streamFocusAnswer({
    messages: input.messages,
    apiConfig: input.apiConfig,
    conversationId: input.conversationId,
    onDelta: input.onDelta,
  });
  const repos = await getRepos();
  await repos.focusNodes.updateAnswer(input.nodeId, result.content);
  return result.content;
}
