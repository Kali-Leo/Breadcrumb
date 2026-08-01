#!/usr/bin/env node
/**
 * Purpose: CLI entry point. Bare `sim` (or `sim run`) launches N parallel simulated sessions
 * against DeepSeek and writes artifacts/<runId>/; `sim gold` and `sim summarize` (T4/T6)
 * dispatch from here too.
 * Main exports: none — this is a script entry, run via `pnpm --filter @breadcrumb/simlab sim`.
 */
import { goldCommand } from "./goldCommand";
import { recoveryCommand } from "./recoveryCommand";
import { runCommand } from "./runCommand";

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
    case "gold":
      await goldCommand();
      return;
    case "recovery":
      await recoveryCommand();
      return;
    // "summarize" is added in spec 013 T6.
    default:
      console.error(`simlab: unknown subcommand "${subcommand}" (known: run, gold, recovery)`);
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
