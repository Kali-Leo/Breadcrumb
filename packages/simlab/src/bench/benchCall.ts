/**
 * Purpose: one scenario, one model, one measurement. JSON purposes go through core-llm's
 * chatJson — the same entry point the product uses, so the schema verdict here IS the
 * product's verdict, corrective retry included. Prose purposes go through the shared
 * non-streaming helper. Either way the reply, its usage, its latency and how many HTTP
 * requests it took are all recorded, including for a call that failed: a failed call is
 * billed like any other.
 *
 * Main exports: runScenarioCall, BenchOutcome, FailureKind.
 */
import { buildLanguageDirective, languageOf } from "@breadcrumb/core-i18n";
import {
  ChatJsonError,
  chatJson,
  type LlmClientConfig,
  type TokenUsage,
  withLanguageDirective,
} from "@breadcrumb/core-llm";
import { nonStreamingChat } from "../runner/nonStreamingChat";
import { createBenchFetch } from "./benchFetch";
import { foldSystemMessagesFirst } from "./messagePrep";
import { type ResolvedBenchModel, requiresLeadingSystem } from "./providers";
import type { BenchScenario, CheckScores } from "./scenarioTypes";
import { judgeProseReply } from "./scoring/proseJudge";

/** Why a call produced nothing usable. Kept coarse on purpose — the report needs to separate
 * "the model cannot hold the contract" from "the endpoint was unreachable", and finer detail
 * belongs in the per-call record, not in a column. */
export type FailureKind = "schema" | "transport" | "empty";

export interface BenchOutcome {
  scenarioId: string;
  purpose: string;
  language: string;
  modelId: string;
  ok: boolean;
  /** True when the reply satisfied the schema on the FIRST request — no corrective retry.
   * This is the number that separates a model you can build on from one you can survive. */
  firstTry: boolean;
  /** HTTP requests the call actually took (transport retries and the correction included). */
  attempts: number;
  latencyMs: number;
  usage: TokenUsage;
  failure: { kind: FailureKind; message: string } | null;
  checks: CheckScores;
  /** The validated reply, kept so the reference run can be compared against. */
  parsed?: unknown;
  /** The prose reply, same purpose. */
  reply?: string;
  /** True when the prompt had to be reshaped for this provider (see messagePrep.ts). The
   * instructions are identical; only their position moved. */
  compatFolded: boolean;
}

/** Error text is the model's own, and jsonClient already keeps learner text out of it (it
 * refuses to quote a malformed reply). Truncated anyway: a result file is read by people. */
const MAX_FAILURE_CHARS = 200;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_FAILURE_CHARS);
}

function configFor(
  model: ResolvedBenchModel,
  language: string,
  fetchImpl: typeof globalThis.fetch,
): LlmClientConfig {
  const resolved = languageOf(language);
  return {
    ...model.config,
    fetchImpl,
    // The shipped app appends this to every call; a bench that dropped it would measure a
    // configuration nobody runs, and the directive is exactly where weak models start
    // translating the enum values their schema forbids translating.
    answerLanguageDirective: resolved === null ? undefined : buildLanguageDirective(resolved),
  };
}

export async function runScenarioCall(
  scenario: BenchScenario,
  model: ResolvedBenchModel,
): Promise<BenchOutcome> {
  const probe = createBenchFetch();
  const folded = requiresLeadingSystem(model.providerId);
  const built = configFor(model, scenario.language, probe.fetchImpl);
  // For a provider that only accepts a leading system message the directive is folded into
  // the prompt here, and chatJson is told not to append its own.
  const config: LlmClientConfig = folded ? { ...built, answerLanguageDirective: undefined } : built;
  const withDirective = withLanguageDirective(scenario.messages, built.answerLanguageDirective);
  const jsonMessages = folded ? foldSystemMessagesFirst(withDirective) : scenario.messages;
  const proseMessages = folded ? jsonMessages : withDirective;
  const base = {
    scenarioId: scenario.id,
    purpose: scenario.purpose,
    language: scenario.language,
    modelId: model.id,
    compatFolded: folded,
  };
  const startedAt = Date.now();
  const finish = (): { attempts: number; latencyMs: number } => ({
    attempts: probe.records().length,
    latencyMs: Date.now() - startedAt,
  });
  /**
   * A call whose LAST request never came back 2xx failed at the endpoint, not at the model's
   * judgement — that is the difference between "cannot do the job" and "was not reachable".
   * The last request rather than any: a 429 that the transport layer then retried
   * successfully is not what the call died of.
   */
  const failureKind = (error: unknown): FailureKind => {
    const last = probe.records().at(-1);
    if (last === undefined || last.status === 0 || last.status >= 400) return "transport";
    return error instanceof ChatJsonError ? "schema" : "transport";
  };

  if (scenario.kind === "json") {
    try {
      const { parsed, usage } = await chatJson(config, jsonMessages, scenario.schema);
      const timing = finish();
      return {
        ...base,
        ...timing,
        ok: true,
        firstTry: timing.attempts === 1,
        usage,
        failure: null,
        checks: scenario.check(parsed),
        parsed,
      };
    } catch (error) {
      const timing = finish();
      const usage =
        error instanceof ChatJsonError ? error.usage : { inputTokens: 0, outputTokens: 0 };
      const kind = failureKind(error);
      return {
        ...base,
        ...timing,
        ok: false,
        firstTry: false,
        usage,
        failure: { kind, message: describe(error) },
        checks: {},
      };
    }
  }

  try {
    const { content, usage } = await nonStreamingChat(config, proseMessages);
    const timing = finish();
    const checks = await judgeProseReply({
      reply: content,
      language: scenario.language,
      targetConcepts: scenario.targetConcepts,
      companion: scenario.purpose === "companion-chat",
    });
    return {
      ...base,
      ...timing,
      ok: content.trim().length > 0,
      firstTry: timing.attempts === 1 && content.trim().length > 0,
      usage,
      failure: content.trim().length === 0 ? { kind: "empty", message: "empty reply" } : null,
      checks,
      reply: content,
    };
  } catch (error) {
    const timing = finish();
    return {
      ...base,
      ...timing,
      ok: false,
      firstTry: false,
      usage: { inputTokens: 0, outputTokens: 0 },
      failure: { kind: failureKind(error), message: describe(error) },
      checks: {},
    };
  }
}
