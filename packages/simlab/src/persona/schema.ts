/**
 * Purpose: the simulated-student persona contract — a knowledge axis (what the
 * persona actually knows, ground truth for "被看见" recall) kept strictly separate from a
 * behavior axis (how the persona acts), per UserSimCRS, plus the language axis: which
 * language this learner actually writes in.
 * Main exports: personaSchema, Persona, PersonaBehavior.
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
  /** 0 = writes purely in the persona's own language, 1 = drops English technical terms into
   * almost every sentence. English is the donor language for every persona; a Chinese学习者
   * saying "closure" and a Korean one saying "variable" are the same behaviour. */
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
  /** BCP-47 tag of the language this learner writes in — a row in core-i18n's LANGUAGES.
   * Drives the student prompt's language directive, so a persona's own text, its concept
   * labels and the reply it provokes are all in one language. */
  language: z.string().min(2),
  /** Human-readable persona name, in the persona's own language, e.g. "高困惑新手". */
  name: z.string().min(1),
  /** One sentence, in the persona's own language: who this learner is and how they behave.
   * It goes verbatim into the student system prompt, so it stays in character — the reason
   * the persona exists as a test scenario belongs in a comment above it, not in here. */
  description: z.string().min(1),
  knowledge: personaKnowledgeSchema,
  behavior: personaBehaviorSchema,
});

export type PersonaBehavior = z.infer<typeof personaBehaviorSchema>;
export type Persona = z.infer<typeof personaSchema>;
