/**
 * Purpose: in-place badges for the focus sessions born from one assistant message (Leo
 * 2026-08-14 revision to spec 042 §5, replacing the old exit-record chat message) — one
 * low-key row per session with at least one answered station, styled after FactcheckBadge's
 * inline bar; clicking a row reopens that session.
 * Main exports: FocusSessionBadge.
 */
import { focusBadgeMessage } from "@breadcrumb/plugin-explore";
import { useCopyMessage } from "../i18n/useCopyMessage";
import { useFocusSessionsStore } from "../stores/focusSessionsStore";
import { useFocusStore } from "../stores/focusStore";

interface FocusSessionBadgeProps {
  messageId: string;
}

export function FocusSessionBadge({ messageId }: FocusSessionBadgeProps) {
  const copy = useCopyMessage();
  const sessions = useFocusSessionsStore((state) => state.sessionsByMessageId.get(messageId));
  const reopen = useFocusStore((state) => state.reopen);

  if (sessions === undefined || sessions.length === 0) return null;

  return (
    <div className="space-y-0.5 ps-1">
      {sessions.map((session) => (
        <button
          key={session.sessionId}
          type="button"
          onClick={() => void reopen(session.sessionId)}
          className="block text-xs text-stone-400 transition-colors hover:text-amber-600"
        >
          {copy(focusBadgeMessage(session.rootLabel, session.answeredCount))}
        </button>
      ))}
    </div>
  );
}
