/**
 * Purpose: keeps a chunk that never arrives from taking the whole application with it.
 *
 * Every view below the shell is code-split, so opening one is a network request. When that
 * request fails — offline with the chunk not yet cached, or a deploy that moved it — React's
 * lazy() rejects, and with no boundary above it React 19 unmounts the entire tree: #root goes
 * empty, sidebar and all. This is that boundary, one per lazy region, so a missing chunk
 * costs exactly the region that needed it.
 *
 * It renders nothing on failure — no apology, no retry button. The learner asked for a page
 * and the page is not there; a line of red text would only name a problem they cannot act on,
 * and the sidebar they came from is still under their hand. What does happen is a row in
 * ai_failures, which is where the developer audit looks.
 *
 * `resetKey` is what makes the next attempt possible: change it (the shell passes the current
 * view) and the boundary clears, so leaving a broken page and coming back tries the network
 * again rather than staying blank forever. lazyViews.ts does the other half — React.lazy
 * remembers a rejection for good, so the loader there swaps in a fresh lazy() on failure.
 *
 * Main exports: LazyBoundary.
 */
import { Component, type ReactNode, Suspense } from "react";
import { degradeSilently } from "../lib/platform/failureLog";

/** Nothing, deliberately: a view is a whole screen, and a spinner or a word in the moment
 * before it arrives would be a new thing on screen that was never there before. The same
 * answer serves the failure, for the reason in the header. */
const NOTHING_YET = null;

type LazyBoundaryProps = { resetKey: string; children: ReactNode };
type LazyBoundaryState = { failedKey: string; failed: boolean };

export class LazyBoundary extends Component<LazyBoundaryProps, LazyBoundaryState> {
  state: LazyBoundaryState = { failedKey: this.props.resetKey, failed: false };

  /** A new resetKey means a different region (or the same one re-entered), so whatever failed
   * last time is no longer what is being asked for. Clearing here rather than in an effect
   * means the retry happens in the very render that changed the key. */
  static getDerivedStateFromProps(
    props: LazyBoundaryProps,
    state: LazyBoundaryState,
  ): LazyBoundaryState | null {
    if (props.resetKey === state.failedKey) return null;
    return { failedKey: props.resetKey, failed: false };
  }

  static getDerivedStateFromError(): Partial<LazyBoundaryState> {
    return { failed: true };
  }

  /** The one durable trace: the console line for a dev session, and an ai_failures row for
   * the audit that starts every work session. */
  componentDidCatch(error: Error): void {
    void degradeSilently("lazy-chunk", error);
  }

  render(): ReactNode {
    if (this.state.failed) return NOTHING_YET;
    return <Suspense fallback={NOTHING_YET}>{this.props.children}</Suspense>;
  }
}
