/**
 * Purpose: unit tests for the run-artifacts directory manager — jsonl append semantics,
 * metrics/flagged JSON writes, all against a real temp directory.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRunArtifacts } from "./artifacts";

let baseDir: string;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "breadcrumb-simlab-artifacts-"));
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

describe("createRunArtifacts", () => {
  it("creates the run directory and a flagged/ subdirectory", () => {
    const artifacts = createRunArtifacts(baseDir, "run-1");
    expect(existsSync(artifacts.dir)).toBe(true);
    expect(existsSync(artifacts.flaggedDir)).toBe(true);
  });

  it("writes one JSON value per line to the journey log, appending across calls", () => {
    const artifacts = createRunArtifacts(baseDir, "run-2");
    const log = artifacts.openJourneyLog(0);
    log.writeLine({ event: "a", value: 1 });
    log.writeLine({ event: "b", value: 2 });

    const lines = readFileSync(log.path, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toEqual({ event: "a", value: 1 });
    expect(JSON.parse(lines[1] as string)).toEqual({ event: "b", value: 2 });
  });

  it("writes metrics.json as pretty-printed JSON", () => {
    const artifacts = createRunArtifacts(baseDir, "run-3");
    artifacts.writeMetrics({ sessions: 4 });
    const content = readFileSync(join(artifacts.dir, "metrics.json"), "utf-8");
    expect(JSON.parse(content)).toEqual({ sessions: 4 });
  });

  it("writes a flagged sample file under flagged/", () => {
    const artifacts = createRunArtifacts(baseDir, "run-4");
    artifacts.writeFlagged("session-0-round-2.json", { reason: "pressure-lexicon" });
    const content = readFileSync(join(artifacts.flaggedDir, "session-0-round-2.json"), "utf-8");
    expect(JSON.parse(content)).toEqual({ reason: "pressure-lexicon" });
  });
});
