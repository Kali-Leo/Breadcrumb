/**
 * Purpose: manages one run's artifacts directory (packages/simlab/artifacts/<runId>/,
 * gitignored) — append-only journey-*.jsonl writers, a flagged/ folder for anomaly samples,
 * and the final metrics.json / gold-baseline.json / recovery-result.json / summary.md writes.
 * This directory IS the interface the Claude reviewer and `sim summarize` consume (see
 * docs/testing/simlab-评审协议.md and src/cli/README.md for the full schema).
 * Main exports: createRunArtifacts, RunArtifacts, JourneyLogWriter.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface JourneyLogWriter {
  path: string;
  /** Appends one JSON-serializable record as a line (JSONL: one JSON value per line). */
  writeLine(record: unknown): void;
}

export interface RunArtifacts {
  runId: string;
  dir: string;
  flaggedDir: string;
  openJourneyLog(journeyIndex: number): JourneyLogWriter;
  writeMetrics(metrics: unknown): void;
  writeJson(fileName: string, content: unknown): void;
  writeFlagged(name: string, content: unknown): void;
}

export function createRunArtifacts(baseDir: string, runId: string): RunArtifacts {
  const dir = join(baseDir, runId);
  const flaggedDir = join(dir, "flagged");
  mkdirSync(dir, { recursive: true });
  mkdirSync(flaggedDir, { recursive: true });

  function writeJson(fileName: string, content: unknown): void {
    writeFileSync(join(dir, fileName), `${JSON.stringify(content, null, 2)}\n`);
  }

  return {
    runId,
    dir,
    flaggedDir,
    openJourneyLog(journeyIndex) {
      const path = join(dir, `journey-${journeyIndex}.jsonl`);
      writeFileSync(path, "");
      return {
        path,
        writeLine(record) {
          appendFileSync(path, `${JSON.stringify(record)}\n`);
        },
      };
    },
    writeMetrics(metrics) {
      writeJson("metrics.json", metrics);
    },
    writeJson,
    writeFlagged(name, content) {
      writeFileSync(join(flaggedDir, name), `${JSON.stringify(content, null, 2)}\n`);
    },
  };
}
