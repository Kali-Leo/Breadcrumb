/**
 * Purpose: parses the `sim run` CLI flags (--journeys/--workers/--days/--budgetCny),
 * defaulting per spec 013 T3 (2 journeys / 2 workers / 14 virtual days / ¥5 budget).
 * Main exports: parseRunFlags, RunFlags.
 */
export interface RunFlags {
  journeys: number;
  workers: number;
  days: number;
  budgetCny: number;
}

const DEFAULTS: RunFlags = { journeys: 2, workers: 2, days: 14, budgetCny: 5 };

export function parseRunFlags(argv: readonly string[]): RunFlags {
  const flags: RunFlags = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      index += 1;
      return argv[index];
    };
    switch (arg) {
      case "--journeys":
        flags.journeys = Number(value());
        break;
      case "--workers":
        flags.workers = Number(value());
        break;
      case "--days":
        flags.days = Number(value());
        break;
      case "--budgetCny":
        flags.budgetCny = Number(value());
        break;
      default:
        break;
    }
  }
  return flags;
}
