/**
 * Purpose: core cross-cutting SQL statements — settings, conversations, messages and
 * billing. Knowledge-graph and feature-specific repos live in their own sibling files.
 * Main exports: settingsRepo, conversationsRepo, messagesRepo, llmCallsRepo factories.
 */
import type {
  ConversationKind,
  ConversationRow,
  Currency,
  LlmCallRow,
  MessageRow,
  SettingRow,
  SqlClient,
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
    /** companion_id is optional here (defaults to null) so every caller predating spec 037's
     * companion cast keeps typechecking without touching every call site. auto_title is never
     * set at creation (spec 041 §1) — it starts NULL and is filled in once the trail has
     * stations, via setAutoTitle. */
    async create(
      row: Omit<ConversationRow, "companion_id" | "auto_title" | "study_mode"> & {
        companion_id?: string | null;
        study_mode?: 0 | 1;
      },
    ): Promise<void> {
      await sql.execute(
        "INSERT INTO conversations (id, title, created_at, updated_at, kind, companion_id, study_mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          row.id,
          row.title,
          row.created_at,
          row.updated_at,
          row.kind,
          row.companion_id ?? null,
          row.study_mode ?? 0,
        ],
      );
    },
    /** Every conversation regardless of kind, newest first. */
    async listRecentFirst(): Promise<ConversationRow[]> {
      return sql.select<ConversationRow>("SELECT * FROM conversations ORDER BY updated_at DESC");
    },
    /** One conversation by id, or null — the chat flow branches on kind (spec 034). */
    async getById(id: string): Promise<ConversationRow | null> {
      const rows = await sql.select<ConversationRow>(
        "SELECT * FROM conversations WHERE id = ? LIMIT 1",
        [id],
      );
      return rows[0] ?? null;
    },
    /** One kind only, newest first — the sidebar uses this with 'chat' so practice discussions
     * (spec 026) stay out of the standing conversation list while remaining fully saved. */
    async listByKind(kind: ConversationKind): Promise<ConversationRow[]> {
      return sql.select<ConversationRow>(
        "SELECT * FROM conversations WHERE kind = ? ORDER BY updated_at DESC",
        [kind],
      );
    },
    /** The most recently updated conversation of one kind belonging to one companion card
     * (spec 037) — reopening a companion from the sidebar continues this thread instead of
     * starting a new one. */
    async findLatestByCompanion(
      companionId: string,
      kind: ConversationKind,
    ): Promise<ConversationRow | null> {
      const rows = await sql.select<ConversationRow>(
        `SELECT * FROM conversations WHERE companion_id = ? AND kind = ?
         ORDER BY updated_at DESC LIMIT 1`,
        [companionId, kind],
      );
      return rows[0] ?? null;
    },
    async touch(id: string, updatedAtIso: string): Promise<void> {
      await sql.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", [updatedAtIso, id]);
    },
    /** A user rename always wins and freezes auto-naming (spec 041 §1): title changes and
     * auto_title is cleared in the same statement, so the trail-card display (`auto_title ??
     * title`) falls back to this title and future auto-naming passes leave it alone. */
    async rename(id: string, title: string): Promise<void> {
      await sql.execute("UPDATE conversations SET title = ?, auto_title = NULL WHERE id = ?", [
        title,
        id,
      ]);
    },
    /** Recomputed after every new station on the trail (spec 041 §1) — only ever touches
     * auto_title, never updated_at, so a fresh name never reshuffles the sidebar's order. */
    async setAutoTitle(id: string, autoTitle: string | null): Promise<void> {
      await sql.execute("UPDATE conversations SET auto_title = ? WHERE id = ?", [autoTitle, id]);
    },
    /** Flips the 学习模式 toggle (spec 052); never touches updated_at, so toggling alone
     * does not reshuffle the sidebar. */
    async setStudyMode(id: string, studyMode: 0 | 1): Promise<void> {
      await sql.execute("UPDATE conversations SET study_mode = ? WHERE id = ?", [studyMode, id]);
    },
  };
}

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

interface CostSumRow {
  currency: Currency;
  total_micros: number | null;
}

export interface PurposeCostRow {
  purpose: string;
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
    /** Today's spend broken down by feature (purpose) — feeds the meter详情 tooltip. */
    async sumCostSinceByPurpose(sinceIso: string): Promise<PurposeCostRow[]> {
      return sql.select<PurposeCostRow>(
        `SELECT purpose, currency, SUM(cost_micros) AS total_micros FROM llm_calls
         WHERE created_at >= ? GROUP BY purpose, currency ORDER BY total_micros DESC`,
        [sinceIso],
      );
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
