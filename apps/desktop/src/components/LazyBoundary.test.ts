/**
 * Purpose: unit tests for LazyBoundary — the contract that keeps a chunk that never arrives
 * from emptying #root. Drives the class the way React does (getDerivedStateFromProps, then
 * render; getDerivedStateFromError plus componentDidCatch when a child throws) rather than
 * through a DOM, because this project has no jsdom.
 */
import { createElement, type ReactNode, Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const degradeSilently = vi.fn();
vi.mock("../lib/platform/failureLog", () => ({ degradeSilently }));

const { LazyBoundary } = await import("./LazyBoundary");

type Boundary = InstanceType<typeof LazyBoundary>;

type Props = { resetKey: string; children: ReactNode };

const CHILD = createElement("div", null, "the view");

/** One React render pass: derive state from the incoming props, then render. */
function render(instance: Boundary, props: Props): ReactNode {
  Object.assign(instance, { props });
  const derived = LazyBoundary.getDerivedStateFromProps(props, instance.state);
  if (derived !== null) Object.assign(instance.state, derived);
  return instance.render();
}

/** What React does when a descendant throws — a lazy() chunk that failed to download. */
function chunkFailed(instance: Boundary, error: Error): void {
  Object.assign(instance.state, LazyBoundary.getDerivedStateFromError());
  instance.componentDidCatch(error);
}

function mounted(resetKey: string): Boundary {
  const props: Props = { resetKey, children: CHILD };
  const instance = new LazyBoundary(props);
  render(instance, props);
  return instance;
}

afterEach(() => {
  degradeSilently.mockReset();
});

describe("LazyBoundary", () => {
  it("suspends its children while the chunk is on the way", () => {
    const tree = render(new LazyBoundary({ resetKey: "map", children: CHILD }), {
      resetKey: "map",
      children: CHILD,
    });

    expect(tree).toMatchObject({ type: Suspense, props: { fallback: null, children: CHILD } });
  });

  it("renders nothing at all once the chunk failed — no message, no retry button", () => {
    const instance = mounted("map");
    chunkFailed(instance, new TypeError("Failed to fetch dynamically imported module"));

    expect(render(instance, { resetKey: "map", children: CHILD })).toBeNull();
  });

  it("records the failure in ai_failures under the lazy-chunk purpose", () => {
    const error = new TypeError("Failed to fetch dynamically imported module");
    chunkFailed(mounted("map"), error);

    expect(degradeSilently).toHaveBeenCalledWith("lazy-chunk", error);
  });

  it("keeps the region blank while the same key is asked for again", () => {
    const instance = mounted("map");
    chunkFailed(instance, new Error("chunk gone"));

    expect(render(instance, { resetKey: "map", children: CHILD })).toBeNull();
    expect(render(instance, { resetKey: "map", children: CHILD })).toBeNull();
  });

  it("retries on the next view switch, and stays working when that one arrives", () => {
    const instance = mounted("map");
    chunkFailed(instance, new Error("chunk gone"));

    expect(render(instance, { resetKey: "chat", children: CHILD })).toMatchObject({
      type: Suspense,
    });
    // Back to the view that failed: a new key each way, so it tries the network again too.
    expect(render(instance, { resetKey: "map", children: CHILD })).toMatchObject({
      type: Suspense,
    });
  });

  it("does not blank a sibling region: each boundary carries its own failure", () => {
    const view = mounted("map");
    const overlay = mounted("focus");
    chunkFailed(view, new Error("chunk gone"));

    expect(render(view, { resetKey: "map", children: CHILD })).toBeNull();
    expect(render(overlay, { resetKey: "focus", children: CHILD })).toMatchObject({
      type: Suspense,
    });
  });
});
