/**
 * Purpose: the deadline a discovery card's cover picture is given (spec 053 §6). An <img> that
 * cannot be fetched fires `error` and the card falls back to its text-forward layout — but a host
 * that accepts the connection and then never answers fires nothing at all, and the card is left
 * holding an empty grey box for the rest of the session (spec 053 T10b). This is the clock that
 * turns that silence into the same fallback, kept out of the component so it can be checked
 * without a DOM.
 * Main exports: COVER_LOAD_TIMEOUT_MILLISECONDS, watchCoverLoad, CoverLoadWatch.
 */

/**
 * How long a picture may take before the card gives up on it. Long enough that a slow but real
 * picture still arrives on a bad connection, short enough that a reader scrolling past does not
 * sit in front of a grey box wondering whether something is broken.
 */
export const COVER_LOAD_TIMEOUT_MILLISECONDS = 8_000;

export interface CoverLoadWatch {
  /** Starts the clock — called when the browser actually starts fetching, which for a lazily
   * loaded picture is when the card comes near the screen, not when it is created. */
  start(): void;
  /** The <img> reported a load. A zero natural width is a load event over nothing (a page served
   * where a picture was promised, a truncated file): the box would be blank, so it counts as a
   * picture that never arrived. */
  loaded(naturalWidth: number): void;
  /** The <img> reported an error. */
  failed(): void;
  /** The card is gone, or the address changed: disarm without deciding anything. */
  cancel(): void;
}

/**
 * Watches one attempt at one address and calls `giveUp` exactly once, if at all — on the error
 * event, on a load that brought no picture, or on the deadline passing with neither. Whatever
 * happens afterwards is ignored: a picture that finally arrives after the card has been redrawn
 * as a text card would only make the grid jump under the reader.
 */
export function watchCoverLoad(
  giveUp: () => void,
  timeoutMilliseconds: number = COVER_LOAD_TIMEOUT_MILLISECONDS,
): CoverLoadWatch {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const disarm = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const settle = (unavailable: boolean): void => {
    if (settled) return;
    settled = true;
    disarm();
    if (unavailable) giveUp();
  };

  return {
    start() {
      if (settled || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        settle(true);
      }, timeoutMilliseconds);
    },
    loaded(naturalWidth: number) {
      settle(naturalWidth === 0);
    },
    failed() {
      settle(true);
    },
    cancel() {
      settled = true;
      disarm();
    },
  };
}
