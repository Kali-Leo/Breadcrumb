/**
 * Purpose: integration test for the full journey loop (multi-day, multi-conversation, journey
 * actions, day digests) against a fake fetch dispatched by call shape/system-prompt — no
 * network, no API key required. Every LLM call type the journey can make is stubbed: student
 * and tutor streaming, and the four chatJson pipelines (extraction, edge-judge, interest,
 * self-report, goal-mapping).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCallLedger } from "../judges/callLedger";
import { loadPressureLexicon } from "../judges/pressureLexicon";
import type { PressureHitSample } from "../judges/telemetry";
import { SEED_PERSONAS } from "../persona/seeds";
import { STOP_TOKEN } from "../persona/studentPrompt";
import { createRunArtifacts } from "./artifacts";
import { createCostGuard } from "./costGuard";
import { runJourney } from "./journey";

let artifactsBaseDir: string;

afterEach(() => {
  if (artifactsBaseDir) rmSync(artifactsBaseDir, { recursive: true, force: true });
});

function sseFor(content: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n`),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function jsonCompletion(content: unknown): Response {
  return Response.json({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

/** Every conversation follows the same deterministic shape: the student asks once, then
 * stops — so exactly one real round (and one full pipeline pass) runs per conversation,
 * regardless of the randomly-chosen maxRounds for that conversation. */
function makeFakeFetch(): typeof fetch {
  let turnInConversation = 0;
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      stream?: boolean;
      messages: { role: string; content: string }[];
    };
    if (body.stream === true) {
      const isStudent = body.messages[0]?.role === "system";
      if (isStudent) {
        turnInConversation += 1;
        if (turnInConversation >= 2) {
          turnInConversation = 0;
          return sseFor(STOP_TOKEN);
        }
        return sseFor("这是什么意思？");
      }
      return sseFor("这是关于该主题的一段讲解。");
    }

    const systemPrompt = body.messages[0]?.content ?? "";
    if (systemPrompt.includes("知识结构提取器")) {
      return jsonCompletion({
        nodes: [{ label: "测试概念", summary: "集成测试用占位知识点", parentLabel: null }],
      });
    }
    if (systemPrompt.includes("知识关系判定器")) {
      return jsonCompletion({ edges: [], methodNodes: [] });
    }
    if (systemPrompt.includes("学习心理观察者")) {
      return jsonCompletion({
        signals: [{ label: "测试概念", curiosity: 0.5, confusion: 0.1, boredom: 0.1, styles: [] }],
      });
    }
    if (systemPrompt.includes("自报知识映射器")) {
      return jsonCompletion({ mappings: [] });
    }
    if (systemPrompt.includes("学习目标拆解器")) {
      return jsonCompletion({ existing: [], suggested: [] });
    }
    if (systemPrompt.includes("温柔的学习见证者")) {
      return jsonCompletion({ summary: "今天搞懂了测试概念，真棒！" });
    }
    throw new Error(`unexpected LLM call: ${systemPrompt.slice(0, 40)}`);
  }) as typeof fetch;
}

