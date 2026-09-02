/**
 * Purpose: pure assembly of one conversation's focus sessions into the shapes the two in-place
 * surfaces need (Leo 2026-08-14 revision to spec 042 §5) — the per-message badge list, the
 * top-of-chat bar's session list, and the legacy entry_message_id map for pre-revision exit
 * records. No I/O; focusSessionsStore feeds it repo rows and applies the result via set().
 * Main exports: buildFocusSessionAssembly, FocusSessionBadgeEntry, FocusSessionSummary,
 * FocusSessionAssembly.
 */
import type { FocusNodeRow, FocusSessionRow } from "@breadcrumb/core-db";

/** One session's badge data — rendered once per session under the message it grew from. */
export interface FocusSessionBadgeEntry {
  sessionId: string;
  rootLabel: string;
  answeredCount: number;
}

/** A badge entry plus its creation time, for the top-of-chat bar's rows. */
export interface FocusSessionSummary extends FocusSessionBadgeEntry {
  createdAt: string;
}

export interface FocusSessionAssembly {
  entrySessionByMessageId: Map<string, string>;
  sessionsByMessageId: Map<string, FocusSessionBadgeEntry[]>;
  allSessions: FocusSessionSummary[];
}

/** A session counts as "has substance" once at least one of its stations landed an answer —
 * the same bar the focus:exited zero-substance cleanup uses (spec 042 §5 revision). Sessions
 * with none are excluded from every surface here (they are deleted outright on exit, but a
 * caller might still pass one in transiently). */
function countAnswered(nodes: readonly FocusNodeRow[]): number {
  return nodes.filter((node) => node.answer_text.length > 0).length;
}

/** Builds all three surfaces from one conversation's sessions and their nodes. `nodesBySession`
 * must have an entry for every session in `sessions` (an absent entry reads as zero stations). */
export function buildFocusSessionAssembly(
  sessions: readonly FocusSessionRow[],
  nodesBySession: ReadonlyMap<string, readonly FocusNodeRow[]>,
): FocusSessionAssembly {
  const entrySessionByMessageId = new Map<string, string>();
  const sessionsByMessageId = new Map<string, FocusSessionBadgeEntry[]>();
  const allSessions: FocusSessionSummary[] = [];

  for (const session of sessions) {
    if (session.entry_message_id !== null) {
      entrySessionByMessageId.set(session.entry_message_id, session.id);
    }
    const answeredCount = countAnswered(nodesBySession.get(session.id) ?? []);
    if (answeredCount === 0) continue;

    const entry: FocusSessionBadgeEntry = {
      sessionId: session.id,
      rootLabel: session.root_label,
      answeredCount,
    };
    allSessions.push({ ...entry, createdAt: session.created_at });
    if (session.source_message_id !== null) {
      const existing = sessionsByMessageId.get(session.source_message_id) ?? [];
      existing.push(entry);
      sessionsByMessageId.set(session.source_message_id, existing);
    }
  }

  // Newest first — the top bar reads as a recency list.
  allSessions.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  return { entrySessionByMessageId, sessionsByMessageId, allSessions };
}
