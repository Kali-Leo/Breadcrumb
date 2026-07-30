/**
 * Purpose: all SQL statements in one place — typed repository functions over SqlClient.
 * Main exports: settingsRepo, conversationsRepo, messagesRepo, llmCallsRepo factories.
 */
import type {
  ConversationRow,
  Currency,
  FactcheckClaimRow,
  FactcheckRunRow,
  KnowledgeNodeRow,
  LlmCallRow,
  MessageRow,
  NodeEmbeddingRow,
  NodeSightingRow,
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
        "INSERT INTO knowledge_nodes (id, parent_id, label, summary, created_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.parent_id, row.label, row.summary, row.created_at],
      );
    },
    /** The user's whole tree, oldest first. */
    async listAll(): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        "SELECT * FROM knowledge_nodes ORDER BY created_at ASC, id ASC",
      );
    },
    /** Nodes first learned inside [fromIso, toIso) — the raw material of the daily trail. */
    async listCreatedBetween(fromIso: string, toIso: string): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        "SELECT * FROM knowledge_nodes WHERE created_at >= ? AND created_at < ? ORDER BY created_at ASC",
        [fromIso, toIso],
      );
    },
  };
}

export function createNodeEmbeddingsRepo(sql: SqlClient) {
  return {
    async upsert(row: NodeEmbeddingRow): Promise<void> {
      await sql.execute(
        `INSERT INTO node_embeddings (node_id, model, vector_json, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           model = excluded.model, vector_json = excluded.vector_json, created_at = excluded.created_at`,
        [row.node_id, row.model, row.vector_json, row.created_at],
      );
    },
    async listAll(): Promise<NodeEmbeddingRow[]> {
      return sql.select<NodeEmbeddingRow>("SELECT * FROM node_embeddings");
    },
    /** Nodes that still lack an embedding — the backfill queue. */
    async listNodesMissingEmbedding(): Promise<KnowledgeNodeRow[]> {
      return sql.select<KnowledgeNodeRow>(
        `SELECT k.* FROM knowledge_nodes k
         LEFT JOIN node_embeddings e ON e.node_id = k.id
         WHERE e.node_id IS NULL ORDER BY k.created_at ASC`,
      );
    },
  };
}

export function createNodeSightingsRepo(sql: SqlClient) {
  return {
    async record(row: NodeSightingRow): Promise<void> {
      await sql.execute(
        "INSERT INTO node_sightings (id, node_id, conversation_id, message_id, created_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.node_id, row.conversation_id, row.message_id, row.created_at],
      );
    },
    /** Every footprint ever — raw material for the memory (fog) engine. */
    async listAll(): Promise<NodeSightingRow[]> {
      return sql.select<NodeSightingRow>("SELECT * FROM node_sightings ORDER BY created_at ASC");
    },
    /** This conversation's footprints in walking order — the session trail. */
    async listByConversation(conversationId: string): Promise<NodeSightingRow[]> {
      return sql.select<NodeSightingRow>(
        "SELECT * FROM node_sightings WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
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

export function createFactcheckRepo(sql: SqlClient) {
  return {
    async recordRun(run: FactcheckRunRow, claims: readonly FactcheckClaimRow[]): Promise<void> {
      await sql.execute(
        "INSERT INTO factcheck_runs (id, message_id, conversation_id, created_at) VALUES (?, ?, ?, ?)",
        [run.id, run.message_id, run.conversation_id, run.created_at],
      );
      for (const claim of claims) {
        await sql.execute(
          `INSERT INTO factcheck_claims
             (id, run_id, claim_text, relationship, reasoning, evidence_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.id,
            claim.run_id,
            claim.claim_text,
            claim.relationship,
            claim.reasoning,
            claim.evidence_json,
            claim.created_at,
          ],
        );
      }
    },
    /** All runs of one conversation, oldest first — the newest run per message wins in UI. */
    async listRunsByConversation(conversationId: string): Promise<FactcheckRunRow[]> {
      return sql.select<FactcheckRunRow>(
        "SELECT * FROM factcheck_runs WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
        [conversationId],
      );
    },
    async listClaimsByRun(runId: string): Promise<FactcheckClaimRow[]> {
      return sql.select<FactcheckClaimRow>(
        "SELECT * FROM factcheck_claims WHERE run_id = ? ORDER BY created_at ASC, id ASC",
        [runId],
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
