/**
 * Purpose: getting the reranker onto this machine and into memory, without ever making a
 * chat turn wait for the part that takes minutes.
 *
 * The model is 588 MB and downloads once. Before this file, the retrieval layer asked for it
 * with downloading forbidden, so on a fresh install the answer was "not downloaded" on every
 * turn, forever, and the +0.27 nDCG@10 the reranker is worth never reached a single reader.
 * Now the first turn that wants it starts the download — with the network switch on, through
 * the same download machinery and checks the embedder uses — and answers this turn in fused
 * order; the turns after the download finishes are reranked. Loading the files into memory
 * takes seconds, once per session, and that wait is taken: it is the difference between the
 * first question of a session being reranked or not.
 *
 * The browser edition has no reranker, and says so on the first ask; nothing is retried
 * there. A failed download is retried, but not on the next turn — a machine that is offline
 * stays offline for a while, and a half-gigabyte attempt per question is not a retry policy.
 * Main exports: rerankerReady, RERANKER_RETRY_AFTER_MS.
 */
import { invoke } from "@tauri-apps/api/core";
import { useRerankerStore } from "../../stores/rerankerStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { degradeSilently } from "../platform/failureLog";

/** How long a failed attempt keeps the next one from starting. */
export const RERANKER_RETRY_AFTER_MS = 10 * 60 * 1000;

let inflight: Promise<boolean> | null = null;

/**
 * True when the reranker can score right now. Starts whatever is needed to make it so — a
 * load, or a download — and waits only for the load.
 */
export async function rerankerReady(): Promise<boolean> {
  const { status, failedAt } = useRerankerStore.getState();
  if (status === "ready") return true;
  if (status === "downloading" || status === "unavailable") return false;
  if (status === "loading" && inflight !== null) return inflight;
  if (status === "failed" && failedAt !== null && Date.now() - failedAt < RERANKER_RETRY_AFTER_MS) {
    return false;
  }
  if (inflight !== null) return false;
  let cached: boolean;
  try {
    cached = await invoke<boolean>("reranker_available");
  } catch {
    // An edition with no reranker at all. Not a failure to retry — the answer will not change.
    useRerankerStore.getState().setStatus("unavailable");
    return false;
  }
  const allowDownload = useSettingsStore.getState().networkEnabled;
  if (!cached && !allowDownload) {
    useRerankerStore.getState().setStatus("failed");
    return false;
  }
  useRerankerStore.getState().setStatus(cached ? "loading" : "downloading");
  inflight = prepare(allowDownload);
  return cached ? inflight : false;
}

async function prepare(allowDownload: boolean): Promise<boolean> {
  try {
    await invoke("prepare_reranker", { allowDownload });
    useRerankerStore.getState().setStatus("ready");
    return true;
  } catch (error) {
    void degradeSilently("reranker", error);
    useRerankerStore.getState().setStatus("failed");
    return false;
  } finally {
    inflight = null;
  }
}
