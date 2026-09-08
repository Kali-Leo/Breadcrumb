/**
 * Purpose: parses the `sim bench` flags. Defaults are the full suite against every model a
 * key was found for, at four in flight and a ¥20 ceiling — enough for the whole suite on both
 * DeepSeek models several times over, and small enough that a mistake is a mistake and not an
 * incident.
 * Main exports: parseBenchFlags, BenchFlags.
 */
export interface BenchFlags {
  /** Only these purposes; empty = all of them. */
  purposes: string[];
  /** Only these model ids ("<provider>:<model>"); empty = every model with a key. */
  models: string[];
  /** At most this many scenarios per purpose; undefined = no cap. */
  limit: number | undefined;
  workers: number;
  budgetCny: number;
  /** Print the cost estimate and the roster, then stop without sending anything. */
  dryRun: boolean;
}

const DEFAULTS: BenchFlags = {
  purposes: [],
  models: [],
  limit: undefined,
  workers: 4,
  budgetCny: 20,
  dryRun: false,
};

function list(value: string | undefined): string[] {
  if (value === undefined) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function parseBenchFlags(argv: readonly string[]): BenchFlags {
  const flags: BenchFlags = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = (): string | undefined => {
      index += 1;
      return argv[index];
    };
    switch (arg) {
      case "--purposes":
        flags.purposes = list(value());
        break;
      case "--models":
        flags.models = list(value());
        break;
      case "--limit": {
        const parsed = Number(value());
        flags.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
        break;
      }
      case "--workers":
        flags.workers = Math.max(1, Number(value()) || DEFAULTS.workers);
        break;
      case "--budgetCny":
        flags.budgetCny = Math.max(0, Number(value()) || DEFAULTS.budgetCny);
        break;
      case "--dry-run":
        flags.dryRun = true;
        break;
      default:
        break;
    }
  }
  return flags;
}
