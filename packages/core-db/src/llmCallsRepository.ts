/**
 * Purpose: SQL statements for the llm_calls table — one row per paid model call, and the
 * spend rollups the meter reads. Rows outlive the conversation they were made in: deleting a
 * chat clears the link, never the record of money already spent.
 * Main exports: createLlmCallsRepo factory, PurposeCostRow, PurposeAverageUsage.
 */
import type { LlmCallRow } from "./chatTypes";
import type { Currency, SqlClient } from "./types";

interface CostSumRow {
  currency: Currency;
  total_micros: number | null;
}

export interface PurposeCostRow {
  purpose: string;
  currency: Currency;
  total_micros: number | null;
}

/** What one call of a purpose has actually cost this account in tokens, averaged over the
 * rows the provider reported usage for. Feeds the spending page's per-use estimate, which
 * prefers this over the catalogue's word-count conversion — that conversion counts only the
 * prompt and a typical reply, so on a model that bills its own thinking as output it lands
 * far under the real bill. */
export interface PurposeAverageUsage {
  purpose: string;
  /** How many recorded calls the average is over. */
  samples: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

interface AverageUsageRow {
  purpose: string;
  samples: number;
  avg_input_tokens: number | null;
  avg_output_tokens: number | null;
  avg_cached_input_tokens: number | null;
}

export function createLlmCallsRepo(sql: SqlClient) {
  return {
    async record(row: LlmCallRow): Promise<void> {
      await sql.execute(
        `INSERT INTO llm_calls
           (id, conversation_id, purpose, model, input_tokens, output_tokens, cached_input_tokens,
            cost_micros, currency, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.conversation_id,
          row.purpose,
          row.model,
          row.input_tokens,
          row.output_tokens,
          row.cached_input_tokens ?? null,
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
    /**
     * Average recorded token usage per purpose for one model. Rows whose input and output
     * are both zero are left out: they are the calls whose provider ignored usage reporting
     * (see metering.ts), and averaging those in would drag every estimate toward zero.
     */
    async averageUsageByPurpose(model: string): Promise<PurposeAverageUsage[]> {
      const rows = await sql.select<AverageUsageRow>(
        `SELECT purpose,
                COUNT(*) AS samples,
                AVG(input_tokens) AS avg_input_tokens,
                AVG(output_tokens) AS avg_output_tokens,
                AVG(COALESCE(cached_input_tokens, 0)) AS avg_cached_input_tokens
         FROM llm_calls
         WHERE model = ? AND input_tokens + output_tokens > 0
         GROUP BY purpose`,
        [model],
      );
      return rows.map((row) => ({
        purpose: row.purpose,
        samples: row.samples,
        inputTokens: row.avg_input_tokens ?? 0,
        outputTokens: row.avg_output_tokens ?? 0,
        cachedInputTokens: row.avg_cached_input_tokens ?? 0,
      }));
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
