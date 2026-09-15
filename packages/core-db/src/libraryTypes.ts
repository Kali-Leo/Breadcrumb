/**
 * Purpose: the row shapes of the library — documents the learner brought in, the passages
 * they were cut into, and the vectors computed for those passages.
 * Main exports: LibraryDocumentRow, LibraryPassageRow, LibraryPassageEmbeddingRow,
 * LibraryOrigin, LibraryMediaType, KeywordHit, LibraryProgress, LibraryCollectionRow,
 * LibraryCollection, ConversationLibraryLinkRow.
 */

/** Where the material came from. 'bundled' is the seam for knowledge points shipped with the
 * product; nothing writes it yet, and retrieval deliberately does not read it. */
export type LibraryOrigin = "upload" | "bundled";

export type LibraryMediaType = "pdf" | "markdown" | "text" | "image";

export interface LibraryDocumentRow {
  id: string;
  title: string;
  origin: LibraryOrigin;
  media_type: LibraryMediaType;
  /** BCP-47, or "" when nothing said. Used only to pick a stemmer for Latin script. */
  language: string;
  passage_count: number;
  created_at: string;
}

/**
 * One passage. `parent_id === null` means this is a parent — the block that gets read to the
 * model; a row with a parent is a child, the smaller block that gets searched.
 */
export interface LibraryPassageRow {
  id: string;
  document_id: string;
  parent_id: string | null;
  ordinal: number;
  /** "书名 → 章 → 节", prepended to the text that was indexed and embedded. */
  heading_path: string;
  body: string;
  token_estimate: number;
  created_at: string;
}

export interface LibraryPassageEmbeddingRow {
  passage_id: string;
  model: string;
  vector_json: string;
  created_at: string;
}

/** One keyword hit. `score` is SQLite's bm25(), which is negative and better when smaller;
 * the fusion layer only ever uses the order, never the magnitude. */
export interface KeywordHit {
  passage_id: string;
  score: number;
}

/** How far the background embedding pass has got, for the one progress line the reader sees. */
export interface LibraryProgress {
  embedded: number;
  total: number;
}

/** A remembered set of documents under a name (migration 0060). The members live in
 * library_collection_members; LibraryCollection is the row with them read in. */
export interface LibraryCollectionRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface LibraryCollection extends LibraryCollectionRow {
  /** Member document ids in the order they were saved. */
  documentIds: string[];
}

/** One document a conversation is answered from. */
export interface ConversationLibraryLinkRow {
  conversation_id: string;
  document_id: string;
  ordinal: number;
  created_at: string;
}
