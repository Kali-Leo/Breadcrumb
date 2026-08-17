/**
 * Purpose: a hard, host-wide gap between requests, for the services whose terms state one — arXiv
 * asks for no more than one request every three seconds, and that limit belongs to the whole
 * client, not to one catalog entry, so the per-source ledger cannot express it. Requests queue up
 * and leave one at a time; the clock and the sleep are injected so tests do not wait in real time.
 * Main exports: RequestPacer.
 */

export interface RequestPacerOptions {
  minimumIntervalMilliseconds: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class RequestPacer {
  private readonly minimumIntervalMilliseconds: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  /** Serializes callers: each one waits for the previous to have started. */
  private queue: Promise<void> = Promise.resolve();
  private lastStartedAtMilliseconds: number | null = null;

  constructor(options: RequestPacerOptions) {
    this.minimumIntervalMilliseconds = options.minimumIntervalMilliseconds;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Runs the task once the gap has passed. A task that throws still counts as a request spent. */
  run<Result>(task: () => Promise<Result>): Promise<Result> {
    const started = this.queue.then(async () => {
      const previous = this.lastStartedAtMilliseconds;
      if (previous !== null) {
        const waitFor = previous + this.minimumIntervalMilliseconds - this.now();
        if (waitFor > 0) await this.sleep(waitFor);
      }
      this.lastStartedAtMilliseconds = this.now();
    });
    this.queue = started.then(
      () => undefined,
      () => undefined,
    );
    return started.then(task);
  }
}
