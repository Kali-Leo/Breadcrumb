/**
 * Purpose: the simulated-student persona contract (spec 013 T2) — a knowledge axis (what the
 * persona actually knows, ground truth for "被看见" recall) kept strictly separate from a
 * behavior axis (how the persona acts), per UserSimCRS.
 * Main exports: personaSchema, Persona, PersonaKnowledge, PersonaBehavior.
 */
import { z } from "zod";

const unitInterval = z.number().min(0).max(1);

export const personaKnowledgeSchema = z.object({
  /** Concepts the persona genuinely already knows — safe to reference without confusion. */
  knownTopics: z.array(z.string().min(1)),
  /** Concepts the persona believes something WRONG about — a competence-paradox trap: the
   * persona must express its wrong belief, not the right answer, until corrected. */
  misconceptions: z.array(z.string().min(1)),
  /** What this session is "trying to learn" — the ground truth for targetConcepts recall. */
  targetConcepts: z.array(z.string().min(1)).min(1),
});

export const personaBehaviorSchema = z.object({
  /** 0 = perfect typing, 1 = frequent typos injected into every message. */
  typoRate: unitInterval,
  /** 0 = pure Chinese, 1 = heavy 中英混杂 (English terms dropped into Chinese sentences). */
  codeSwitching: unitInterval,
  /** 0 = stays on topic, 1 = frequently drifts to tangents mid-conversation. */
  driftTendency: unitInterval,
  /** How little boredom this persona tolerates before wanting to stop/skip; 0 = endless
   * patience, 1 = bored almost immediately. */
  boredomThreshold: unitInterval,
  /** How readily this persona expresses confusion rather than pretending to follow along. */
  confusionTendency: unitInterval,
});

export const personaSchema = z.object({
  id: z.string().min(1),
  /** Human-readable persona name, e.g. "高困惑新手". */
  name: z.string().min(1),
  /** One sentence: who this persona is and why it exists as a test scenario. */
  description: z.string().min(1),
  knowledge: personaKnowledgeSchema,
  behavior: personaBehaviorSchema,
});

export type PersonaKnowledge = z.infer<typeof personaKnowledgeSchema>;
export type PersonaBehavior = z.infer<typeof personaBehaviorSchema>;
export type Persona = z.infer<typeof personaSchema>;
