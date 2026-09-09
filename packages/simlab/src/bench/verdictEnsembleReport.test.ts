/**
 * Purpose: guards the comparison table's two promises — the false-support column comes before
 * accuracy (the decision is made on it), and the price of caution is printed rather than hidden.
 * A renderer test, so a column silently dropped or reordered fails here instead of in a report
 * someone then reads the wrong way round.
 */
import { describe, expect, it } from "vitest";
import type { EnsembleRow } from "./verdictEnsemble";
import { renderEnsembleReport } from "./verdictEnsembleReport";

function row(overrides: Partial<EnsembleRow> = {}): EnsembleRow {
  return {
    purpose: "factcheck-verdict-quote",
    config: "全票 3 模型",
    rule: "unanimous",
    models: ["a", "b", "c"],
    items: 200,
    callsPerClaim: 3,
    missingVotes: 0,
    checks: {
      verdictAccuracy: 0.9,
      falseSupportRate: 0.02,
      hardFalseSupportRate: 0.021,
      abstentionRate: 0.4,
      abstentionPrecision: 0.8,
      abstentionRecall: 0.95,
      supportRecall: 0.94,
    },
    latencySequentialP50Ms: 4600,
    latencyParallelP50Ms: 2200,
    ...overrides,
  };
}

describe("renderEnsembleReport", () => {
  it("puts false support before accuracy, because that is the column decided on", () => {
    const report = renderEnsembleReport([row()], "run-1");
    const heading = report.split("\n").find((line) => line.includes("假阳性")) ?? "";
    expect(heading.indexOf("假阳性")).toBeLessThan(heading.indexOf("准确率"));
  });

  it("prints the correct citations caution cost us, as a share of the gold supports", () => {
    // supportRecall 0.94 → 6% of the real supports were never shown to the learner.
    expect(renderEnsembleReport([row()], "run-1")).toContain("6.0%");
  });

  it("shows an em dash for a metric this configuration never reported", () => {
    const report = renderEnsembleReport([row({ checks: { verdictAccuracy: 1 } })], "run-1");
    expect(report).toContain("—");
  });

  it("names the missing votes rather than letting them pass as agreement", () => {
    const report = renderEnsembleReport([row({ missingVotes: 7 })], "run-1");
    expect(report).toContain("缺票");
    expect(report).toContain("全票 3 模型 7");
  });

  it("reports the quote columns only for a configuration that asked for a quote", () => {
    const plain = renderEnsembleReport([row({ rule: "single", config: "model-a" })], "run-1");
    expect(plain).not.toContain("锚点校验");
    const gated = renderEnsembleReport(
      [
        row({
          rule: "single",
          config: "model-a",
          checks: { quoteGrounded: 0.97, gateDowngrade: 0.03, rawFalseSupportRate: 0.05 },
        }),
      ],
      "run-1",
    );
    expect(gated).toContain("锚点校验");
    expect(gated).toContain("97.0%");
  });

  it("groups the rows by configuration, one section each", () => {
    const report = renderEnsembleReport([row(), row({ purpose: "factcheck-verdict" })], "run-1");
    expect(report).toContain("## factcheck-verdict-quote");
    expect(report).toContain("## factcheck-verdict");
  });
});
