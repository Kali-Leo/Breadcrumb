/**
 * Purpose: a ceiling stated the way most services state one — so many requests per window — kept
 * the way the rest of this layer keeps its limits: by not making the call, never by sleeping until
 * the call is allowed. iTunes is the case that needs it, and it is also the case that proved the
 * point. Writing it first as arXiv's hard three-second gap made every restock with three podcast
 * charts due wait fifteen seconds for nothing (the 30-day simulation went from 26 seconds to over
 * its three-minute budget), and any sleeping version stalls a reader whose clock the caller
 * controls. A poll that finds the window full simply contributes nothing this round, which is what
 * a poll does when it is out of budget, in backoff or switched off.
 * Main exports: RequestRateWindow.
 */

export interface RequestRateWindowOptions {
  /** How many requests may start inside one window. */
  maximumRequests: number;
  windowMilliseconds: number;
  now?: () => number;
}

export class RequestRateWindow {
  private readonly maximumRequests: number;
  private readonly windowMilliseconds: number;
  private readonly now: () => number;
  /** Start instants of the requests still inside the window, oldest first. */
  private startedAt: number[] = [];

  constructor(options: RequestRateWindowOptions) {
    this.maximumRequests = Math.max(1, options.maximumRequests);
    this.windowMilliseconds = Math.max(0, options.windowMilliseconds);
    this.now = options.now ?? (() => Date.now());
  }

  private forgetExpired(at: number): void {
    const cutoff = at - this.windowMilliseconds;
    while (this.startedAt.length > 0 && (this.startedAt[0] ?? 0) <= cutoff) this.startedAt.shift();
  }

  /** How many more requests the window has room for right now. */
  remaining(): number {
    this.forgetExpired(this.now());
    return Math.max(0, this.maximumRequests - this.startedAt.length);
  }

  /**
   * Claims one request when the window has room, and says so. False means the caller must not make
   * the request at all — there is nothing to wait for and nothing to retry inside this poll.
   * A claimed request is spent whether or not it goes on to succeed: the service saw it either way.
   */
  tryAcquire(): boolean {
    const at = this.now();
    this.forgetExpired(at);
    if (this.startedAt.length >= this.maximumRequests) return false;
    this.startedAt.push(at);
    return true;
  }
}
