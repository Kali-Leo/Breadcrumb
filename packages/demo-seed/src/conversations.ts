/**
 * Purpose: the demo seed's 4 hand-written conversations (spec 035 T7b) — two "today" threads
 * (astronomy, JS) whose messages ground a handful of today's node sightings in real user/
 * assistant text, one teach-back thread, and one vocabulary-recap filler thread. The words
 * come from the chosen language's demo text; the timing, the roles and the wiring do not.
 * Main exports: DemoConversationRef, buildDemoConversations.
 */
import type { ConversationRow, MessageRow } from "@breadcrumb/core-db";
import { type Domain, demoId, isoAt, minutesAgo } from "./shared";
import type { ConceptId, DemoText } from "./text/demoText";

export interface DemoConversationRef {
  conversations: ConversationRow[];
  messages: MessageRow[];
  /** conversation id to route a domain's non-today sightings into (message_id null). */
  conversationIdByDomain: Record<Domain, string>;
  /** concept id -> the exact message a today sighting of it should attach to, for the small
   * set of nodes actually discussed in the written dialogue. */
  messageRefById: Map<ConceptId, { conversationId: string; messageId: string; createdAt: string }>;
}

/** `count` instants ending `endMinutesAgo` minutes before `now`, `gapMinutes` apart, oldest
 * first — always in the past regardless of what time of day the script runs, unlike a
 * fixed clock hour ("09:00" could be in the future if run earlier that day). */
function todayTimestamps(
  now: Date,
  endMinutesAgo: number,
  gapMinutes: number,
  count: number,
): string[] {
  return Array.from({ length: count }, (_, index) =>
    minutesAgo(now, endMinutesAgo + (count - 1 - index) * gapMinutes),
  );
}

function buildMessages(
  conversationId: string,
  texts: readonly string[],
  timestamps: readonly string[],
): MessageRow[] {
  return texts.map((content, index) => ({
    id: demoId("msg", `${conversationId}-${index}`),
    conversation_id: conversationId,
    role: index % 2 === 0 ? "user" : "assistant",
    content,
    created_at: timestamps[index] ?? timestamps[timestamps.length - 1] ?? new Date().toISOString(),
    teaching_mode: null,
    parent_id: null,
  }));
}

function conversationRow(
  id: string,
  title: string,
  kind: ConversationRow["kind"],
  messages: readonly MessageRow[],
): ConversationRow {
  const first = messages[0];
  const last = messages[messages.length - 1];
  return {
    id,
    title,
    kind,
    created_at: first?.created_at ?? new Date().toISOString(),
    updated_at: last?.created_at ?? first?.created_at ?? new Date().toISOString(),
    companion_id: null,
    auto_title: null,
    study_mode: 0,
  };
}

export function buildDemoConversations(now: Date, text: DemoText): DemoConversationRef {
  const astroId = demoId("conv", "astro-today");
  const astroMessages = buildMessages(astroId, text.astroMessages, todayTimestamps(now, 40, 5, 6));

  const jsId = demoId("conv", "js-today");
  const jsMessages = buildMessages(jsId, text.jsMessages, todayTimestamps(now, 10, 3, 4));

  const teachId = demoId("conv", "teach");
  const teachMessages = buildMessages(teachId, text.teachMessages, [
    isoAt(now, 10, 19, 0),
    isoAt(now, 10, 19, 1),
  ]);

  const vocabId = demoId("conv", "vocab-recap");
  const vocabMessages = buildMessages(vocabId, text.vocabMessages, [
    isoAt(now, 2, 20, 0),
    isoAt(now, 2, 20, 1),
    isoAt(now, 2, 20, 5),
    isoAt(now, 2, 20, 6),
  ]);

  const conversations = [
    conversationRow(astroId, text.titles.astro, "chat", astroMessages),
    conversationRow(jsId, text.titles.js, "chat", jsMessages),
    conversationRow(teachId, text.titles.teach, "teach", teachMessages),
    conversationRow(vocabId, text.titles.vocab, "chat", vocabMessages),
  ];
  const messages = [...astroMessages, ...jsMessages, ...teachMessages, ...vocabMessages];

  const messageRefById = new Map<
    ConceptId,
    { conversationId: string; messageId: string; createdAt: string }
  >();
  const ref = (id: ConceptId, msg: MessageRow | undefined): void => {
    if (msg === undefined) return;
    messageRefById.set(id, {
      conversationId: msg.conversation_id,
      messageId: msg.id,
      createdAt: msg.created_at,
    });
  };
  ref("gravitational-lensing", astroMessages[1]);
  ref("stellar-spectra", astroMessages[2]);
  ref("astro-root", astroMessages[4]);
  ref("js-root", jsMessages[0]);

  return {
    conversations,
    messages,
    conversationIdByDomain: { astro: astroId, js: jsId },
    messageRefById,
  };
}
