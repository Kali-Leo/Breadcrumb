/**
 * Purpose: Zod schema for the Character Card V2 subset (spec 037) used by the companion
 * cast — we implement the SillyTavern-ecosystem card format, never copy its spec prose.
 * Main exports: CompanionCardSchema, CompanionCard, parseCompanionCard.
 *
 * The cards still carry a knowledgeBoundary array and the schema still validates it, but the
 * lookup that read it (matchKnowledgeBoundary) belonged to the fixed cast and went with the
 * daily-helper redesign (spec 050 §9). Deleted 2026-09-02 rather than left in place looking
 * wired up.
 */
import { z } from "zod";

export const companionRoleSchema = z.enum(["student", "peer", "mentor"]);

/** Lorebook-style entry: any of `keys` appearing (case-insensitive substring) in recent
 * conversation text triggers injecting `content` into the companion's context. */
export const knowledgeBoundaryEntrySchema = z.object({
  keys: z.array(z.string().min(1)).min(1),
  content: z.string().min(1),
});

const breadcrumbExtensionSchema = z.object({
  role: companionRoleSchema,
  /** How this companion's ability relates to the user's — e.g. "below the learner". */
  competenceNote: z.string().min(1),
  knowledgeBoundary: z.array(knowledgeBoundaryEntrySchema),
});

const companionCardDataSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  personality: z.string().min(1),
  scenario: z.string().min(1),
  first_mes: z.string().min(1),
  mes_example: z.string().min(1),
  creator_notes: z.string().min(1),
  tags: z.array(z.string().min(1)),
  creator: z.string().min(1),
  character_version: z.string().min(1),
  extensions: z.object({
    breadcrumb: breadcrumbExtensionSchema,
  }),
});

export const CompanionCardSchema = z.object({
  spec: z.literal("chara_card_v2"),
  spec_version: z.literal("2.0"),
  data: companionCardDataSchema,
});
export type CompanionCard = z.infer<typeof CompanionCardSchema>;

/** Boundary parse for anything claiming to be a companion card. Throws with a readable
 * message (Zod's default `.parse` error) on any mismatch. */
export function parseCompanionCard(json: unknown): CompanionCard {
  return CompanionCardSchema.parse(json);
}
