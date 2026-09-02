/**
 * Purpose: SQL statements for the messages table — the append-only transcript of every
 * conversation. Deleting messages is the conversation repo's job (they die with their chat).
 * Main exports: createMessagesRepo factory.
 */
import type { MessageRow } from "./chatTypes";
import type { SqlClient } from "./types";

export function createMessagesRepo(sql: SqlClient) {
  return {
    async append(row: MessageRow): Promise<void> {
      await sql.execute(
        `INSERT INTO messages (id, conversation_id, role, content, created_at, teaching_mode, parent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.conversation_id,
          row.role,
          row.content,
          row.created_at,
          row.teaching_mode,
          row.parent_id,
        ],
      );
    },
    async listByConversation(conversationId: string): Promise<MessageRow[]> {
      return sql.select<MessageRow>(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
      );
    },
  };
}
