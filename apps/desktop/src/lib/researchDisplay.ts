/**
 * Purpose: Zod boundary for a research_results row's JSON columns (spec 036) — display_json
 * and results_json are read back from the DB and must be validated before rendering, same as
 * any other external input. Main exports: parseResearchResultDisplay, ParsedStatResult.
 */
import type { ResearchResultRow } from "@breadcrumb/core-db";
import { type DisplayBlock, displayBlockSchema } from "@breadcrumb/plugin-research";
import { z } from "zod";

// Mirrors @breadcrumb/plugin-research's StatResult type (statResults.ts exports the type
// only, no Zod schema — this is the "compose it yourself" boundary the task calls for).
const statResultSchema = z.union([
  z.object({ kind: z.literal("number"), value: z.number(), n: z.number() }),
  z.object({
    kind: z.literal("bars"),
    bars: z.array(z.object({ label: z.string(), value: z.number() })),
  }),
]);
export type ParsedStatResult = z.infer<typeof statResultSchema>;

export interface ParsedResearchResult {
  display: DisplayBlock[];
  results: ParsedStatResult[];
}

/** Parses one row's stored JSON columns. Returns null on malformed data instead of
 * throwing — a corrupted row must never crash the panel, only be silently skipped. */
export function parseResearchResultDisplay(row: ResearchResultRow): ParsedResearchResult | null {
  try {
    const display = z.array(displayBlockSchema).parse(JSON.parse(row.display_json));
    const results = z.array(statResultSchema).parse(JSON.parse(row.results_json));
    return { display, results };
  } catch {
    return null;
  }
}
