/**
 * Purpose: collapsible top-of-chat bar listing the open conversation's focus sessions (Leo
 * 2026-08-14 revision to spec 042 §5) — a folded one-line count, expanding into rows that
 * reopen each session; renders nothing when there are none. Styled after the thin banner rows
 * already used for the continuation/companion banners (border-b, text-xs).
 * Main exports: FocusSessionsBar.
 */
import { focusBarTitleMessage } from "@breadcrumb/feature-explore";
import { useCopyMessage } from "../../i18n/useCopyMessage";
import { formatFocusSessionTimestamp } from "../../lib/focus/focusSessionTime";
import { useFocusSessionsStore } from "../../stores/focusSessionsStore";
import { useFocusStore } from "../../stores/focusStore";

export function FocusSessionsBar() {
  const copy = useCopyMessage();
  const allSessions = useFocusSessionsStore((state) => state.allSessions);
  const reopen = useFocusStore((state) => state.reopen);

  if (allSessions.length === 0) return null;

  return (
    <details className="border-stone-100 border-b bg-white px-4 py-1.5 text-stone-500 text-xs">
      <summary className="cursor-pointer select-none">
        {copy(focusBarTitleMessage(allSessions.length))}
      </summary>
      <ul className="mt-1 space-y-1 pb-1">
        {allSessions.map((session) => (
          <li key={session.sessionId}>
            <button
              type="button"
              onClick={() => void reopen(session.sessionId)}
              className="text-stone-500 hover:text-amber-600"
            >
              「{session.rootLabel}」· {session.answeredCount} 站 ·{" "}
              {formatFocusSessionTimestamp(session.createdAt)}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
