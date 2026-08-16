/**
 * Purpose: the focus overlay's stream cycle — runExplain (stream + persist + plain error
 * banner) and its stop button counterpart. The run's AbortController reaches the transport
 * (focusExplain*.ts thread it into fetch), so stop cancels the request itself; the
 * cooperative fences below stay as defense against late deltas from an already-drained
 * stream (the watchdog's abandonment path still relies on them).
 * Main exports: runExplain, stopExplainStream, FocusSessionRuntimeState, FocusSessionSet,
 * FocusSessionGet. Side effect: holds the module-level record of the in-flight explain run.
 */
import type { FocusNodeRow } from "@breadcrumb/core-db";
import { type FocusPromptMessage, focusErrorLine } from "@breadcrumb/plugin-explore";
import { useSettingsStore } from "../stores/settingsStore";
import { getRepos } from "./db";
import { recordAiFailure } from "./failureLog";
import { streamFocusNodeAnswer } from "./focusExplainRound";

/** The slice of focusStore's state the focus orchestrators read and write — narrower than
 * the store's full interface so these files don't import focusStore.ts (no import cycle). */
export interface FocusSessionRuntimeState {
  sessionId: string | null;
  conversationId: string | null;
  nodes: FocusNodeRow[];
  currentNodeId: string | null;
  streamingText: string | null;
  errorText: string | null;
  pendingGuess: { word: string; matchedNodeId: string | null } | null;
  guessedNodeIds: ReadonlySet<string>;
  recentConsecutiveAbandons: number;
  lastRevealAtByNode: ReadonlyMap<string, Date>;
  openedDoorNodeIds: ReadonlySet<string>;
}

export type FocusSessionGet = () => FocusSessionRuntimeState;
export type FocusSessionSet = (partial: Partial<FocusSessionRuntimeState>) => void;

/** The in-flight explain run, recorded so the stop button can target it. */
interface ActiveExplainRun {
  controller: AbortController;
  nodeId: string;
  /** Set at stop time — the streamed-so-far text the user kept. */
  keptAnswer: string | null;
}
let activeExplainRun: ActiveExplainRun | null = null;

/** Stops the in-flight explain stream, keeping the streamed-so-far text as the station's
 * content (mirroring the normal finalize); with nothing streamed yet the station just stays
 * empty and retryable. Never surfaces an error. */
export function stopExplainStream(set: FocusSessionSet, get: FocusSessionGet): void {
  const run = activeExplainRun;
  if (run === null || run.controller.signal.aborted || get().streamingText === null) return;
  const partial = get().streamingText ?? "";
  run.keptAnswer = partial;
  run.controller.abort();
  set({
    nodes:
      partial.length === 0
        ? get().nodes
        : get().nodes.map((node) =>
            node.id === run.nodeId ? { ...node, answer_text: partial } : node,
          ),
    streamingText: null,
    errorText: null,
  });
  void (async () => {
    const repos = await getRepos();
    await repos.focusNodes.updateAnswer(run.nodeId, partial);
  })();
}

/** Streams and persists one station's answer, degrading to a plain error banner on failure
 * (product principle 1) — shared by every action that opens a new station. */
export async function runExplain(
  set: FocusSessionSet,
  get: FocusSessionGet,
  nodeId: string,
  messages: readonly FocusPromptMessage[],
): Promise<void> {
  const state = get();
  const apiConfig = useSettingsStore.getState().apiConfig;
  if (apiConfig === null || state.conversationId === null) {
    set({ streamingText: null, errorText: focusErrorLine("还没有配置 API") });
    return;
  }
  // The run stays bound to the session it started in — after an exit-and-reopen the old
  // stream keeps writing into the DB but never into the NEW session's screen state
  // (same cross-wire class the chat sessions refactor fixed). A stopped run is likewise
  // fenced off: its late deltas and finalize never reach the screen.
  const runSessionId = state.sessionId;
  const run: ActiveExplainRun = { controller: new AbortController(), nodeId, keptAnswer: null };
  activeExplainRun = run;
  const setIfLive: FocusSessionSet = (patch) => {
    if (!run.controller.signal.aborted && get().sessionId === runSessionId) set(patch);
  };
  try {
    const content = await streamFocusNodeAnswer({
      nodeId,
      messages,
      apiConfig,
      conversationId: state.conversationId,
      onDelta: (delta) => setIfLive({ streamingText: `${get().streamingText ?? ""}${delta}` }),
      signal: run.controller.signal,
    });
    if (run.controller.signal.aborted) {
      // The stopped stream drained in the background and persisted its full answer —
      // restore the partial the user chose to keep (stopExplainStream owns screen state).
      const repos = await getRepos();
      await repos.focusNodes.updateAnswer(nodeId, run.keptAnswer ?? "");
      return;
    }
    setIfLive({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, answer_text: content } : node,
      ),
      streamingText: null,
    });
  } catch (error) {
    // A stopped run failing later (network drop on the abandoned stream) is not an error.
    if (run.controller.signal.aborted) return;
    await recordAiFailure("focus-explain", error);
    setIfLive({
      streamingText: null,
      errorText: focusErrorLine(error instanceof Error ? error.message : String(error)),
    });
  } finally {
    if (activeExplainRun === run) activeExplainRun = null;
  }
}
