/**
 * Purpose: shipped migrations 0056 and 0057. Part of the append-only MIGRATIONS list assembled
 * in ./index.ts — see that file for the rules.
 * 0056 — the library: material the learner brings in (a book they bought, a lecture handout)
 *        plus, later, knowledge points shipped with the product, in one table so retrieval
 *        never has to know which is which.
 * 0057 — the model column on every embedding cache, and the vectors that predate it, gone.
 * Main exports: MIGRATIONS_0056_0057.
 */

import { FTS_TOKENIZE } from "./ftsTokenize";
import type { Migration } from "./migration";

/** Mirrors packages/core-vectors EMBEDDING_MODEL. Frozen here because a shipped migration is
 * never edited: when the model changes again, the purge is a NEW migration, not a rewrite of
 * this one. migrations/ftsTokenize.test.ts fails if the two literals ever disagree. */
const EMBEDDING_MODEL_AT_0057 = "gte-multilingual-base-int8-384";

export const MIGRATIONS_0056_0057: readonly Migration[] = [
  {
    // One table for every passage that can be retrieved, whatever brought it in. `origin`
    // distinguishes what the learner uploaded from what ships with the product; nothing in
    // the retrieval path reads it, which is the point — an answer cites the best passage, not
    // the best passage of the right provenance.
    //
    // Passages are two-level. A child is what gets searched, a parent is what gets read to
    // the model: a hit on three sentences is precise, and three sentences are not enough
    // context to answer from. `parent_id IS NULL` marks a parent; children point at theirs.
    // heading_path ("书名 → 章 → 节") is stored rather than recomputed because it is also
    // prepended to the text that is indexed and embedded — a passage that says "it doubles
    // every 18 months" is unfindable until it also says which chapter it is in.
    id: "0056_library_passages",
    statements: [
      `CREATE TABLE library_documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        origin TEXT NOT NULL CHECK (origin IN ('upload', 'bundled')),
        media_type TEXT NOT NULL CHECK (media_type IN ('pdf', 'markdown', 'text')),
        language TEXT NOT NULL DEFAULT '',
        passage_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );`,
      `CREATE TABLE library_passages (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES library_passages(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        heading_path TEXT NOT NULL,
        body TEXT NOT NULL,
        token_estimate INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX library_passages_by_document ON library_passages (document_id, ordinal);`,
      `CREATE INDEX library_passages_by_parent ON library_passages (parent_id);`,
      // Not a contentless index and not an external-content one: what is indexed is not the
      // passage text but the analyzed form of it (Chinese bigrams, stems in their own field),
      // so there is no content table for FTS5 to read the terms back out of. The duplication
      // is the analyzed tokens only, and a personal library is thousands of passages, not
      // millions. passage_id is UNINDEXED so it costs nothing but joins the hit to its row.
      `CREATE VIRTUAL TABLE library_passage_fts USING fts5(
        passage_id UNINDEXED,
        body,
        stems,
        ${FTS_TOKENIZE}
      );`,
      // Same shape as node_embeddings, model column included from the start.
      `CREATE TABLE library_passage_embeddings (
        passage_id TEXT PRIMARY KEY REFERENCES library_passages(id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `CREATE INDEX library_passage_embeddings_by_model ON library_passage_embeddings (model);`,
    ],
  },
  {
    // node_embeddings has always written `model` and nothing has ever read it. That was
    // survivable while a model swap also changed the vector width, because parseVectorRows
    // drops the minority width and the stale half degrades to "missing". This swap does not
    // change the width — gte truncated to 384 is still 384 — so that net is gone, and a
    // half-migrated tree would compute cosines between e5 vectors and gte vectors and get
    // plausible numbers out. Reading the column is the fix (see listNodesMissingEmbedding);
    // this migration is the one-off cleanup and the index that makes the new query cheap.
    //
    // The other two caches never had the column at all. Adding it costs nothing and closes
    // the same hole. Every existing row in all three was computed by multilingual-e5-small,
    // so every existing row goes: they are a cache, they cost seconds to rebuild, and the
    // product has no released version whose users could notice.
    id: "0057_embedding_model_identity",
    statements: [
      `ALTER TABLE canonical_concept_embeddings ADD COLUMN model TEXT NOT NULL DEFAULT '';`,
      `ALTER TABLE diglot_context_embeddings ADD COLUMN model TEXT NOT NULL DEFAULT '';`,
      `DELETE FROM node_embeddings WHERE model <> '${EMBEDDING_MODEL_AT_0057}';`,
      `DELETE FROM canonical_concept_embeddings WHERE model <> '${EMBEDDING_MODEL_AT_0057}';`,
      `DELETE FROM diglot_context_embeddings WHERE model <> '${EMBEDDING_MODEL_AT_0057}';`,
      `CREATE INDEX node_embeddings_by_model ON node_embeddings (model);`,
      `CREATE INDEX canonical_concept_embeddings_by_model
         ON canonical_concept_embeddings (model);`,
      `CREATE INDEX diglot_context_embeddings_by_model ON diglot_context_embeddings (model);`,
    ],
  },
];
