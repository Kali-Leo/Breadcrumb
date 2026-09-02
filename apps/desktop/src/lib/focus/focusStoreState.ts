/**
 * Purpose: the focus (explain-word) session's state shape and the per-session reset block,
 * split out of focusStore.ts to keep that file under the file-size ceiling. Type and constant
 * only — no zustand, no DB, no side effects.
 * Main exports: FocusState, RESET_SESSION_FIELDS.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import type { CopyMessage } from "@breadcrumb/core-i18n";
import type { FocusGuessState } from "./focusActions";

export interface FocusState {
  open: boolean;
  sessionId: string | null;
  conversationId: string | null;
  rootLabel: string;
  nodes: FocusNodeRow[];
  currentNodeId: string | null;
  streamingText: string | null;
  /** The failure to state, as a catalogue key (spec 058 §2); null while nothing failed. */
  errorText: CopyMessage | null;
  pendingGuess: FocusGuessState | null;
  guessedNodeIds: ReadonlySet<string>;
  recentConsecutiveAbandons: number;
  lastRevealAtByNode: ReadonlyMap<string, Date>;
  /** Node ids already opened as a station this session — computeFocusDoorPatches never
   * re-marks them (mirrors doorStore.openedNodeIds, but session-scoped). */
  openedDoorNodeIds: ReadonlySet<string>;
  startFromWord(
    conversationId: string,
    word: string,
    parentAnswerText: string,
    sourceMessageId: string | null,
  ): Promise<void>;
  selectWord(word: string): Promise<void>;
  submitGuess(guessText: string): Promise<void>;
  skipGuess(): void;
  askQuestion(question: string): Promise<void>;
  /** Stops the in-flight explanation, keeping the streamed-so-far text as the station's
   * content — no error, no banner. */
  stopStreaming(): void;
  jumpTo(nodeId: string): void;
  exitFocus(): void;
  reopen(sessionId: string): Promise<void>;
  /** Re-runs the current station after a failure/timeout (watchdog, 2026-08-14). */
  retryCurrent(): Promise<void>;
}

export const RESET_SESSION_FIELDS = {
  pendingGuess: null,
  guessedNodeIds: new Set<string>(),
  recentConsecutiveAbandons: 0,
  lastRevealAtByNode: new Map<string, Date>(),
  openedDoorNodeIds: new Set<string>(),
};