describe("runJourney", () => {
  it("runs a multi-day journey end to end and produces one digest per day", async () => {
    artifactsBaseDir = mkdtempSync(join(tmpdir(), "breadcrumb-simlab-journey-"));
    const artifacts = createRunArtifacts(artifactsBaseDir, "run-test");
    const log = artifacts.openSessionLog(0);
    const persona = SEED_PERSONAS[0];
    if (persona === undefined) throw new Error("no seed persona");

    const days = 3;
    const result = await runJourney({
      persona,
      journeyIndex: 0,
      days,
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        model: "test-model",
        fetchImpl: makeFakeFetch(),
      },
      costGuard: createCostGuard(1000),
      log,
      startIso: "2026-08-01T09:00:00.000Z",
    });

    expect(result.days).toBe(days);
    expect(result.dayDigests).toHaveLength(days);
    expect(result.journeyId).toMatch(/^j0-/);
    expect(result.personaId).toBe(persona.id);
    expect(result.pipelineFailures).toEqual([]);
    // The db file is cleaned up once the journey finishes.
    expect(existsSync(result.dbPath)).toBe(false);

    const lines = readFileSync(log.path, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const events = lines.map((line) => line.event as string);
    expect(events[0]).toBe("journey-start");
    expect(events.at(-1)).toBe("journey-end");
    expect(events.filter((event) => event === "day-digest")).toHaveLength(days);
  });

  it("is deterministic: the same persona/journeyIndex/startIso produces the same shape of run", async () => {
    artifactsBaseDir = mkdtempSync(join(tmpdir(), "breadcrumb-simlab-journey-det-"));
    const artifacts = createRunArtifacts(artifactsBaseDir, "run-test");
    const maybePersona = SEED_PERSONAS[1];
    if (maybePersona === undefined) throw new Error("no seed persona");
    const persona = maybePersona;

    let logIndex = 0;
    async function run() {
      logIndex += 1;
      const log = artifacts.openSessionLog(logIndex);
      return runJourney({
        persona,
        journeyIndex: 5,
        days: 2,
        llmConfig: {
          baseUrl: "https://api.example.com/v1",
          apiKey: "key",
          model: "test-model",
          fetchImpl: makeFakeFetch(),
        },
        costGuard: createCostGuard(1000),
        log,
        startIso: "2026-08-01T09:00:00.000Z",
      });
    }

    const a = await run();
    const b = await run();
    expect(a.totalConversations).toBe(b.totalConversations);
    expect(a.totalRounds).toBe(b.totalRounds);
    expect(a.newNodeLabels).toEqual(b.newNodeLabels);
  });

  it("threads telemetry through: ledger tallies successes, pressure hits are reported from both tutor replies and trail summaries", async () => {
    artifactsBaseDir = mkdtempSync(join(tmpdir(), "breadcrumb-simlab-journey-telemetry-"));
    const artifacts = createRunArtifacts(artifactsBaseDir, "run-test");
    const log = artifacts.openSessionLog(0);
    const persona = SEED_PERSONAS[2];
    if (persona === undefined) throw new Error("no seed persona");

    const ledger = createCallLedger();
    const pressureHits: PressureHitSample[] = [];
    let turnInConversation = 0;
    const pressureFetch = (async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        stream?: boolean;
        messages: { role: string; content: string }[];
      };
      if (body.stream === true) {
        const isStudent = body.messages[0]?.role === "system";
        if (isStudent) {
          turnInConversation += 1;
          if (turnInConversation >= 2) {
            turnInConversation = 0;
            return sseFor(STOP_TOKEN);
          }
          return sseFor("这是什么意思？");
        }
        return sseFor("你还差一点就懂了，这是关于该主题的讲解。");
      }
      const systemPrompt = body.messages[0]?.content ?? "";
      if (systemPrompt.includes("知识结构提取器")) {
        return jsonCompletion({
          nodes: [{ label: "测试概念", summary: "占位", parentLabel: null }],
        });
      }
      if (systemPrompt.includes("知识关系判定器"))
        return jsonCompletion({ edges: [], methodNodes: [] });
      if (systemPrompt.includes("学习心理观察者")) {
        return jsonCompletion({
          signals: [{ label: "测试概念", curiosity: 0.5, confusion: 0, boredom: 0, styles: [] }],
        });
      }
      if (systemPrompt.includes("自报知识映射器")) return jsonCompletion({ mappings: [] });
      if (systemPrompt.includes("学习目标拆解器"))
        return jsonCompletion({ existing: [], suggested: [] });
      if (systemPrompt.includes("温柔的学习见证者")) {
        return jsonCompletion({ summary: "你还差一点就能全部搞懂了。" });
      }
      throw new Error(`unexpected LLM call: ${systemPrompt.slice(0, 40)}`);
    }) as typeof fetch;

    await runJourney({
      persona,
      journeyIndex: 0,
      days: 1,
      llmConfig: {
        baseUrl: "https://api.example.com/v1",
        apiKey: "key",
        model: "test-model",
        fetchImpl: pressureFetch,
      },
      costGuard: createCostGuard(1000),
      log,
      startIso: "2026-08-01T09:00:00.000Z",
      telemetry: {
        ledger,
        pressureLexicon: loadPressureLexicon(),
        onPressureHit: (sample) => pressureHits.push(sample),
      },
    });

    const tallies = ledger.snapshot();
    expect(tallies["knowledge-tree"]?.success).toBeGreaterThan(0);
    expect(pressureHits.some((hit) => hit.source === "tutor")).toBe(true);
    expect(pressureHits.some((hit) => hit.source === "trail-summary")).toBe(true);
  });
});
