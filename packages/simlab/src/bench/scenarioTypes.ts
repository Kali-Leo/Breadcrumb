/**
 * Purpose: the shape of one bench scenario, and the factories that build one without losing
 * type safety. A scenario is a real prompt (built by the product's own message builder) plus
 * the two things that make a reply scoreable: the purpose's real Zod schema, and the
 * comparisons that say how good the parsed reply is.
 *
 * Scenarios are heterogeneous — every purpose has a different schema — so the runner sees
 * `unknown` and each scenario's own closures re-parse through their schema. That is what
 * keeps one array of scenarios possible with no `any` anywhere.
 *
 * Main exports: BenchScenario, JsonBenchScenario, ProseBenchScenario, jsonScenario,
 * proseScenario, CheckScores.
 */
import type { ChatMessage } from "@breadcrumb/core-llm";
import type { z } from "zod";

/** Named reference-free measurements of one reply, each already normalised to 0..1. */
export type CheckScores = Readonly<Record<string, number>>;

export interface JsonBenchScenario {
  kind: "json";
  /** The metered purpose this scenario exercises, e.g. "knowledge-tree". */
  purpose: string;
  /** Stable and unique across the whole suite: "<purpose>/<language>/<index>". */
  id: string;
  /** BCP-47 tag the prompt is written in — also what the answer-language directive names. */
  language: string;
  messages: ChatMessage[];
  schema: z.ZodType;
  /** Measurements that need no reference model: hallucinated labels, terms that are not in
   * the text, verdict counts that do not line up with the question. */
  check: (parsed: unknown) => CheckScores;
  /** How closely a candidate's reply matches the reference model's, 0..1. */
  agree: (reference: unknown, candidate: unknown) => number;
}

export interface ProseBenchScenario {
  kind: "prose";
  purpose: string;
  id: string;
  language: string;
  messages: ChatMessage[];
  /** Concepts the conversation is about — the input side of targetConceptsEcho. */
  targetConcepts: readonly string[];
  /** Measurements this scenario alone can make on the reply text, merged on top of the shared
   * prose judge (see scoring/proseJudge.ts). A purpose that only asks the shared questions
   * leaves it out; the abstention probes are the ones that need it, because what counts as a
   * good reply there depends on which group the question came from. */
  check?: (reply: string) => CheckScores;
}

export type BenchScenario = JsonBenchScenario | ProseBenchScenario;

export interface JsonScenarioSpec<Schema extends z.ZodType> {
  purpose: string;
  id: string;
  language: string;
  messages: ChatMessage[];
  schema: Schema;
  check?: (parsed: z.infer<Schema>) => CheckScores;
  agree: (reference: z.infer<Schema>, candidate: z.infer<Schema>) => number;
}

/**
 * Builds a scenario whose closures are typed against its own schema. The stored closures
 * re-parse the `unknown` they are handed: the runner only ever passes values that already
 * came out of this same schema, so the parse always succeeds and costs a few microseconds —
 * cheap for the alternative, which is a cast.
 */
export function jsonScenario<Schema extends z.ZodType>(
  spec: JsonScenarioSpec<Schema>,
): JsonBenchScenario {
  const { schema, check, agree } = spec;
  return {
    kind: "json",
    purpose: spec.purpose,
    id: spec.id,
    language: spec.language,
    messages: spec.messages,
    schema,
    check: (parsed) => (check === undefined ? {} : check(schema.parse(parsed))),
    agree: (reference, candidate) => agree(schema.parse(reference), schema.parse(candidate)),
  };
}

export function proseScenario(spec: Omit<ProseBenchScenario, "kind">): ProseBenchScenario {
  return { kind: "prose", ...spec };
}
