/**
 * Purpose: zustand store for the reader's own material — the list of what has been imported,
 * one import in flight, and how far the background vector pass has got.
 *
 * The progress this store holds is not decoration. An import is finished — and searchable by
 * keyword — long before the vectors exist, and the only way a reader can tell "still working"
 * from "as good as it gets" is if something says so.
 * Main exports: useLibraryStore.
 */
import type { LibraryDocumentRow } from "@breadcrumb/core-db";
import { EMBEDDING_MODEL } from "@breadcrumb/core-vectors";
import i18next from "i18next";
import { create } from "zustand";
import { runEmbeddingBackfill } from "../lib/library/libraryEmbedding";
import { pickLibraryFile } from "../lib/library/libraryFiles";
import { importFile } from "../lib/library/libraryImport";
import { type SpeedAdvice, speedAdviceFor } from "../lib/library/librarySpeedHint";
import { getRepos } from "../lib/platform/db";
import { degradeSilently } from "../lib/platform/failureLog";

interface LibraryState {
  documents: LibraryDocumentRow[];
  /** True from the moment a file is chosen until its passages are written. */
  importing: boolean;
  /** A message key inside the `library` namespace, or null. Cleared by the next attempt. */
  errorKey: "error.unreadable" | null;
  embedded: number;
  total: number;
  /** Which sentence about browsers to show beside the progress, if any. */
  speedAdvice: SpeedAdvice | null;
  load(): Promise<void>;
  importDocument(): Promise<void>;
  remove(documentId: string): Promise<void>;
  /** Resolves when the queue is empty. Nothing on screen awaits it; the progress arrives
   * through the store as it goes. */
  startBackfill(): Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  documents: [],
  importing: false,
  errorKey: null,
  embedded: 0,
  total: 0,
  speedAdvice: null,

  async load() {
    const repos = await getRepos();
    const [documents, progress] = await Promise.all([
      repos.library.listDocuments(),
      repos.library.embeddingProgress(EMBEDDING_MODEL),
    ]);
    set({ documents, ...progress });
    // Opening the list is also the moment to finish what the last visit left unfinished.
    void get().startBackfill();
  },

  async importDocument() {
    if (get().importing) return;
    set({ errorKey: null });
    const picked = await pickLibraryFile();
    // A closed picker is not a failure and must not be reported as one.
    if (picked === null) return;
    set({ importing: true });
    try {
      await importFile({ ...picked, language: i18next.language });
      await get().load();
    } catch (error) {
      void degradeSilently("libraryImport", error);
      set({ errorKey: "error.unreadable" });
    } finally {
      set({ importing: false });
    }
  },

  async remove(documentId) {
    const repos = await getRepos();
    await repos.library.deleteDocument(documentId);
    await get().load();
  },

  startBackfill() {
    return runEmbeddingBackfill(({ embedded, total, msPerText }) => {
      set({ embedded, total, speedAdvice: speedAdviceFor(msPerText, globalThis.navigator) });
    });
  },
}));
