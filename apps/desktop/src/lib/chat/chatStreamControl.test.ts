/**
 * Purpose: unit tests for the per-conversation stop-generation registry — abort targets only
 * its own conversation, a stale controller cannot unregister a newer one, and isAbortError
 * recognizes the normalized abort shape.
 */
import { describe, expect, it } from "vitest";
import {
  abortStreamControl,
  beginStreamControl,
  endStreamControl,
  isAbortError,
} from "./chatStreamControl";

describe("stream control registry", () => {
  it("aborts only the addressed conversation", () => {
    const controllerA = beginStreamControl("conversation-a");
    const controllerB = beginStreamControl("conversation-b");
    if (controllerA === null || controllerB === null) throw new Error("both rounds must arm");

    abortStreamControl("conversation-a");

    expect(controllerA.signal.aborted).toBe(true);
    expect(controllerB.signal.aborted).toBe(false);
    endStreamControl("conversation-a", controllerA);
    endStreamControl("conversation-b", controllerB);
  });

  it("is a no-op for a conversation with nothing in flight", () => {
    expect(() => abortStreamControl("conversation-idle")).not.toThrow();
  });

  it("a stale round ending late does not unregister the newer round's controller", () => {
    const staleController = beginStreamControl("conversation-a");
    if (staleController === null) throw new Error("the first round must get a controller");
    // The stale round is unregistered the way a finished round is, and the next one arms.
    endStreamControl("conversation-a", staleController);
    const newerController = beginStreamControl("conversation-a");
    if (newerController === null) throw new Error("a freed conversation must arm again");

    endStreamControl("conversation-a", staleController);
    abortStreamControl("conversation-a");

    expect(newerController.signal.aborted).toBe(true);
    expect(staleController.signal.aborted).toBe(false);
    endStreamControl("conversation-a", newerController);
  });

  it("refuses a second round for a conversation that is already streaming", () => {
    // Regression: the overwrite left the FIRST round's controller unreachable, so its stop
    // button aborted the newcomer and the original stream ran on until the provider stopped.
    const running = beginStreamControl("conversation-busy");
    if (running === null) throw new Error("the first round must get a controller");

    expect(beginStreamControl("conversation-busy")).toBeNull();

    abortStreamControl("conversation-busy");
    expect(running.signal.aborted).toBe(true);
    endStreamControl("conversation-busy", running);
    expect(beginStreamControl("conversation-busy")).not.toBeNull();
    abortStreamControl("conversation-busy");
  });
});

describe("isAbortError", () => {
  it("recognizes DOMException AbortError (the client's normalized shape)", () => {
    expect(isAbortError(new DOMException("stopped", "AbortError"))).toBe(true);
  });

  it("recognizes a plain Error carrying the AbortError name", () => {
    const error = new Error("stopped");
    error.name = "AbortError";
    expect(isAbortError(error)).toBe(true);
  });

  it("rejects ordinary errors and non-errors", () => {
    expect(isAbortError(new Error("HTTP 500"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});
