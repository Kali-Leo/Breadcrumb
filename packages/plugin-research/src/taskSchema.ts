/**
 * Purpose: the declarative research-task contract (spec 036) — Zod schemas for the whitelisted
 * statistic calls, the constrained display template, and the signed task envelope.
 * Main exports: researchTaskSchema, signedResearchTaskSchema, parseSignedResearchTask, types.
 */
import { z } from "zod";

/** Whitelisted aggregate statistics. Institutions pick and parameterize; they never ship code. */
export const statCallSchema = z.discriminatedUnion("fn", [
  z.object({
    fn: z.literal("count"),
    metric: z.enum([
      "concepts_known",
      "encounters_total",
      "active_days",
      "woven_words_seen",
      "woven_words_settled",
      "conversations_total",
    ]),
  }),
  z.object({
    fn: z.literal("histogram"),
    metric: z.enum(["encounters_per_node", "retention_per_node", "events_per_weekday"]),
    bucketCount: z.number().int().min(2).max(12).default(6),
  }),
  z.object({
    fn: z.literal("retention_summary"),
    // Aggregate FSRS retrievability across all known nodes: mean, median, share above threshold.
    threshold: z.number().min(0.5).max(0.99).default(0.9),
  }),
  z.object({
    fn: z.literal("correlation"),
    // Pearson correlation between two per-day series; only the coefficient and n leave the call.
    xMetric: z.enum(["daily_encounters", "daily_word_events", "daily_messages"]),
    yMetric: z.enum(["daily_encounters", "daily_word_events", "daily_messages"]),
    windowDays: z.number().int().min(7).max(180).default(60),
  }),
]);
export type StatCall = z.infer<typeof statCallSchema>;

/** Constrained result template: text, single stats, or bar lists — no markup, no code. */
export const displayBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(500) }),
  z.object({
    kind: z.literal("stat"),
    label: z.string().min(1).max(80),
    callIndex: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("bars"),
    label: z.string().min(1).max(80),
    callIndex: z.number().int().min(0),
  }),
]);
export type DisplayBlock = z.infer<typeof displayBlockSchema>;

export const researchTaskSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
    institution: z.string().min(1).max(120),
    title: z.string().min(1).max(120),
    /** Human-readable research purpose — mandatory, shown verbatim to the user. */
    purpose: z.string().min(10).max(1000),
    /** Optional ethics-review reference (e.g. an IRB protocol id), shown when present. */
    ethicsNote: z.string().max(300).optional(),
    calls: z.array(statCallSchema).min(1).max(8),
    display: z.array(displayBlockSchema).min(1).max(12),
    /** ISO date after which the task is ignored even if cached. */
    expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  })
  .refine(
    (task) =>
      task.display.every((block) => block.kind === "text" || block.callIndex < task.calls.length),
    { message: "display block references a call index that does not exist" },
  );
export type ResearchTask = z.infer<typeof researchTaskSchema>;

/** Distribution envelope: the payload plus an Ed25519 signature over its canonical JSON. */
export const signedResearchTaskSchema = z.object({
  payload: researchTaskSchema,
  /** Hex-encoded Ed25519 signature by the project signing key. */
  signature: z.string().regex(/^[0-9a-f]{128}$/),
});
export type SignedResearchTask = z.infer<typeof signedResearchTaskSchema>;

/** Boundary parse for anything claiming to be a signed task. Throws ZodError on mismatch. */
export function parseSignedResearchTask(input: unknown): SignedResearchTask {
  return signedResearchTaskSchema.parse(input);
}
