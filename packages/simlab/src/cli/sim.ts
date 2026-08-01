#!/usr/bin/env node
/**
 * Purpose: CLI entry point. Bare `sim` (or `sim run`) launches N parallel simulated sessions
 * against DeepSeek and writes artifacts/<runId>/; `sim gold` and `sim summarize` (T4/T6)
 * dispatch from here too.
 * Main exports: none — this is a script entry, run via `pnpm --filter @breadcrumb/simlab sim`.
 */
import { runCommand } from "./runCommand";

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (subcommand === undefined || subcommand.startsWith("--")) {
    await runCommand(process.argv.slice(2));
    return;
  }
  if (subcommand === "run") {
    await runCommand(rest);
    return;
  }
  console.error(`simlab: unknown subcommand "${subcommand}" (known: run, gold, summarize)`);
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
