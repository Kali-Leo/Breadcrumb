/**
 * Purpose: shipped migration 0059. Part of the append-only MIGRATIONS list assembled in
 * ./index.ts — see that file for the rules.
 * 0059 — a fourth kind of material: an image of a page, read by text recognition.
 *
 * SQLite cannot widen a CHECK constraint, so `library_documents` is rebuilt (as 0027 and 0047
 * rebuilt theirs). This table is different from those in one way that decides the shape of
 * the rebuild: two tables reference it. Renaming it rewrites their foreign keys to follow it
 * (SQLite has done that since 3.26), and dropping it afterwards would first run an implicit
 * DELETE that cascades through every passage and every vector. So the children are rebuilt
 * too, in dependency order — embeddings under passages under documents — each copied verbatim
 * into a fresh table that references the fresh parent, and the old ones are dropped only once
 * nothing references them any more, leaf first. The FTS table has no foreign key and stays.
 * Main exports: MIGRATIONS_0059_0059.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0059_0059: readonly Migration[] = [
  {
    id: "0059_library_image_documents",
    statements: [
      `ALTER TABLE library_documents RENAME TO library_documents_old;`,
      `ALTER TABLE library_passages RENAME TO library_passages_old;`,
      `ALTER TABLE library_passage_embeddings RENAME TO library_passage_embeddings_old;`,
      `CREATE TABLE library_documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        origin TEXT NOT NULL CHECK (origin IN ('upload', 'bundled')),
        media_type TEXT NOT NULL CHECK (media_type IN ('pdf', 'markdown', 'text', 'image')),
        language TEXT NOT NULL DEFAULT '',
        passage_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );`,
      `INSERT INTO library_documents SELECT * FROM library_documents_old;`,
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
      // Parents before children, so the self-reference is satisfied row by row.
      `INSERT INTO library_passages SELECT * FROM library_passages_old ORDER BY parent_id IS NOT NULL, ordinal;`,
      `CREATE TABLE library_passage_embeddings (
        passage_id TEXT PRIMARY KEY REFERENCES library_passages(id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );`,
      `INSERT INTO library_passage_embeddings SELECT * FROM library_passage_embeddings_old;`,
      // Leaf first: by the time each table is dropped, nothing references it.
      `DROP TABLE library_passage_embeddings_old;`,
      `DROP TABLE library_passages_old;`,
      `DROP TABLE library_documents_old;`,
      // The indexes followed the old tables through the renames and went with them.
      `CREATE INDEX library_passages_by_document ON library_passages (document_id, ordinal);`,
      `CREATE INDEX library_passages_by_parent ON library_passages (parent_id);`,
      `CREATE INDEX library_passage_embeddings_by_model ON library_passage_embeddings (model);`,
    ],
  },
];
