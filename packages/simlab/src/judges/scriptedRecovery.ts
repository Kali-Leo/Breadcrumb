/**
 * Purpose: the self-graded scripted-recovery eval (spec 013 T4, `sim recovery` subcommand) —
 * runs a hard-confused and a hard-bored seed persona for a few real rounds each and checks
 * that the dominant extracted interest signal matches the persona's own script. The script
 * (the persona's behavior axis) IS the ground truth; no AI judge involved.
 * Main exports: runScriptedRecovery, ScriptedRecoveryResult, DEFAULT_RECOVERY_ROUNDS.
 */
import type { LlmClientConfig } from "@breadcrumb/core-llm";
import { createTempDatabase } from "../db/sqliteClient";
import { SEED_PERSONAS } from "../persona/seeds";
import type { JourneyLogWriter } from "../runner/artifacts";
import { runConversation } from "../runner/conversation";
import { createCostGuard } from "../runner/costGuard";

export const DEFAULT_RECOVERY_ROUNDS = 3;

export type DominantSignal = "curiosity" | "confusion" | "boredom";

export interface ScriptedRecoveryResult {
  personaId: string;
  expectedDominant: "confusion" | "boredom";
  dominantSignal: DominantSignal | null;
  matches: boolean;
  averages: { curiosity: number; confusion: number; boredom: number };
  signalCount: number;
}

const NOOP_LOG: JourneyLogWriter = {
  path: "(scripted-recovery, discarded)",
  writeLine: () => undefined,
};

export async function runScriptedRecovery(
  personaId: string,
  expectedDominant: "confusion" | "boredom",
  llmConfig: LlmClientConfig,
  rounds: number = DEFAULT_RECOVERY_ROUNDS,
): Promise<ScriptedRecoveryResult> {
  const persona = SEED_PERSONAS.find((candidate) => candidate.id === personaId);
  if (persona === undefined) throw new Error(`unknown seed persona id: ${personaId}`);

  const temp = await createTempDatabase();
  try {
    const conversationId = "recovery-conversation";
    const now = "2026-08-01T09:00:00.000Z";
    await temp.repos.conversations.create({
      id: conversationId,
      title: "recovery",
      created_at: now,
      updated_at: now,
      kind: "chat",
    });

    await runConversation({
      repos: temp.repos,
      conversationId,
      persona,
      llmConfig,
      costGuard: createCostGuard(Number.POSITIVE_INFINITY),
      log: NOOP_LOG,
      day: 0,
      maxRounds: rounds,
      startIso: now,
    });

    const signals = await temp.repos.interestSignals.listAll();
    const averages = {
      curiosity: average(signals.map((s) => s.curiosity)),
      confusion: average(signals.map((s) => s.confusion)),
      boredom: average(signals.map((s) => s.boredom)),
    };
    const dominantSignal = signals.length === 0 ? null : dominantOf(averages);

    return {
      personaId,
      expectedDominant,
      dominantSignal,
      matches: dominantSignal === expectedDominant,
      averages,
      signalCount: signals.length,
    };
  } finally {
    temp.close();
  }
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function dominantOf(averages: {
  curiosity: number;
  confusion: number;
  boredom: number;
}): DominantSignal {
  const entries = Object.entries(averages) as [DominantSignal, number][];
  return entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}
