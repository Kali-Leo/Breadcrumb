/**
 * Purpose: shipped migration 0060. Part of the append-only MIGRATIONS list assembled in
 * ./index.ts — see that file for the rules.
 * 0060 — a conversation can be tied to some of the reader's own documents, and a set of
 * documents that has been used together is remembered as a named collection.
 *
 * Three tables and one column. `conversation_library_links` says which documents one
 * conversation is answered from; `library_collections` with `library_collection_members` is
 * a remembered set of documents under a name; `conversations.library_collection_id` records
 * that a conversation's links came from one collection, which is what lets the interface
 * notice when the two have drifted apart and ask whether the collection should follow.
 *
 * The column carries no REFERENCES clause on purpose: SQLite only allows a foreign key on an
 * added column when foreign keys are off or the default is NULL, and clearing it by hand when
 * a collection is deleted (libraryCollectionsRepository) keeps the delete explicit, the way
 * every other cascade in this package is written.
 * Main exports: MIGRATIONS_0060_0060.
 */
import type { Migration } from "./migration";

export const MIGRATIONS_0060_0060: readonly Migration[] = [
  {
    id: "0060_conversation_library_links",
    statements: [
      `CREATE TABLE library_collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );`,
      `CREATE TABLE library_collection_members (
        collection_id TEXT NOT NULL REFERENCES library_collections(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        PRIMARY KEY (collection_id, document_id)
      );`,
      `CREATE INDEX library_collection_members_by_document
         ON library_collection_members (document_id);`,
      `CREATE TABLE conversation_library_links (
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        document_id TEXT NOT NULL REFERENCES library_documents(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, document_id)
      );`,
      `CREATE INDEX conversation_library_links_by_document
         ON conversation_library_links (document_id);`,
      `ALTER TABLE conversations ADD COLUMN library_collection_id TEXT;`,
    ],
  },
];
