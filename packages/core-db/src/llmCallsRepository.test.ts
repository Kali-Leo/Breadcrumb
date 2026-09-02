/**
 * Purpose: averageUsageByPurpose against a real migrated database — it must average per
 * purpose within one model, ignore other models, skip the 0/0 rows a provider that never
 * reported usage left behind, and read a missing cached_input_tokens as zero.
 */
import { describe, expect, it } from "vitest";
import { createLlmCallsRepo } from "./llmCallsRepository";
import { openMigratedDatabase } from "./realSqliteTestFixture";

interface CallInput {
  purpose: string;
  model: string;
  input: number;
  output: number;
  cached?: number | null;
}

async function seed(
  repo: ReturnType<typeof createLlmCallsRepo>,
  calls: readonly CallInput[],
): Promise<void> {
  let index = 0;
  for (const call of calls) {
    index += 1;
    await repo.record({
      id: `call-${index}`,
      conversation_id: null,
      purpose: call.purpose,
      model: call.model,
      input_tokens: call.input,
      output_tokens: call.output,
      cached_input_tokens: call.cached ?? null,
      cost_micros: 0,
      currency: "CNY",
      created_at: `2026-09-0${index}T00:00:00.000Z`,
    });
  }
}

describe("averageUsageByPurpose", () => {
  it("averages each purpose's recorded usage for the given model only", async () => {
    const database = await openMigratedDatabase();
    try {
      const repo = createLlmCallsRepo(database.sql);
      await seed(repo, [
        { purpose: "knowledge-tree", model: "deepseek-v4-flash", input: 1000, output: 500 },
        { purpose: "knowledge-tree", model: "deepseek-v4-flash", input: 1400, output: 700 },
        { purpose: "chat", model: "deepseek-v4-flash", input: 2000, output: 300 },
        // Another model's rows must not leak into this model's average.
        { purpose: "knowledge-tree", model: "other-model", input: 10, output: 10 },
      ]);

      const averages = await repo.averageUsageByPurpose("deepseek-v4-flash");

      const byPurpose = new Map(averages.map((row) => [row.purpose, row]));
      expect(byPurpose.get("knowledge-tree")).toEqual({
        purpose: "knowledge-tree",
        samples: 2,
        inputTokens: 1200,
        outputTokens: 600,
        cachedInputTokens: 0,
      });
      expect(byPurpose.get("chat")?.samples).toBe(1);
      expect(byPurpose.get("chat")?.inputTokens).toBe(2000);
    } finally {
      database.close();
    }
  });

  it("leaves out the rows where the provider reported no usage at all", async () => {
    const database = await openMigratedDatabase();
    try {
      const repo = createLlmCallsRepo(database.sql);
      await seed(repo, [
        { purpose: "trail-summary", model: "m", input: 0, output: 0 },
        { purpose: "trail-summary", model: "m", input: 0, output: 0 },
        { purpose: "trail-summary", model: "m", input: 200, output: 2000 },
      ]);

      const [average] = await repo.averageUsageByPurpose("m");

      expect(average).toEqual({
        purpose: "trail-summary",
        samples: 1,
        inputTokens: 200,
        outputTokens: 2000,
        cachedInputTokens: 0,
      });
    } finally {
      database.close();
    }
  });

  it("averages reported cache hits and counts an unreported one as none", async () => {
    const database = await openMigratedDatabase();
    try {
      const repo = createLlmCallsRepo(database.sql);
      await seed(repo, [
        { purpose: "chat", model: "m", input: 1000, output: 100, cached: 800 },
        { purpose: "chat", model: "m", input: 1000, output: 100, cached: null },
      ]);

      const [average] = await repo.averageUsageByPurpose("m");

      expect(average?.cachedInputTokens).toBe(400);
    } finally {
      database.close();
    }
  });

  it("returns nothing for a model that has never been called", async () => {
    const database = await openMigratedDatabase();
    try {
      const repo = createLlmCallsRepo(database.sql);
      await seed(repo, [{ purpose: "chat", model: "m", input: 10, output: 10 }]);

      expect(await repo.averageUsageByPurpose("never-used")).toEqual([]);
    } finally {
      database.close();
    }
  });
});
