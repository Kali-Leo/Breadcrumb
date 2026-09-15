/**
 * Purpose: where the reranker stands on this machine, so that the chat can say "preparing"
 * while a first-time download runs and the retrieval layer can decide, in one read, whether
 * this turn gets a second stage.
 *
 * Nothing is persisted: the files on disk are the truth about whether the model is here, and
 * the Rust side re-reads them on every check. This store only remembers what this session has
 * found out and what it has started.
 * Main exports: useRerankerStore, RerankerStatus.
 */
import { create } from "zustand";

export type RerankerStatus =
  /** Not asked yet this session. */
  | "unknown"
  /** Files present, model being read into memory — a wait of seconds, once per session. */
  | "loading"
  /** Files absent, the download is running — minutes, once per machine. */
  | "downloading"
  /** Ready to score. */
  | "ready"
  /** Could not be made ready this time: no network for the download, or it broke off. */
  | "failed"
  /** This edition has no reranker at all. The browser is the one that does not. */
  | "unavailable";

interface RerankerState {
  status: RerankerStatus;
  /** When the last attempt failed, so that the next one is not one turn later. */
  failedAt: number | null;
  setStatus(status: RerankerStatus): void;
}

export const useRerankerStore = create<RerankerState>((set) => ({
  status: "unknown",
  failedAt: null,
  setStatus(status) {
    set({ status, failedAt: status === "failed" ? Date.now() : null });
  },
}));
