/**
 * Purpose: integration test for `sim summarize` — writes a fake run's metrics.json + a
 * flagged sample into the real (gitignored) artifacts directory, runs the command, and
 * checks summary.md lands with the expected content. Cleans up after itself.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRunArtifacts } from "../runner/artifacts";
import { resolveRepoRoot } from "../runner/config";
import { summarizeCommand } from "./summarizeCommand";

const artifactsBaseDir = join(resolveRepoRoot(), "packages/simlab/artifacts");
let runDir: string | null = null;

afterEach(() => {
  if (runDir) rmSync(runDir, { recursive: true, force: true });
  runDir = null;
});

describe("summarizeCommand", () => {
  it("writes summary.md from a run's metrics.json and flagged samples", async () => {
    const runId = "run-summarize-test-fixture";
    const artifacts = createRunArtifacts(artifactsBaseDir, runId);
    runDir = artifacts.dir;
    artifacts.writeMetrics({
      runId,
      requestedJourneys: 1,
      completedJourneys: 1,
      totalCostCny: 0.1,
      budgetCny: 5,
      edgeNetwork: { cycleRejectionCount: 0, targetConceptsRecall: 1 },
      mastery: { reencounterBoostValid: true, idleDecayValid: true, detail: [] },
      interest: { note: "n/a" },
      planner: {
        hardGateViolationCount: 0,
        reasonMismatchCount: 0,
        coverageArithmeticViolationCount: 0,
        totalInvariantChecks: 1,
      },
      crossCutting: {
        zodFailureRateByPurpose: {},
        pressureLexiconHits: { tutor: 0, trailSummary: 0 },
        teachingDiscipline: { totalReplies: 0, multiQuestionReplies: 0, overlongReplies: 0 },
      },
      journeys: [],
    });
    artifacts.writeFlagged("pressure-tutor-day0-abcd1234.json", { hits: ["你还差"] });

    await summarizeCommand([runId]);

    const summaryPath = join(artifacts.dir, "summary.md");
    expect(existsSync(summaryPath)).toBe(true);
    const content = readFileSync(summaryPath, "utf-8");
    expect(content).toContain(`# simlab run summary — ${runId}`);
    expect(content).toContain("pressure-tutor-day0-abcd1234.json");
  });

  it("errors cleanly when the run has no metrics.json", async () => {
    const errorSpy: string[] = [];
    const originalError = console.error;
    console.error = (message: string) => errorSpy.push(message);
    try {
      await summarizeCommand(["run-does-not-exist"]);
    } finally {
      console.error = originalError;
    }
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
    expect(errorSpy.some((message) => message.includes("no metrics.json"))).toBe(true);
  });
});
