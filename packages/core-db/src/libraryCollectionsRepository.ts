/**
 * Purpose: SQL for tying a conversation to some of the reader's documents, and for the
 * remembered sets of documents — collections — that such ties are made from (migration 0060).
 *
 * A conversation's links are replaced as a whole, never patched: the interface always knows
 * the full set it wants, and "delete everything, insert the set" in one transaction cannot
 * leave a half-applied change behind. Collections are read with their members in one shape,
 * because nothing ever wants a collection without knowing what is in it.
 * Main exports: createLibraryCollectionsRepo, sameDocumentSet.
 */
import type { LibraryCollection, LibraryCollectionRow } from "./libraryTypes";
import type { SqlClient, SqlTransactionStatement } from "./types";

/** Order-insensitive equality of two document sets. */
export function sameDocumentSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function memberInserts(collectionId: string, documentIds: readonly string[]) {
  return documentIds.map(
    (documentId, ordinal): SqlTransactionStatement => ({
      sql: `INSERT INTO library_collection_members (collection_id, document_id, ordinal)
            VALUES (?, ?, ?)`,
      params: [collectionId, documentId, ordinal],
    }),
  );
}

export function createLibraryCollectionsRepo(sql: SqlClient) {
  return {
    /** Every collection, newest first, each with its members in saved order. */
    async listCollections(): Promise<LibraryCollection[]> {
      const rows = await sql.select<LibraryCollectionRow>(
        "SELECT * FROM library_collections ORDER BY updated_at DESC",
      );
      const members = await sql.select<{ collection_id: string; document_id: string }>(
        "SELECT collection_id, document_id FROM library_collection_members ORDER BY ordinal",
      );
      const byCollection = new Map<string, string[]>();
      for (const member of members) {
        const list = byCollection.get(member.collection_id) ?? [];
        list.push(member.document_id);
        byCollection.set(member.collection_id, list);
      }
      return rows.map((row) => ({ ...row, documentIds: byCollection.get(row.id) ?? [] }));
    },

    async createCollection(row: LibraryCollectionRow, documentIds: readonly string[]) {
      await sql.executeTransaction([
        {
          sql: `INSERT INTO library_collections (id, name, created_at, updated_at)
                VALUES (?, ?, ?, ?)`,
          params: [row.id, row.name, row.created_at, row.updated_at],
        },
        ...memberInserts(row.id, documentIds),
      ]);
    },

    async renameCollection(id: string, name: string, updatedAt: string): Promise<void> {
      await sql.execute("UPDATE library_collections SET name = ?, updated_at = ? WHERE id = ?", [
        name,
        updatedAt,
        id,
      ]);
    },

    /** Replaces the members. Conversations bound to the collection keep the links they have:
     * a collection changing shape is not a reason to rewrite a conversation already under way. */
    async setMembers(id: string, documentIds: readonly string[], updatedAt: string) {
      await sql.executeTransaction([
        { sql: "DELETE FROM library_collection_members WHERE collection_id = ?", params: [id] },
        ...memberInserts(id, documentIds),
        {
          sql: "UPDATE library_collections SET updated_at = ? WHERE id = ?",
          params: [updatedAt, id],
        },
      ]);
    },

    /** Removes the collection; conversations that came from it keep their links and are
     * simply no longer bound to anything. */
    async deleteCollection(id: string): Promise<void> {
      await sql.executeTransaction([
        {
          sql: "UPDATE conversations SET library_collection_id = NULL WHERE library_collection_id = ?",
          params: [id],
        },
        { sql: "DELETE FROM library_collection_members WHERE collection_id = ?", params: [id] },
        { sql: "DELETE FROM library_collections WHERE id = ?", params: [id] },
      ]);
    },

    /** The documents one conversation is answered from, in the order they were linked. */
    async listLinkedDocumentIds(conversationId: string): Promise<string[]> {
      const rows = await sql.select<{ document_id: string }>(
        `SELECT document_id FROM conversation_library_links
         WHERE conversation_id = ? ORDER BY ordinal`,
        [conversationId],
      );
      return rows.map((row) => row.document_id);
    },

    /** Replaces the conversation's links with exactly this set. */
    async setLinks(
      conversationId: string,
      documentIds: readonly string[],
      createdAt: string,
    ): Promise<void> {
      await sql.executeTransaction([
        {
          sql: "DELETE FROM conversation_library_links WHERE conversation_id = ?",
          params: [conversationId],
        },
        ...documentIds.map(
          (documentId, ordinal): SqlTransactionStatement => ({
            sql: `INSERT INTO conversation_library_links
                  (conversation_id, document_id, ordinal, created_at) VALUES (?, ?, ?, ?)`,
            params: [conversationId, documentId, ordinal, createdAt],
          }),
        ),
      ]);
    },
  };
}
