#!/usr/bin/env node
/**
 * Purpose: CLI entry point. Bare `sim` (or `sim run`) launches N parallel simulated journeys
 * against DeepSeek and writes artifacts/<runId>/; `sim bench` measures every configured
 * provider's model on every AI purpose the product has; `sim ensemble <dir>` re-reads a finished
 * bench run and combines several judges' verdicts by vote; `sim gold`/`sim recovery` run
 * on-demand evals; `sim summarize <runId>` aggregates a run's artifacts into summary.md.
 * Main exports: none — this is a script entry, run via `pnpm --filter @breadcrumb/simlab sim`.
 */
import { benchCommand } from "./benchCommand";
import { ensembleCommand } from "./ensembleCommand";
import { goldCommand } from "./goldCommand";
import { recoveryCommand } from "./recoveryCommand";
import { runCommand } from "./runCommand";
import { summarizeCommand } from "./summarizeCommand";

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (subcommand === undefined || subcommand.startsWith("--")) {
    await runCommand(process.argv.slice(2));
    return;
  }
  switch (subcommand) {
    case "run":
      await runCommand(rest);
      return;
    case "bench":
      await benchCommand(rest);
      return;
    case "ensemble":
      ensembleCommand(rest);
      return;
    case "gold":
      await goldCommand();
      return;
    case "recovery":
      await recoveryCommand();
      return;
    case "summarize":
      await summarizeCommand(rest);
      return;
    default:
      console.error(
        `simlab: unknown subcommand "${subcommand}" (known: run, bench, ensemble, gold, recovery, summarize)`,
      );
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
