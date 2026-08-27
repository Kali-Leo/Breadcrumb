/**
 * Purpose: chatStore's single session write path (patch/put + round-error routing), extracted
 * as a factory so the store stays an orchestrator under the file-size cap — every write keeps
 * the active-session mirror in sync by construction.
 * Main exports: createSessionWriters, SessionWriters, SessionSliceState.
 */

import type { CopyMessage } from "@breadcrumb/core-i18n";
import { type ActiveMirror, type ChatSession, mirrorOf } from "./chatSessions";

/** The slice of chatStore state these writers read and produce. */
export interface SessionSliceState extends ActiveMirror {
  sessions: ReadonlyMap<string, ChatSession>;
  activeConversationId: string | null;
}

export interface SessionWriters {
  /** The single session write path — keeps the active mirror in sync by construction. */
  patchSession(id: string, updater: (session: ChatSession) => ChatSession): void;
  putSession(id: string, session: ChatSession, makeActive: boolean): void;
  /** Routes a round failure into its own session; a conversation that never got a session
   * (guards failed before creation) degrades to the active mirror's error field. */
  setRoundError(conversationId: string | null, errorText: CopyMessage): void;
}

export function createSessionWriters(
  set: (updater: (state: SessionSliceState) => Partial<SessionSliceState>) => void,
  get: () => SessionSliceState,
): SessionWriters {
  function patchSession(id: string, updater: (session: ChatSession) => ChatSession): void {
    set((state) => {
      const current = state.sessions.get(id);
      if (current === undefined) return {};
      const next = updater(current);
      const sessions = new Map(state.sessions);
      sessions.set(id, next);
      return { sessions, ...(state.activeConversationId === id ? mirrorOf(next) : {}) };
    });
  }

  return {
    patchSession,

    putSession(id, session, makeActive) {
      set((state) => {
        const sessions = new Map(state.sessions);
        sessions.set(id, session);
        return {
          sessions,
          ...(makeActive
            ? { activeConversationId: id, ...mirrorOf(session) }
            : state.activeConversationId === id
              ? mirrorOf(session)
              : {}),
        };
      });
    },

    setRoundError(conversationId, errorText) {
      if (conversationId !== null && get().sessions.has(conversationId)) {
        patchSession(conversationId, (session) => ({ ...session, errorText }));
      } else {
        set(() => ({ errorText }));
      }
    },
  };
}
