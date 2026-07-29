/**
 * Purpose: all SQL statements in one place — typed repository functions over SqlClient.
 * Main exports: settingsRepo, conversationsRepo, messagesRepo, llmCallsRepo factories.
 */
import type {
  ConversationRow,
  Currency,
  KnowledgeNodeRow,
  LlmCallRow,
  MessageRow,
  SettingRow,
  SqlClient,
  TrailSummaryRow,
} from "./types";

export function createSettingsRepo(sql: SqlClient) {
  return {
    async get<Value>(key: string): Promise<Value | null> {
      const rows = await sql.select<SettingRow>("SELECT * FROM settings WHERE key = ?", [key]);
      const row = rows[0];
      return row ? (JSON.parse(row.value_json) as Value) : null;
    },
    async set(key: string, value: unknown, nowIso: string): Promise<void> {
      await sql.execute(
        `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
        [key, JSON.stringify(value), nowIso],
      );
    },
  };
}

export function createConversationsRepo(sql: SqlClient) {
  return {
    async create(row: ConversationRow): Promise<void> {
      await sql.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
        [row.id, row.title, row.created_at, row.updated_at],
      );
    },
    async listRecentFirst(): Promise<ConversationRow[]> {
      return sql.select<ConversationRow>("SELECT * FROM conversations ORDER BY updated_at DESC");
    },
    async touch(id: string, updatedAtIso: string): Promise<void> {
      await sql.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", [updatedAtIso, id]);
    },
    async rename(id: string, title: string): Promise<void> {
      await sql.execute("UPDATE conversations SET title = ? WHERE id = ?", [title, id]);
    },
  };
}

export function createMessagesRepo(sql: SqlClient) {
  return {
    async append(row: MessageRow): Promise<void> {
      await sql.execute(
        "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.conversation_id, row.role, row.content, row.created_at],
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

export function createKnowledgeNodesRepo(sql: SqlClient) {
  return {
    async insert(row: KnowledgeNodeRow): Promise<void> {
      await sql.execute(
        `INSERT INTO knowledge_nodes
           (id, conversation_id, parent_id, label, summary, source_message_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.conversation_id,
          row.parent_id,
          row.label,
          row.summary,
          row.source_message_id,
          row.created_at,
        ],
      );
    },
    async listByConversation(conversationId: string): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        "SELECT * FROM knowledge_nodes WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
      );
    },
    /** Nodes created inside [fromIso, toIso) — the raw material of the daily trail. */
    async listCreatedBetween(fromIso: string, toIso: string): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        "SELECT * FROM knowledge_nodes WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC",
        [fromIso, toIso],
      );
    },
  };
}

export function createTrailSummariesRepo(sql: SqlClient) {
  return {
    async get(date: string): Promise<TrailSummaryRow | null> {
      const rows = await sql.select<TrailSummaryRow>(
        "SELECT * FROM trail_summaries WHERE date = ?",
        [date],
      );
      return rows[0] ?? null;
    },
    async set(row: TrailSummaryRow): Promise<void> {
      await sql.execute(
        `INSERT INTO trail_summaries (date, content, created_at) VALUES (?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
        [row.date, row.content, row.created_at],
      );
    },
  };
}

interface CostSumRow {
  currency: Currency;
  total_micros: number | null;
}

export function createLlmCallsRepo(sql: SqlClient) {
  return {
    async record(row: LlmCallRow): Promise<void> {
      await sql.execute(
        `INSERT INTO llm_calls
           (id, conversation_id, purpose, model, input_tokens, output_tokens, cost_micros, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.conversation_id,
          row.purpose,
          row.model,
          row.input_tokens,
          row.output_tokens,
          row.cost_micros,
          row.currency,
          row.created_at,
        ],
      );
    },
    /** Cost per currency since the given instant (e.g. local midnight for "today"). */
    async sumCostSince(sinceIso: string): Promise<Map<Currency, number>> {
      const rows = await sql.select<CostSumRow>(
        "SELECT currency, SUM(cost_micros) AS total_micros FROM llm_calls WHERE created_at >= ? GROUP BY currency",
        [sinceIso],
      );
      return new Map(rows.map((row) => [row.currency, row.total_micros ?? 0]));
    },
    async sumCostForConversation(conversationId: string): Promise<Map<Currency, number>> {
      const rows = await sql.select<CostSumRow>(
        "SELECT currency, SUM(cost_micros) AS total_micros FROM llm_calls WHERE conversation_id = ? GROUP BY currency",
        [conversationId],
      );
      return new Map(rows.map((row) => [row.currency, row.total_micros ?? 0]));
    },
  };
}
