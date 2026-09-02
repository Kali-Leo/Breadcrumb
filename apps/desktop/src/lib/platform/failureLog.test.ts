/**
 * Purpose: unit tests for recordAiFailure and degradeSilently — the expected row shape
 * (Error vs plain thrown value), the console line every degradation still prints, and the
 * promise never rejecting even when the underlying repo write itself fails.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const recordMock = vi.fn();
vi.mock("./db", () => ({
  getRepos: vi.fn(async () => ({ aiFailures: { record: recordMock } })),
}));

const { degradeSilently, recordAiFailure } = await import("./failureLog");

afterEach(() => {
  recordMock.mockReset();
  vi.restoreAllMocks();
});

describe("recordAiFailure", () => {
  it("records an Error's message under the given purpose", async () => {
    recordMock.mockResolvedValueOnce(undefined);
    await recordAiFailure("interest", new Error("network blip"));

    expect(recordMock).toHaveBeenCalledTimes(1);
    const row = recordMock.mock.calls[0]?.[0];
    expect(row).toMatchObject({ purpose: "interest", message: "network blip" });
    expect(typeof row.id).toBe("string");
    expect(typeof row.created_at).toBe("string");
  });

  it("stringifies a non-Error thrown value", async () => {
    recordMock.mockResolvedValueOnce(undefined);
    await recordAiFailure("knowledge-edges", "plain string failure");

    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({ message: "plain string failure" });
  });

  it("never throws even when the repo write itself fails", async () => {
    recordMock.mockRejectedValueOnce(new Error("db locked"));
    await expect(recordAiFailure("trail", new Error("x"))).resolves.toBeUndefined();
  });
});

describe("degradeSilently", () => {
  it("warns on the console AND writes the ai_failures row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    recordMock.mockResolvedValueOnce(undefined);

    await degradeSilently("concept-doors", new Error("no doors"));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("concept-doors");
    expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
      purpose: "concept-doors",
      message: "no doors",
    });
  });

  it("still resolves when recording the failure itself fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    recordMock.mockRejectedValueOnce(new Error("db locked"));

    await expect(degradeSilently("embeddings", new Error("x"))).resolves.toBeUndefined();
  });
});
